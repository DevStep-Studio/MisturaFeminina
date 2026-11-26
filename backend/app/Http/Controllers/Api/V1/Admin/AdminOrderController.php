<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Admin\Services\TodayWorkService;
use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Marketing\Services\GoogleAnalyticsService;
use App\Domain\Orders\Services\OrderAfterSalesService;
use App\Domain\Orders\Services\OrderCostService;
use App\Domain\Orders\Services\OrderEmailService;
use App\Domain\Orders\Services\ProfitAndCostAnalyticsService;
use App\Domain\Payments\Services\PaymentService;
use App\Domain\Security\Services\AuditLogger;
use App\Domain\Shared\Enums\OrderStatus;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderReturn;
use App\Models\OrderStatusHistory;
use App\Models\Refund;
use App\Models\Shipment;
use App\Models\StoreSetting;
use App\Models\TrackingEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdminOrderController extends Controller
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly PaymentService $payments,
        private readonly AuditLogger $audit,
        private readonly TodayWorkService $todayWork,
        private readonly OrderAfterSalesService $afterSales,
        private readonly OrderCostService $orderCost,
        private readonly ProfitAndCostAnalyticsService $profitAnalytics,
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
                'items.variant.image',
                'items.product' => fn ($pq) => $pq->withTrashed()->with('images'),
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

        $canViewCostProfit = $request->user()?->hasPermission('reports.profit.view') ?? false;
        $orderSummary = $this->profitAnalytics->summarizeOrder($order, $canViewCostProfit);

        $payload = $order->toArray();
        $payload['items'] = $orderSummary['items'];
        $payload['returns'] = $orderSummary['returns'];
        if ($canViewCostProfit) {
            $payload['financial_summary'] = $orderSummary['financial_summary'];
        }

        return response()->json(['data' => $payload]);
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

            if ($newStatus->isRecognizedSale() && $order->paid_at === null) {
                $updates['paid_at'] = now();
            }

            $order->update($updates);

            if ($newStatus->isRecognizedSale() && ! $oldStatus->isRecognizedSale()) {
                $this->inventory->confirmDeduction($order);
                $this->orderCost->captureCostSnapshotForOrder($order);
            }

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
                } elseif ($order->paid_at !== null || in_array($oldStatus, [OrderStatus::Paid, OrderStatus::Preparing, OrderStatus::Shipped, OrderStatus::Delivered, OrderStatus::PartiallyRefunded], true)) {
                    $this->orderCost->processReturnOrRefund($order, [
                        'idempotency_key' => "admin_cancel:order:{$order->id}",
                        'return_type' => 'cancellation',
                        'restock_items' => in_array($oldStatus, [OrderStatus::Paid, OrderStatus::Preparing], true),
                        'financial_refund_cents' => 0,
                        'reason' => $validated['note'] ?? 'Cancelamento administrativo',
                    ], $request->user());
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

        $order = DB::transaction(function () use ($request, $id, $validated): Order {
            $order = Order::query()->with('shipment')->lockForUpdate()->findOrFail($id);
            $initialStatus = $order->status;
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

            $shipment->fill($updates);
            $trackingChanged = $shipment->isDirty(['carrier', 'tracking_code', 'tracking_url']);
            $shipment->save();

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

            $event = null;
            $lastEvent = $shipment->trackingEvents()->latest('id')->first();
            if (! empty($validated['tracking_description']) && ($lastEvent?->description !== $validated['tracking_description'] || $lastEvent?->location !== ($validated['tracking_location'] ?? null))) {
                $event = TrackingEvent::query()->create([
                    'shipment_id' => $shipment->id,
                    'occurred_at' => now(),
                    'status' => ! empty($validated['mark_delivered']) ? 'delivered' : (! empty($validated['mark_shipped']) ? 'in_transit' : 'updated'),
                    'location' => $validated['tracking_location'] ?? null,
                    'description' => $validated['tracking_description'],
                ]);
            }

            $this->audit->record('order.shipment_updated', $request->user(), 'order', $order->id, null, $updates, $request);

            if ($initialStatus === $order->status && ($trackingChanged || $event)) {
                app(OrderEmailService::class)->shipmentUpdated($order, 'shipment:'.$shipment->id.':'.hash('sha256', json_encode([$shipment->tracking_code, $shipment->tracking_url, $shipment->carrier, $event?->id], JSON_THROW_ON_ERROR)), $event?->description, $event?->location);
            }

            return $order;
        });

        return response()->json(['data' => $order->fresh(['shipment.trackingEvents', 'statusHistories'])]);
    }

    public function refund(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'amount_cents' => ['nullable', 'integer', 'min:0'],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'restock_items' => ['boolean'],
            'manual_confirmation' => ['boolean'],
            'idempotency_key' => ['nullable', 'string', 'max:120'],
            'items' => ['nullable', 'array'],
            'items.*.order_item_id' => ['required_with:items', 'integer'],
            'items.*.quantity' => ['required_with:items', 'integer', 'min:1'],
            'items.*.restock' => ['nullable', 'boolean'],
        ]);

        $order = Order::query()->with(['latestPayment', 'items'])->findOrFail($id);
        $payment = $order->latestPayment;

        if (! $payment || ! in_array($payment->status, [PaymentStatus::Approved, PaymentStatus::PartiallyRefunded], true)) {
            return response()->json(['message' => 'Este pedido não possui pagamento aprovado elegível para reembolso.'], 422);
        }

        $idempotencyKey = trim((string) ($validated['idempotency_key'] ?? $request->header('X-Idempotency-Key') ?? ''));
        if ($idempotencyKey !== '') {
            $existingReturn = OrderReturn::query()->where('idempotency_key', $idempotencyKey)->first();
            if ($existingReturn && (int) $existingReturn->order_id === (int) $order->id) {
                return response()->json([
                    'data' => $order->fresh(['payments', 'refunds', 'statusHistories', 'returns.items']),
                    'idempotent_replay' => true,
                ]);
            }
        }

        $returnItemsInput = is_array($validated['items'] ?? null) ? $validated['items'] : [];
        $alreadyRefunded = (int) $order->refunds()->where('status', 'completed')->sum('amount_cents');
        $remainingRefundable = max(0, $payment->gross_amount_cents - $alreadyRefunded);

        if (array_key_exists('amount_cents', $validated) && $validated['amount_cents'] !== null) {
            $amountCents = (int) $validated['amount_cents'];
        } elseif ($returnItemsInput !== []) {
            $itemsMap = $order->items->keyBy('id');
            $estimatedAmount = 0;
            foreach ($returnItemsInput as $entry) {
                /** @var OrderItem|null $oi */
                $oi = $itemsMap->get((int) $entry['order_item_id']);
                if ($oi && (int) $oi->quantity > 0) {
                    $availQty = max(0, (int) $oi->quantity - (int) $oi->returned_qty);
                    $qty = min($availQty, (int) $entry['quantity']);
                    $netTotal = $oi->effectiveNetRevenueCents();
                    $remainingRev = max(0, $netTotal - (int) $oi->returned_revenue_cents);
                    $estimatedAmount += $qty === $availQty
                        ? $remainingRev
                        : min($remainingRev, (int) round(($netTotal * $qty) / (int) $oi->quantity));
                }
            }
            $amountCents = min($remainingRefundable, $estimatedAmount);
        } else {
            $amountCents = $remainingRefundable;
        }

        if ($amountCents > $remainingRefundable) {
            return response()->json(['message' => 'O valor do reembolso não pode ultrapassar o saldo ainda passível de estorno.'], 422);
        }

        $manualConfirmation = (bool) ($validated['manual_confirmation'] ?? false);
        $externalRefundId = ($amountCents > 0 && ! $manualConfirmation)
            ? $this->payments->refundPayment($payment, $amountCents)
            : ($manualConfirmation ? 'manual_erp_reconciled' : null);
        $isFull = ($alreadyRefunded + $amountCents) >= $payment->gross_amount_cents && $returnItemsInput === [];

        DB::transaction(function () use ($request, $order, $payment, $amountCents, $alreadyRefunded, $validated, $externalRefundId, $isFull, $returnItemsInput, $idempotencyKey): void {
            $refund = null;
            if ($amountCents > 0) {
                $refund = Refund::query()->create([
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
                    'status' => ($alreadyRefunded + $amountCents) >= $payment->gross_amount_cents
                        ? PaymentStatus::Refunded
                        : PaymentStatus::PartiallyRefunded,
                ]);
            }

            $oldStatus = $order->status;
            $returnType = $returnItemsInput !== []
                ? 'partial_return'
                : ($isFull ? 'full_return' : 'financial_refund');

            $this->orderCost->processReturnOrRefund($order, [
                'idempotency_key' => $idempotencyKey !== '' ? $idempotencyKey : null,
                'return_type' => $returnType,
                'restock_items' => (bool) ($validated['restock_items'] ?? false),
                'financial_refund_cents' => $amountCents,
                'reason' => $validated['reason'],
                'refund_id' => $refund?->id,
                'items' => $returnItemsInput,
            ], $request->user());

            $updatedStatus = $order->fresh()?->status ?? $oldStatus;
            if ($updatedStatus !== $oldStatus) {
                OrderStatusHistory::query()->create([
                    'order_id' => $order->id,
                    'user_id' => $request->user()?->id,
                    'from_status' => $oldStatus->value,
                    'to_status' => $updatedStatus->value,
                    'note' => 'Reembolso/devolução processado: '.$validated['reason'],
                ]);
            }
        });

        $this->audit->record('order.refunded', $request->user(), 'order', $order->id, null, [
            'amount_cents' => $amountCents,
            'reason' => $validated['reason'],
            'external_refund_id' => $externalRefundId,
            'items_count' => count($returnItemsInput),
        ], $request);

        $freshOrder = $order->fresh(['payments', 'refunds', 'statusHistories', 'returns.items', 'items']);
        if ($amountCents > 0 && $freshOrder !== null) {
            $latestRefundId = $freshOrder->refunds->sortByDesc('id')->first()?->id;
            app(GoogleAnalyticsService::class)
                ->recordOrderRefund($freshOrder, $amountCents, $latestRefundId);
        }

        return response()->json(['data' => $freshOrder]);
    }

    public function backfillItemCost(Request $request, int $orderItemId): JsonResponse
    {
        $validated = $request->validate([
            'unit_cost_cents' => ['required', 'integer', 'min:0'],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ]);

        /** @var OrderItem $item */
        $item = OrderItem::query()->findOrFail($orderItemId);
        $updated = $this->orderCost->backfillOrderItemCost(
            $item,
            (int) $validated['unit_cost_cents'],
            (string) $validated['reason'],
            $request->user(),
        );

        return response()->json([
            'data' => [
                'order_item_id' => $updated->id,
                'order_id' => $updated->order_id,
                'unit_cost_cents_snapshot' => $updated->unit_cost_cents_snapshot,
                'cost_source' => $updated->cost_source,
                'cost_backfilled_at' => $updated->cost_backfilled_at?->toIso8601String(),
            ],
        ]);
    }

    public function packingList(int $id): JsonResponse
    {
        $order = Order::query()->with(['items', 'shipment'])->findOrFail($id);

        $rawAddress = (array) ($order->shipping_address_snapshot ?? []);
        $recipientName = $rawAddress['recipient_name'] ?? $rawAddress['name'] ?? $order->customer_name;

        $cep = (string) ($rawAddress['cep'] ?? $rawAddress['zipcode'] ?? '');
        $digitsCep = preg_replace('/\D/', '', $cep);
        $formattedCep = strlen($digitsCep) === 8
            ? substr($digitsCep, 0, 5).'-'.substr($digitsCep, 5, 3)
            : $cep;

        $normalizedAddress = [
            'recipient_name' => (string) $recipientName,
            'street' => (string) ($rawAddress['street'] ?? $rawAddress['logradouro'] ?? ''),
            'number' => (string) ($rawAddress['number'] ?? $rawAddress['numero'] ?? ''),
            'complement' => isset($rawAddress['complement']) && $rawAddress['complement'] !== '' ? (string) $rawAddress['complement'] : (isset($rawAddress['complemento']) && $rawAddress['complemento'] !== '' ? (string) $rawAddress['complemento'] : null),
            'neighborhood' => (string) ($rawAddress['neighborhood'] ?? $rawAddress['bairro'] ?? ''),
            'city' => (string) ($rawAddress['city'] ?? $rawAddress['cidade'] ?? ''),
            'state' => (string) ($rawAddress['state'] ?? $rawAddress['uf'] ?? ''),
            'cep' => $formattedCep,
        ];

        $storeName = StoreSetting::where('key', 'store_name')->value('value')['val'] ?? 'Mistura Feminina Cosméticos';
        $senderAddress = StoreSetting::where('key', 'address')->value('value')['val'] ?? 'Av. Paulista, 1000 - Bela Vista';
        $senderOriginCep = StoreSetting::where('key', 'origin_cep')->value('value')['val'] ?? '01001-000';
        $senderCepDigits = preg_replace('/\D/', '', (string) $senderOriginCep);
        $formattedSenderCep = strlen($senderCepDigits) === 8
            ? substr($senderCepDigits, 0, 5).'-'.substr($senderCepDigits, 5, 3)
            : (string) $senderOriginCep;

        $sender = [
            'store_name' => $storeName,
            'address' => $senderAddress,
            'city' => 'São Paulo',
            'state' => 'SP',
            'cep' => $formattedSenderCep,
        ];

        $items = $order->items->map(function (OrderItem $item) {
            $sku = $item->sku_snapshot ?? $item->sku ?? null;
            $productName = $item->product_name_snapshot ?? $item->product_name ?? null;
            $variantName = $item->variant_name_snapshot ?? $item->variant_name ?? null;

            return [
                'id' => $item->id,
                'sku' => $sku ?: 'SKU não informado',
                'sku_snapshot' => $sku,
                'product_name' => $productName ?: 'Produto sem identificação',
                'product_name_snapshot' => $productName,
                'variant_name' => $variantName ?: 'Padrão',
                'variant_name_snapshot' => $variantName,
                'quantity' => $item->quantity,
                'weight_grams' => $item->weight_grams_snapshot ?? null,
                // Backward compatibility mappings:
                'name' => $productName ?: 'Produto sem identificação',
                'variant' => $variantName ?: 'Padrão',
                'qty' => $item->quantity,
            ];
        });

        $shipment = $order->shipment ? [
            'carrier' => $order->shipment->carrier,
            'service_name' => $order->shipment->service_name,
            'service_code' => $order->shipment->service_code,
            'tracking_code' => $order->shipment->tracking_code,
            'label_url' => $order->shipment->label_url,
            'label_status' => $order->shipment->label_status,
        ] : null;

        return response()->json([
            'data' => [
                'id' => $order->id,
                'order_number' => $order->order_number,
                'status' => $order->status,
                'created_at' => $order->created_at?->toIso8601String(),
                'customer_name' => $order->customer_name,
                'customer_phone' => $order->customer_phone,
                'shipping_address' => $normalizedAddress,
                'raw_shipping_address' => $rawAddress,
                'sender' => $sender,
                'shipping_service' => $order->shipping_service_snapshot,
                'shipment' => $shipment,
                'items' => $items,
                'total_units' => $order->items->sum('quantity'),
                'notes_customer' => $order->notes_customer,
            ],
        ]);
    }

    public function updateShippingAddress(Request $request, int $id): JsonResponse
    {
        $order = Order::query()->findOrFail($id);

        $validated = $request->validate([
            'recipient_name' => ['nullable', 'string', 'max:255'],
            'street' => ['required', 'string', 'max:255'],
            'number' => ['required', 'string', 'max:50'],
            'complement' => ['nullable', 'string', 'max:255'],
            'neighborhood' => ['nullable', 'string', 'max:255'],
            'city' => ['required', 'string', 'max:255'],
            'state' => ['required', 'string', 'max:2'],
            'cep' => ['required', 'string', 'regex:/^\d{5}-?\d{3}$/'],
        ]);

        $digits = preg_replace('/\D/', '', $validated['cep']);
        $formattedCep = substr($digits, 0, 5).'-'.substr($digits, 5, 3);
        $validated['cep'] = $formattedCep;

        $snapshot = array_merge((array) ($order->shipping_address_snapshot ?? []), $validated);
        $order->update(['shipping_address_snapshot' => $snapshot]);

        return response()->json([
            'data' => [
                'id' => $order->id,
                'shipping_address' => $snapshot,
            ],
            'message' => 'Endereço de entrega atualizado com sucesso.',
        ]);
    }
}
