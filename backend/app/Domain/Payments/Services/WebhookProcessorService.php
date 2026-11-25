<?php

declare(strict_types=1);

namespace App\Domain\Payments\Services;

use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Orders\Services\OrderCostService;
use App\Domain\Shared\Enums\OrderStatus;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Mail\OrderStatusMail;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\Payment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class WebhookProcessorService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly OrderCostService $orderCost,
    ) {}

    public function applyPaymentTransition(Payment $payment, PaymentStatus $newStatus, int $feeCents = 0, string $note = ''): void
    {
        $notifyPayload = DB::transaction(function () use ($payment, $newStatus, $feeCents, $note): ?array {
            /** @var Order $order */
            $order = Order::query()->whereKey($payment->order_id)->lockForUpdate()->firstOrFail();
            /** @var Payment $lockedPayment */
            $lockedPayment = Payment::query()->whereKey($payment->id)->lockForUpdate()->firstOrFail();

            $prevPaymentStatus = $lockedPayment->status;
            if (in_array($order->status, [OrderStatus::Paid, OrderStatus::Preparing, OrderStatus::Shipped, OrderStatus::Delivered], true) && in_array($newStatus, [PaymentStatus::Pending, PaymentStatus::Rejected, PaymentStatus::Cancelled, PaymentStatus::Expired], true)) {
                return null;
            }
            if ($prevPaymentStatus === $newStatus && $order->status !== OrderStatus::PendingPayment) {
                return null;
            }

            $lockedPayment->update([
                'status' => $newStatus,
                'fee_cents' => $feeCents > 0 ? $feeCents : $lockedPayment->fee_cents,
                'net_amount_cents' => max(0, $lockedPayment->gross_amount_cents - ($feeCents > 0 ? $feeCents : $lockedPayment->fee_cents)),
                'paid_at' => $newStatus === PaymentStatus::Approved ? ($lockedPayment->paid_at ?? now()) : $lockedPayment->paid_at,
            ]);

            $prevOrderStatus = $order->status;
            $targetOrderStatus = match ($newStatus) {
                PaymentStatus::Approved => OrderStatus::Paid,
                PaymentStatus::Rejected => OrderStatus::PaymentFailed,
                PaymentStatus::Cancelled => OrderStatus::Cancelled,
                PaymentStatus::Expired => OrderStatus::Expired,
                PaymentStatus::Refunded, PaymentStatus::ChargedBack => OrderStatus::Refunded,
                PaymentStatus::PartiallyRefunded => OrderStatus::PartiallyRefunded,
                PaymentStatus::Pending, PaymentStatus::Processing, PaymentStatus::Unknown, PaymentStatus::Failed => OrderStatus::PendingPayment,
            };

            if ($newStatus === PaymentStatus::Approved && $order->paid_at === null && ! $order->status->isRecognizedSale()) {
                $this->inventory->confirmDeduction($order);
                $order->update(['status' => OrderStatus::Paid, 'paid_at' => $lockedPayment->paid_at ?? now()]);
                $this->orderCost->captureCostSnapshotForOrder($order);
            } elseif (in_array($newStatus, [PaymentStatus::Rejected, PaymentStatus::Cancelled, PaymentStatus::Expired], true)
                && in_array($prevOrderStatus, [OrderStatus::PendingPayment, OrderStatus::PaymentFailed], true)) {
                $this->inventory->releaseReservation($order, "Pagamento {$newStatus->value}: {$note}");
                $order->update([
                    'status' => $targetOrderStatus,
                    'cancelled_at' => $targetOrderStatus === OrderStatus::Cancelled ? now() : $order->cancelled_at,
                ]);
            } elseif (in_array($newStatus, [PaymentStatus::Refunded, PaymentStatus::ChargedBack], true) && $order->paid_at !== null) {
                $this->orderCost->processReturnOrRefund($order, [
                    'idempotency_key' => "gateway:{$newStatus->value}:payment:{$lockedPayment->id}",
                    'return_type' => 'full_return',
                    'restock_items' => false,
                    'financial_refund_cents' => $lockedPayment->gross_amount_cents,
                    'reason' => $note ?: "Estorno via gateway ({$newStatus->value})",
                ]);
            } elseif ($prevOrderStatus !== $targetOrderStatus) {
                $order->update(['status' => $targetOrderStatus]);
            }

            if ($prevOrderStatus !== $order->status) {
                OrderStatusHistory::query()->create([
                    'order_id' => $order->id,
                    'from_status' => $prevOrderStatus->value,
                    'to_status' => $order->status->value,
                    'note' => $note ?: "Status atualizado para {$order->status->value}",
                ]);

                return ['order' => $order->fresh(), 'status' => $order->status];
            }

            return null;
        });

        if ($notifyPayload !== null) {
            /** @var Order $updatedOrder */
            $updatedOrder = $notifyPayload['order'];
            /** @var OrderStatus $status */
            $status = $notifyPayload['status'];
            [$headline, $body] = match ($status) {
                OrderStatus::Paid => ['Pagamento aprovado!', 'Seu pagamento foi confirmado e seu pedido já está em separação.'],
                OrderStatus::PaymentFailed => ['Pagamento não concluído', 'Não foi possível aprovar seu pagamento. Você pode tentar novamente com outro meio.'],
                OrderStatus::Expired => ['Pagamento expirado', 'O prazo do pagamento expirou e os itens reservados voltaram ao estoque.'],
                OrderStatus::Cancelled => ['Pedido cancelado', 'Seu pedido foi cancelado conforme registro do pagamento.'],
                OrderStatus::Refunded => ['Pagamento reembolsado', 'O estorno do seu pedido foi registrado.'],
                default => ['Atualização do pedido', 'O status do seu pedido foi atualizado para '.$status->value.'.'],
            };
            Mail::to($updatedOrder->customer_email)->queue(new OrderStatusMail($updatedOrder, $headline, $body));
        }
    }
}
