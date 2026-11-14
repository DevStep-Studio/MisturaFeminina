<?php

declare(strict_types=1);

namespace App\Domain\Payments\Services;

use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Shared\Enums\OrderStatus;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Mail\OrderStatusMail;
use App\Models\Order;
use App\Models\OrderStatusHistory;
use App\Models\Payment;
use App\Models\PaymentEvent;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

class WebhookProcessorService
{
    public function __construct(
        private readonly MercadoPagoService $mercadoPago,
        private readonly InventoryService $inventory,
    ) {}

    /** @param array<string, mixed> $payload */
    public function processMercadoPago(array $payload, bool $signatureValid): PaymentEvent
    {
        $externalEventId = (string) ($payload['id'] ?? $payload['data']['id'] ?? '');
        $action = (string) ($payload['action'] ?? $payload['type'] ?? 'payment.updated');
        $topic = (string) ($payload['topic'] ?? $payload['type'] ?? 'order');
        $resourceId = (string) ($payload['data']['id'] ?? $payload['resource_id'] ?? $externalEventId);

        $dedupKey = sha1("mercadopago|{$topic}|{$action}|{$externalEventId}|{$resourceId}|".($payload['status'] ?? $payload['data']['status'] ?? ''));

        $existing = PaymentEvent::query()->where('deduplication_key', $dedupKey)->first();
        if ($existing && $existing->status === 'processed') {
            return $existing;
        }

        $event = $existing ?? PaymentEvent::query()->create([
            'provider' => 'mercadopago',
            'external_event_id' => $externalEventId ?: null,
            'topic' => $topic,
            'action' => $action,
            'deduplication_key' => $dedupKey,
            'signature_valid' => $signatureValid,
            'payload' => $payload,
            'status' => 'received',
        ]);

        if (! $signatureValid) {
            $event->update(['status' => 'failed', 'error_message' => 'Assinatura HMAC inválida.']);

            return $event;
        }

        $payment = Payment::query()
            ->where('external_order_id', $resourceId)
            ->orWhere('external_payment_id', $resourceId)
            ->first();

        if (! $payment && isset($payload['external_reference'])) {
            $order = Order::query()->where('order_number', (string) $payload['external_reference'])->first();
            $payment = $order?->latestPayment;
        }

        if (! $payment) {
            $event->update(['status' => 'ignored', 'error_message' => 'Pagamento não localizado localmente.', 'processed_at' => now()]);

            return $event;
        }

        $event->update(['payment_id' => $payment->id]);

        $remote = $this->mercadoPago->fetchRemoteOrderStatus($payment);
        $newPaymentStatus = $remote['status'] ?? $this->mercadoPago->mapStatus((string) ($payload['data']['status'] ?? $payload['status'] ?? 'pending'));
        $feeCents = $remote['fee_cents'] ?? $payment->fee_cents;

        $this->applyPaymentTransition($payment, $newPaymentStatus, $feeCents, 'Webhook '.$action);
        $event->update(['status' => 'processed', 'processed_at' => now()]);

        return $event->fresh();
    }

    public function applyPaymentTransition(Payment $payment, PaymentStatus $newStatus, int $feeCents = 0, string $note = ''): void
    {
        $notifyPayload = DB::transaction(function () use ($payment, $newStatus, $feeCents, $note): ?array {
            /** @var Payment $lockedPayment */
            $lockedPayment = Payment::query()->whereKey($payment->id)->lockForUpdate()->firstOrFail();
            /** @var Order $order */
            $order = Order::query()->whereKey($lockedPayment->order_id)->lockForUpdate()->firstOrFail();

            $prevPaymentStatus = $lockedPayment->status;
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
                PaymentStatus::Pending => OrderStatus::PendingPayment,
            };

            if ($newStatus === PaymentStatus::Approved && $prevOrderStatus === OrderStatus::PendingPayment) {
                $this->inventory->confirmDeduction($order);
                $order->update(['status' => OrderStatus::Paid, 'paid_at' => now()]);
            } elseif (in_array($newStatus, [PaymentStatus::Rejected, PaymentStatus::Cancelled, PaymentStatus::Expired], true)
                && in_array($prevOrderStatus, [OrderStatus::PendingPayment, OrderStatus::PaymentFailed], true)) {
                $this->inventory->releaseReservation($order, "Pagamento {$newStatus->value}: {$note}");
                $order->update([
                    'status' => $targetOrderStatus,
                    'cancelled_at' => $targetOrderStatus === OrderStatus::Cancelled ? now() : $order->cancelled_at,
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
