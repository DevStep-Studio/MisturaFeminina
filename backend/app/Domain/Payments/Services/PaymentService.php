<?php

declare(strict_types=1);

namespace App\Domain\Payments\Services;

use App\Domain\Orders\Services\OrderEmailService;
use App\Domain\Shared\Enums\PaymentMethod;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Models\Order;
use App\Models\Payment;
use App\Models\StockReservation;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PaymentService
{
    public function __construct(private PaymentSettings $settings, private PaymentGateway $gateway) {}

    public function createOrderPayment(Order $order, PaymentMethod $method, array $input, string $key): Payment
    {
        $provider = $order->payment_provider ?? $this->settings->provider();
        abort_unless($this->settings->available($provider), 503, 'Pagamentos indisponíveis. Configure o provedor.');
        abort_unless($this->settings->get($provider, 'environment') === $order->payment_environment, 409, 'O ambiente do pagamento mudou.');
        abort_if($method === PaymentMethod::DebitCard, 422, 'Selecione Pix, crédito ou boleto.');
        if ($provider === 'mercadopago' && $method === PaymentMethod::CreditCard) {
            abort_unless(! empty($input['card_token']) && ! empty($input['payment_method_id']) && ! in_array($input['payment_method_id'], ['pix', 'bolbradesco']), 422, 'Preencha o cartão no formulário seguro.');
        }
        $fingerprint = PaymentSettings::digest(['method' => $method->value, 'input' => $input]);
        [$payment,$created] = DB::transaction(function () use ($order, $provider, $method, $key, $fingerprint): array {
            $locked = Order::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $same = Payment::where('idempotency_key', $key)->first();
            if ($same) {
                abort_unless($same->order_id === $order->id && $same->request_fingerprint === $fingerprint, 409, 'Chave já utilizada.');

                return [$same, false];
            }
            abort_if($locked->created_at->lt(now()->subMinutes(15)), 409, 'O prazo para iniciar o pagamento expirou. Crie um novo pedido com uma cotação atualizada.');
            abort_unless(in_array($locked->status->value, ['pending_payment', 'payment_failed'], true), 409, 'Pedido não aceita pagamento.');
            abort_if($locked->payments()->whereIn('status', ['processing', 'unknown', 'pending', 'approved'])->exists(), 409, 'Já existe um pagamento em andamento. Consulte o pedido.');

            $locked->update(['stock_reserved_until' => now()->addDays(7)]);
            StockReservation::where('order_id', $locked->id)->where('status', 'active')->update(['expires_at' => now()->addDays(7)]);

            return [Payment::create(['order_id' => $order->id, 'provider' => $provider, 'environment' => $order->payment_environment, 'idempotency_key' => $key, 'request_fingerprint' => $fingerprint, 'method' => $method, 'installments' => 1, 'gross_amount_cents' => $order->total_cents, 'net_amount_cents' => $order->total_cents, 'fee_cents' => 0, 'status' => PaymentStatus::Processing]), true];
        });
        if (! $created) {
            return $payment;
        }
        try {
            return $this->apply($payment, $this->gateway->create($payment, $input));
        } catch (\Throwable $e) {
            $payment->refresh();
            if ($payment->status !== PaymentStatus::Processing) {
                throw $e;
            }
            $diagnostic = [
                'api' => $provider === 'mercadopago' ? 'payments_v1' : 'asaas_v3',
                'http_status' => $e instanceof GatewayFailure ? $e->httpStatus : null,
                'error_codes' => $e instanceof GatewayFailure ? $e->providerCodes : [],
                'request_id' => request()->attributes->get('request_id'),
            ];
            $payment->update([
                'status' => $e instanceof GatewayFailure && ! $e->uncertain ? PaymentStatus::Failed : PaymentStatus::Unknown,
                'failure_reason' => $e instanceof GatewayFailure ? $e->customerMessage() : 'Não foi possível confirmar a operação. Consulte o pedido antes de tentar novamente.',
                'raw_sanitized_response' => $diagnostic,
            ]);
            Log::warning('payment.creation_failed', [
                'order_id' => $order->id,
                'payment_id' => $payment->id,
                'provider' => $provider,
                'environment' => $payment->environment,
                ...$diagnostic,
            ]);

            app(OrderEmailService::class)->paymentUnconfirmed($payment->fresh());

            return $payment->fresh();
        }
    }

    public function refresh(Payment $payment): Payment
    {
        $remote = $this->gateway->find($payment);

        return $remote ? $this->apply($payment, $remote) : $payment;
    }

    public function apply(Payment $payment, array $remote): Payment
    {
        $mp = $payment->provider === 'mercadopago';
        $id = $remote['id'] ?? null;
        if (! is_scalar($id) || ! preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', (string) $id) || ($remote[$mp ? 'external_reference' : 'externalReference'] ?? null) !== $payment->idempotency_key || ! is_numeric($remote[$mp ? 'transaction_amount' : 'value'] ?? null) || PaymentSettings::cents($remote[$mp ? 'transaction_amount' : 'value']) !== $payment->gross_amount_cents || ($mp && ($remote['currency_id'] ?? null) !== 'BRL') || ($payment->external_payment_id && $payment->external_payment_id !== (string) $id)) {
            throw new GatewayFailure(true);
        }
        $status = $mp ? match ($remote['status'] ?? '') {
            'approved' => PaymentStatus::Approved,'rejected' => PaymentStatus::Rejected,'cancelled' => PaymentStatus::Cancelled,'refunded' => PaymentStatus::Refunded,'charged_back' => PaymentStatus::ChargedBack,default => PaymentStatus::Pending,
        } : match ($remote['status'] ?? '') {
            'RECEIVED' => PaymentStatus::Approved,'CONFIRMED' => $payment->method === PaymentMethod::CreditCard ? PaymentStatus::Approved : PaymentStatus::Pending,'REFUNDED' => PaymentStatus::Refunded,'CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE','AWAITING_CHARGEBACK_REVERSAL' => PaymentStatus::ChargedBack,'DELETED' => PaymentStatus::Cancelled,'CREDIT_CARD_CAPTURE_REFUSED' => PaymentStatus::Rejected,default => PaymentStatus::Pending,
        };
        if (! $mp && ($remote['deleted'] ?? false)) {
            $status = PaymentStatus::Cancelled;
        }
        $netValue = $mp ? ($remote['transaction_details']['net_received_amount'] ?? null) : ($remote['netValue'] ?? null);
        $feeCents = is_numeric($netValue) ? max(0, $payment->gross_amount_cents - PaymentSettings::cents($netValue)) : 0;
        if ($mp && ! is_numeric($netValue)) {
            foreach ($remote['fee_details'] ?? [] as $fee) {
                if (is_numeric($fee['amount'] ?? null)) {
                    $feeCents += max(0, PaymentSettings::cents($fee['amount']));
                }
            }
        }
        $updated = $mp && ! empty($remote['date_last_updated']) ? Carbon::parse($remote['date_last_updated']) : null;
        $pix = $remote['point_of_interaction']['transaction_data'] ?? [];
        $url = PaymentGateway::safeUrl($remote['invoiceUrl'] ?? null, 'asaas');
        if (! $mp && $status === PaymentStatus::Pending && ! $url) {
            throw new GatewayFailure(true);
        }

        return DB::transaction(function () use ($payment, $remote, $id, $mp, $status, $updated, $pix, $url, $feeCents): Payment {
            $order = Order::whereKey($payment->order_id)->lockForUpdate()->firstOrFail();
            $locked = Payment::whereKey($payment->id)->lockForUpdate()->firstOrFail();
            if ($updated && $locked->provider_updated_at && $updated->lt($locked->provider_updated_at)) {
                return $locked;
            }
            if (in_array($locked->status, [PaymentStatus::Approved, PaymentStatus::Refunded, PaymentStatus::ChargedBack], true) && in_array($status, [PaymentStatus::Pending, PaymentStatus::Rejected, PaymentStatus::Cancelled], true)) {
                return $locked;
            }
            $diagnostic = ['status' => $status->value, 'status_detail' => GatewayFailure::safeCode($remote['status_detail'] ?? null), 'api' => $mp ? 'payments_v1' : 'asaas_v3'];
            if ($status === PaymentStatus::Rejected && $locked->status !== PaymentStatus::Rejected) {
                Log::warning('payment.rejected', ['order_id' => $order->id, 'payment_id' => $locked->id, 'provider' => $locked->provider, 'environment' => $locked->environment, ...$diagnostic]);
            }
            $locked->update(['external_payment_id' => (string) $id, 'checkout_url' => $url, 'boleto_url' => $mp ? PaymentGateway::safeUrl($remote['transaction_details']['external_resource_url'] ?? null, 'mercadopago') : null, 'barcode' => is_string($remote['barcode']['content'] ?? null) ? $remote['barcode']['content'] : null, 'pix_copy_paste' => $mp && $locked->method === PaymentMethod::Pix && is_string($pix['qr_code'] ?? null) ? $pix['qr_code'] : null, 'pix_qr_code_base64' => $mp && is_string($pix['qr_code_base64'] ?? null) && strlen($pix['qr_code_base64']) < 100000 && preg_match('/^[A-Za-z0-9+\/=]+$/D', $pix['qr_code_base64']) ? $pix['qr_code_base64'] : null, 'pix_expires_at' => $remote['date_of_expiration'] ?? null, 'provider_updated_at' => $updated, 'raw_sanitized_response' => $diagnostic, 'failure_reason' => $status === PaymentStatus::Rejected ? GatewayFailure::rejectionMessage($remote['status_detail'] ?? null) : null]);
            app(WebhookProcessorService::class)->applyPaymentTransition($locked, $status, $feeCents, 'Status confirmado na API do provedor');

            return $locked->fresh();
        });
    }

    public function fetchRemoteOrderStatus(Payment $payment): ?array
    {
        $payment = $this->refresh($payment);

        return ['status' => $payment->status, 'fee_cents' => $payment->fee_cents];
    }

    public function refundPayment(Payment $payment, int $amountCents): ?string
    {
        // Refund submission stays disabled until the provider-specific operation is confirmed.
        abort(409, 'Solicite o estorno no painel oficial do provedor e concilie o pagamento.');
    }
}
