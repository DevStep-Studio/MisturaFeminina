<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Admin\Services\TodayWorkService;
use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Orders\Services\OrderAfterSalesService;
use App\Domain\Payments\Services\PaymentService;
use App\Domain\Security\Services\AuditLogger;
use App\Domain\Shared\Enums\OrderStatus;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Http\Controllers\Controller;
use App\Mail\OrderStatusMail;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\Refund;
use App\Models\Shipment;
use App\Models\TrackingEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\Rule;

class AdminOrderController extends Controller
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly PaymentService $payments,
        private readonly AuditLogger $audit,
        private readonly TodayWorkService $todayWork,
        private readonly OrderAfterSalesService $afterSales,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $filter = (string) $request->query('filter', '');
        if ($filter === 'ship_today') {
            $query = $this->todayWork->shipTodayOrdersQuery();
        } elseif ($filter === 'issues') {
            $query = $this->todayWork->issueOrdersQuery();
        } else {
            $query = Order::query();
        }

        $query->with(['latestPayment', 'shipment'])
            ->withCount(['occurrences as open_occurrences_count' => fn ($oq) => $oq->whereNotIn('status', ['resolved', 'closed'])])
            ->latest('id');

        if ($request->filled('status')) {
            $query->where('status', (string) $request->query('status'));
        }
        if ($request->boolean('has_wholesale') || $filter === 'wholesale') {
            $query->whereHas('items', fn ($iq) => $iq->whereNotNull('wholesale_rule_id'));
        }
        if ($request->filled('search')) {
            $term = '%'.trim((string) $request->query('search')).'%';
            $query->where(function ($q) use ($term): void {
                $q->where('order_number', 'like', $term)
                    ->orWhere('customer_name', 'like', $term)
                    ->orWhere('customer_email', 'like', $term);
            });
        }

        return response()->json($query->paginate(20));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $order = Order::query()
            ->with([
                'items',
                'payments.events',
                'refunds',
                'statusHistories.user:id,name',
                'shipment.trackingEvents',
                'assistedOrder:id,order_code,created_by_user_id',
                'occurrences' => fn ($q) => $q->with(['assignedTo:id,name', 'createdBy:id,name', 'orderItem', 'notes.user:id,name']),
                'occurrenceNotes.user:id,name',
            ])
            ->findOrFail($id);

        $order->setAttribute('timeline', $this->afterSales->buildUnifiedTimeline(
            $order,
            $request->query('timeline_category') ? (string) $request->query('timeline_category') : null
        ));

        return response()->json(['data' => $order]);
    }

    public function updateStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::enum(OrderStatus::class)],
            'note' => ['nullable', 'string', 'max:500'],
            'notes_internal' => ['nullable', 'string', 'max:1000'],
        ]);

        $order = Order::query()->findOrFail($id);
        $oldStatus = $order->status;
        $newStatus = OrderStatus::from((string) $validated['status']);

        DB::transaction(function () use ($request, $order, $oldStatus, $newStatus, $validated): void {
            $updates = ['status' => $newStatus];
            if (array_key_exists('notes_internal', $validated)) {
                $updates['notes_internal'] = $validated['notes_internal'];
            }
            if ($newStatus === OrderStatus::Cancelled && $order->cancelled_at === null) {
                $updates['cancelled_at'] = now();
            }

            $order->update($updates);

            if ($oldStatus !== $newStatus) {
                OrderStatusHistory::query()->create([
                    'order_id' => $order->id,
                    'user_id' => $request->user()?->id,
                    'from_status' => $oldStatus->value,
                    'to_status' => $newStatus->value,
                    'note' => $validated['note'] ?? 'Alteração manual pelo administrador',
                ]);
            }

            if ($newStatus === OrderStatus::Cancelled) {
                if ($oldStatus === OrderStatus::PendingPayment || $oldStatus === OrderStatus::PaymentFailed) {
                    $this->inventory->releaseReservation($order, 'Pedido cancelado pelo admin');
                } elseif (in_array($oldStatus, [OrderStatus::Paid, OrderStatus::Preparing], true)) {
                    $this->inventory->restockConsumedOrder($order, $request->user(), 'Estorno de estoque por cancelamento administrativo');
                }
            }
        });

        $this->audit->record(
            'order.status_updated',
            $request->user(),
            'order',
            $order->id,
            ['status' => $oldStatus->value],
            ['status' => $newStatus->value, 'note' => $validated['note'] ?? null],
            $request,
        );

        if ($oldStatus !== $newStatus) {
            Mail::to($order->customer_email)->queue(new OrderStatusMail(
                $order->fresh(),
                'Atualização do pedido '.$order->order_number,
                'Status atualizado para: '.$newStatus->label().(! empty($validated['note']) ? ' — '.$validated['note'] : ''),
            ));
        }

        return response()->json(['data' => $order->fresh(['items', 'statusHistories', 'shipment'])]);
    }

    public function updateShipment(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'carrier' => ['nullable', 'string', 'max:80'],
            'service_name' => ['nullable', 'string', 'max:120'],
            'tracking_code' => ['nullable', 'string', 'max:120'],
            'tracking_url' => ['nullable', 'url', 'max:500'],
            'label_status' => ['nullable', Rule::in(['pending', 'generated', 'printed', 'cancelled'])],
            'tracking_description' => ['nullable', 'string', 'max:500'],
            'tracking_location' => ['nullable', 'string', 'max:160'],
            'mark_shipped' => ['boolean'],
            'mark_delivered' => ['boolean'],
        ]);

        $order = Order::query()->with('shipment')->findOrFail($id);
        $serviceSnapshot = $order->shipping_service_snapshot ?? [];

        /** @var Shipment $shipment */
        $shipment = $order->shipment ?: Shipment::query()->create([
            'order_id' => $order->id,
            'carrier' => $validated['carrier'] ?? ($serviceSnapshot['carrier'] ?? 'Transportadora'),
            'service_code' => (string) ($serviceSnapshot['service_code'] ?? 'PAC'),
            'service_name' => $validated['service_name'] ?? ($serviceSnapshot['service_name'] ?? 'Entrega'),
            'label_status' => 'pending',
            'weight_grams' => 500,
        ]);

        $updates = array_filter([
            'carrier' => $validated['carrier'] ?? null,
            'service_name' => $validated['service_name'] ?? null,
            'tracking_code' => $validated['tracking_code'] ?? null,
            'tracking_url' => $validated['tracking_url'] ?? null,
            'label_status' => $validated['label_status'] ?? null,
        ], fn ($v) => $v !== null);

        if (! empty($validated['mark_shipped']) && $shipment->shipped_at === null) {
            $updates['shipped_at'] = now();
            if ($order->status !== OrderStatus::Shipped && $order->status !== OrderStatus::Delivered) {
                $old = $order->status;
                $order->update(['status' => OrderStatus::Shipped]);
                OrderStatusHistory::query()->create([
                    'order_id' => $order->id,
                    'user_id' => $request->user()?->id,
                    'from_status' => $old->value,
                    'to_status' => OrderStatus::Shipped->value,
                    'note' => 'Pedido despachado (rastreio: '.($validated['tracking_code'] ?? $shipment->tracking_code ?? 'N/I').')',
                ]);
            }
        }

        if (! empty($validated['mark_delivered']) && $shipment->delivered_at === null) {
            $updates['delivered_at'] = now();
            if ($order->status !== OrderStatus::Delivered) {
                $old = $order->status;
                $order->update(['status' => OrderStatus::Delivered]);
                OrderStatusHistory::query()->create([
                    'order_id' => $order->id,
                    'user_id' => $request->user()?->id,
                    'from_status' => $old->value,
                    'to_status' => OrderStatus::Delivered->value,
                    'note' => 'Pedido marcado como entregue',
                ]);
            }
        }

        $shipment->update($updates);

        if (! empty($validated['tracking_description'])) {
            TrackingEvent::query()->create([
                'shipment_id' => $shipment->id,
                'occurred_at' => now(),
                'status' => ! empty($validated['mark_delivered']) ? 'delivered' : (! empty($validated['mark_shipped']) ? 'in_transit' : 'updated'),
                'location' => $validated['tracking_location'] ?? null,
                'description' => $validated['tracking_description'],
            ]);
        }

        $this->audit->record('order.shipment_updated', $request->user(), 'order', $order->id, null, $updates, $request);

        return response()->json(['data' => $order->fresh(['shipment.trackingEvents', 'statusHistories'])]);
    }

    public function refund(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'amount_cents' => ['nullable', 'integer', 'min:1'],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'restock_items' => ['boolean'],
        ]);

        $order = Order::query()->with('latestPayment')->findOrFail($id);
        $payment = $order->latestPayment;

        if (! $payment || ! in_array($payment->status, [PaymentStatus::Approved, PaymentStatus::PartiallyRefunded], true)) {
            return response()->json(['message' => 'Este pedido não possui pagamento aprovado elegível para reembolso.'], 422);
        }

        $amountCents = (int) ($validated['amount_cents'] ?? $payment->gross_amount_cents);
        if ($amountCents > $payment->gross_amount_cents) {
            return response()->json(['message' => 'O valor do reembolso não pode ultrapassar o valor pago.'], 422);
        }

        $externalRefundId = $this->payments->refundPayment($payment, $amountCents);
        $isFull = $amountCents >= $payment->gross_amount_cents;

        DB::transaction(function () use ($request, $order, $payment, $amountCents, $validated, $externalRefundId, $isFull): void {
            Refund::query()->create([
                'order_id' => $order->id,
                'payment_id' => $payment->id,
                'user_id' => $request->user()?->id,
                'external_refund_id' => $externalRefundId,
                'amount_cents' => $amountCents,
                'reason' => $validated['reason'],
                'status' => 'completed',
                'restock_items' => (bool) ($validated['restock_items'] ?? false),
            ]);

            $payment->update([
                'status' => $isFull ? PaymentStatus::Refunded : PaymentStatus::PartiallyRefunded,
            ]);

            if ($isFull) {
                $oldStatus = $order->status;
                $order->update(['status' => OrderStatus::Refunded]);
                OrderStatusHistory::query()->create([
                    'order_id' => $order->id,
                    'user_id' => $request->user()?->id,
                    'from_status' => $oldStatus->value,
                    'to_status' => OrderStatus::Refunded->value,
                    'note' => 'Reembolso processado: '.$validated['reason'],
                ]);
            }

            if (! empty($validated['restock_items'])) {
                $this->inventory->restockConsumedOrder($order, $request->user(), 'Estorno por reembolso: '.$validated['reason']);
            }
        });

        $this->audit->record('order.refunded', $request->user(), 'order', $order->id, null, [
            'amount_cents' => $amountCents,
            'reason' => $validated['reason'],
            'external_refund_id' => $externalRefundId,
        ], $request);

        return response()->json(['data' => $order->fresh(['payments', 'refunds', 'statusHistories'])]);
    }

    public function packingList(int $id): JsonResponse
    {
        $order = Order::query()->with(['items', 'shipment'])->findOrFail($id);

        return response()->json([
            'data' => [
                'order_number' => $order->order_number,
                'created_at' => $order->created_at?->toIso8601String(),
                'customer_name' => $order->customer_name,
                'customer_phone' => $order->customer_phone,
                'shipping_address' => $order->shipping_address_snapshot,
                'shipping_service' => $order->shipping_service_snapshot,
                'items' => $order->items,
                'notes_customer' => $order->notes_customer,
            ],
        ]);
    }
}
