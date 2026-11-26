<?php

declare(strict_types=1);

namespace App\Domain\Orders\Services;

use App\Domain\Shared\Enums\OrderStatus;
use App\Jobs\SendOrderEmailNotification;
use App\Models\Order;
use App\Models\OrderEmailNotification;
use App\Models\Payment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class OrderEmailService
{
    public function statusChanged(Order $order): void
    {
        [$headline, $body] = match ($order->status) {
            OrderStatus::PendingPayment => ['Pedido recebido — Aguardando pagamento', 'Recebemos seu pedido. Acesse os detalhes abaixo para pagar ou consultar a confirmação do pagamento.'],
            OrderStatus::Paid => ['Pagamento aprovado!', 'Seu pagamento foi confirmado. Avisaremos quando seu pedido entrar em separação.'],
            OrderStatus::Preparing => ['Estamos preparando seu pedido', 'Seu pedido está em separação. Assim que for enviado, você receberá as informações de entrega.'],
            OrderStatus::Shipped => ['Seu pedido está a caminho!', 'Seu pedido foi enviado. Acompanhe a entrega e consulte o rastreamento abaixo.'],
            OrderStatus::Delivered => ['Pedido entregue!', 'Seu pedido foi marcado como entregue. Obrigada por comprar com a Mistura Feminina!'],
            OrderStatus::PaymentFailed => ['Pagamento não aprovado', 'Não foi possível aprovar o pagamento. Consulte seu pedido para conferir o resultado e as opções de pagamento disponíveis.'],
            OrderStatus::Cancelled => ['Pedido cancelado', 'Seu pedido foi cancelado. Consulte os detalhes ou entre em contato com a loja se precisar de ajuda.'],
            OrderStatus::Expired => ['Prazo do pagamento expirado', 'O prazo de pagamento do pedido expirou. Consulte a loja antes de realizar uma nova compra.'],
            OrderStatus::Refunded => ['Reembolso registrado', 'O reembolso do seu pedido foi registrado. O prazo para o valor aparecer depende do meio de pagamento e da instituição financeira.'],
            OrderStatus::PartiallyRefunded => ['Reembolso parcial registrado', 'Um reembolso parcial foi registrado para seu pedido. Consulte os detalhes abaixo.'],
        };
        $this->record($order, "order:{$order->id}:status:{$order->status->value}", $headline, $body);
    }

    public function paymentUnconfirmed(Payment $payment): void
    {
        if (! in_array($payment->status->value, ['failed', 'unknown'], true)) {
            return;
        }
        $uncertain = $payment->status->value === 'unknown';
        $this->record($payment->order, "payment:{$payment->id}:{$payment->status->value}",
            $uncertain ? 'Pagamento em confirmação' : 'Pagamento não concluído',
            $uncertain ? 'Estamos confirmando a operação com o provedor. Consulte o status do pedido antes de tentar pagar novamente.' : 'Seu pedido foi registrado, mas o pagamento não foi concluído. Acesse o pedido para conferir o motivo e as opções disponíveis.',
            ['payment_status' => $uncertain ? 'Em confirmação' : 'Não concluído'],
        );
    }

    public function shipmentUpdated(Order $order, string $eventKey, ?string $description = null, ?string $location = null): void
    {
        $this->record($order, $eventKey, 'Atualização da entrega do seu pedido', 'Há novas informações sobre a entrega. Confira o código de rastreio e acompanhe seu pedido.', [
            'tracking_description' => $description,
            'tracking_location' => $location,
        ]);
    }

    public static function safeUrl(?string $url): ?string
    {
        if (! $url || ! filter_var($url, FILTER_VALIDATE_URL)) {
            return null;
        }
        $parts = parse_url($url);

        return in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) && ! isset($parts['user']) && ! isset($parts['pass']) ? $url : null;
    }

    /** @param array<string, mixed> $extra */
    private function record(Order $order, string $eventKey, string $headline, string $body, array $extra = []): void
    {
        if (! filter_var($order->customer_email, FILTER_VALIDATE_EMAIL)) {
            return;
        }
        $shipment = $order->shipment()->first();
        $base = rtrim((string) config('app.frontend_url'), '/');
        $payload = [
            'headline' => $headline, 'body' => $body,
            'customer_name' => $order->customer_name, 'order_number' => $order->order_number,
            'status_label' => $order->status->label(), 'total_cents' => $order->total_cents,
            'shipping_cents' => $order->shipping_cents, 'discount_cents' => $order->discount_cents,
            'order_url' => self::safeUrl($base.'/pedido/'.$order->public_token.'/confirmacao'),
            'tracking_page_url' => self::safeUrl($base.'/rastrear-pedido?'.http_build_query(['codigo' => $order->order_number])),
            'carrier' => $shipment?->carrier, 'tracking_code' => $shipment?->tracking_code,
            'tracking_url' => self::safeUrl($shipment?->tracking_url),
            'items' => $order->items()->get()->map(fn ($item): array => [
                'name' => $item->product_name_snapshot, 'variant' => $item->variant_name_snapshot,
                'quantity' => $item->quantity, 'total_cents' => $item->total_cents,
            ])->all(),
            ...$extra,
        ];
        $notification = OrderEmailNotification::query()->firstOrCreate(['event_key' => $eventKey], [
            'order_id' => $order->id, 'recipient' => $order->customer_email, 'payload' => $payload,
        ]);
        if (! $notification->wasRecentlyCreated) {
            return;
        }
        DB::afterCommit(function () use ($notification): void {
            try {
                SendOrderEmailNotification::dispatch($notification->id);
            } catch (\Throwable) {
                $notification->refresh();
                if (! $notification->sent_at) {
                    $notification->update(['status' => 'failed', 'last_error' => 'Envio ou agendamento indisponível. Verifique SMTP e fila.']);
                }
                Log::warning('order_email.dispatch_failed', ['notification_id' => $notification->id, 'order_id' => $notification->order_id]);
            }
        });
    }
}
