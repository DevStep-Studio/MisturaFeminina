<?php

declare(strict_types=1);

namespace App\Domain\Payments\Services;

use App\Domain\Shared\Enums\PaymentMethod;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Models\IntegrationSetting;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class MercadoPagoService
{
    public function getSetting(): ?IntegrationSetting
    {
        return IntegrationSetting::query()->where('provider', 'mercadopago')->first();
    }

    public function accessToken(): ?string
    {
        $setting = $this->getSetting();
        $fromDb = $setting?->encrypted_credentials['access_token'] ?? null;
        if (is_string($fromDb) && $fromDb !== '') {
            return $fromDb;
        }
        $fromConfig = config('services.mercadopago.access_token');

        return is_string($fromConfig) && $fromConfig !== '' ? $fromConfig : null;
    }

    public function webhookSecret(): ?string
    {
        $setting = $this->getSetting();
        $fromDb = $setting?->encrypted_credentials['webhook_secret'] ?? null;
        if (is_string($fromDb) && $fromDb !== '') {
            return $fromDb;
        }
        $fromConfig = config('services.mercadopago.webhook_secret');

        return is_string($fromConfig) && $fromConfig !== '' ? $fromConfig : null;
    }

    public function environment(): string
    {
        $setting = $this->getSetting();

        return $setting ? $setting->environment : 'sandbox';
    }

    /**
     * @param  array<string, mixed>  $paymentInput
     */
    public function createOrderPayment(Order $order, PaymentMethod $method, array $paymentInput, string $idempotencyKey): Payment
    {
        $token = $this->accessToken();
        $env = $this->environment();
        $installments = max(1, min(12, (int) ($paymentInput['installments'] ?? 1)));

        if ($token !== null) {
            return $this->createViaMercadoPagoOrdersApi($order, $method, $paymentInput, $idempotencyKey, $token, $env, $installments);
        }

        if ($env === 'production') {
            throw new \RuntimeException('Mercado Pago em produção requer access_token configurado.');
        }

        return $this->createSandboxSimulatedPayment($order, $method, $paymentInput, $idempotencyKey, $installments);
    }

    /**
     * @param  array<string, mixed>  $paymentInput
     */
    private function createViaMercadoPagoOrdersApi(
        Order $order,
        PaymentMethod $method,
        array $paymentInput,
        string $idempotencyKey,
        string $token,
        string $env,
        int $installments,
    ): Payment {
        $amountDecimal = number_format($order->total_cents / 100, 2, '.', '');
        $nameParts = preg_split('/\s+/', trim($order->customer_name), 2) ?: ['Cliente', 'Loja'];

        $paymentMethodPayload = match ($method) {
            PaymentMethod::Pix => [
                'id' => 'pix',
                'type' => 'bank_transfer',
            ],
            PaymentMethod::CreditCard, PaymentMethod::DebitCard => [
                'id' => (string) ($paymentInput['payment_method_id'] ?? 'master'),
                'type' => $method->value,
                'token' => (string) ($paymentInput['card_token'] ?? ''),
                'installments' => $installments,
            ],
        };

        $payload = [
            'type' => 'online',
            'processing_mode' => 'automatic',
            'external_reference' => $order->order_number,
            'total_amount' => $amountDecimal,
            'payer' => [
                'email' => $order->customer_email,
                'first_name' => $nameParts[0],
                'last_name' => $nameParts[1] ?? 'Mistura',
            ],
            'transactions' => [
                'payments' => [
                    [
                        'amount' => $amountDecimal,
                        'payment_method' => $paymentMethodPayload,
                    ],
                ],
            ],
        ];

        $response = Http::timeout(12)
            ->withToken($token)
            ->withHeaders([
                'X-Idempotency-Key' => $idempotencyKey,
                'Content-Type' => 'application/json',
            ])
            ->post('https://api.mercadopago.com/v1/orders', $payload);

        if (! $response->successful()) {
            $errBody = $response->json();

            return Payment::query()->create([
                'order_id' => $order->id,
                'provider' => 'mercadopago',
                'environment' => $env,
                'idempotency_key' => $idempotencyKey,
                'method' => $method,
                'installments' => $installments,
                'gross_amount_cents' => $order->total_cents,
                'fee_cents' => 0,
                'net_amount_cents' => $order->total_cents,
                'status' => PaymentStatus::Rejected,
                'failure_reason' => (string) ($errBody['errors'][0]['message'] ?? $errBody['message'] ?? 'Falha ao processar pagamento no provedor.'),
                'raw_sanitized_response' => ['status' => $response->status(), 'code' => $errBody['errors'][0]['code'] ?? null],
            ]);
        }

        $data = $response->json();
        $firstPayment = $data['transactions']['payments'][0] ?? [];
        $mappedStatus = $this->mapStatus((string) ($firstPayment['status'] ?? $data['status'] ?? 'pending'));
        $pixCopyPaste = $firstPayment['payment_method']['qr_code'] ?? $firstPayment['point_of_interaction']['transaction_data']['qr_code'] ?? null;
        $pixQrBase64 = $firstPayment['payment_method']['qr_code_base64'] ?? $firstPayment['point_of_interaction']['transaction_data']['qr_code_base64'] ?? null;
        $feeCents = (int) round(((float) ($firstPayment['fee_amount'] ?? 0)) * 100);

        return Payment::query()->create([
            'order_id' => $order->id,
            'provider' => 'mercadopago',
            'environment' => $env,
            'external_order_id' => isset($data['id']) ? (string) $data['id'] : null,
            'external_payment_id' => isset($firstPayment['id']) ? (string) $firstPayment['id'] : null,
            'idempotency_key' => $idempotencyKey,
            'method' => $method,
            'installments' => $installments,
            'gross_amount_cents' => $order->total_cents,
            'fee_cents' => $feeCents,
            'net_amount_cents' => max(0, $order->total_cents - $feeCents),
            'status' => $mappedStatus,
            'pix_qr_code_base64' => is_string($pixQrBase64) ? $pixQrBase64 : null,
            'pix_copy_paste' => is_string($pixCopyPaste) ? $pixCopyPaste : null,
            'pix_expires_at' => $method === PaymentMethod::Pix ? now()->addMinutes(30) : null,
            'card_last_four' => isset($paymentInput['card_last_four']) ? substr((string) $paymentInput['card_last_four'], -4) : null,
            'card_brand' => isset($paymentInput['payment_method_id']) ? (string) $paymentInput['payment_method_id'] : null,
            'failure_reason' => $mappedStatus === PaymentStatus::Rejected ? (string) ($firstPayment['status_detail'] ?? 'Pagamento recusado') : null,
            'raw_sanitized_response' => [
                'order_id' => $data['id'] ?? null,
                'status' => $data['status'] ?? null,
                'payment_status' => $firstPayment['status'] ?? null,
                'status_detail' => $firstPayment['status_detail'] ?? null,
            ],
            'paid_at' => $mappedStatus === PaymentStatus::Approved ? now() : null,
        ]);
    }

    /** @param array<string, mixed> $paymentInput */
    private function createSandboxSimulatedPayment(
        Order $order,
        PaymentMethod $method,
        array $paymentInput,
        string $idempotencyKey,
        int $installments,
    ): Payment {
        $extOrderId = 'SBX-ORD-'.strtoupper(Str::random(12));
        $extPaymentId = 'SBX-PAY-'.strtoupper(Str::random(12));

        if ($method === PaymentMethod::Pix) {
            $amountStr = number_format($order->total_cents / 100, 2, '.', '');
            $copyPaste = '00020126580014BR.GOV.BCB.PIX0136mistura-feminina-sandbox@pix.local520400005303986540'.strlen($amountStr).$amountStr."5802BR5925MISTURA FEMININA COSMETIC6009SAO PAULO62070503{$order->order_number}6304ABCD";
            $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#fff"/><rect x="10" y="10" width="28" height="28" fill="#18181b"/><rect x="16" y="16" width="16" height="16" fill="#fff"/><rect x="20" y="20" width="8" height="8" fill="#18181b"/><rect x="82" y="10" width="28" height="28" fill="#18181b"/><rect x="88" y="16" width="16" height="16" fill="#fff"/><rect x="92" y="20" width="8" height="8" fill="#18181b"/><rect x="10" y="82" width="28" height="28" fill="#18181b"/><rect x="16" y="88" width="16" height="16" fill="#fff"/><rect x="20" y="92" width="8" height="8" fill="#18181b"/><rect x="48" y="20" width="24" height="24" fill="#8b2252"/><rect x="48" y="54" width="60" height="12" fill="#18181b"/><rect x="48" y="76" width="36" height="34" fill="#8b2252"/></svg>';
            $feeCents = (int) round($order->total_cents * 0.0099);

            return Payment::query()->create([
                'order_id' => $order->id,
                'provider' => 'mercadopago',
                'environment' => 'sandbox',
                'external_order_id' => $extOrderId,
                'external_payment_id' => $extPaymentId,
                'idempotency_key' => $idempotencyKey,
                'method' => PaymentMethod::Pix,
                'installments' => 1,
                'gross_amount_cents' => $order->total_cents,
                'fee_cents' => $feeCents,
                'net_amount_cents' => max(0, $order->total_cents - $feeCents),
                'status' => PaymentStatus::Pending,
                'pix_qr_code_base64' => base64_encode($svg),
                'pix_copy_paste' => $copyPaste,
                'pix_expires_at' => now()->addMinutes(30),
                'raw_sanitized_response' => [
                    'simulated_sandbox' => true,
                    'external_order_id' => $extOrderId,
                    'status' => 'pending',
                ],
            ]);
        }

        $cardToken = (string) ($paymentInput['card_token'] ?? '');
        $status = match (true) {
            str_contains($cardToken, 'rejected') || str_contains($cardToken, 'cc_rejected') => PaymentStatus::Rejected,
            str_contains($cardToken, 'pending') || str_contains($cardToken, 'in_process') => PaymentStatus::Pending,
            str_contains($cardToken, 'expired') => PaymentStatus::Expired,
            default => PaymentStatus::Approved,
        };
        $feeCents = (int) round($order->total_cents * 0.0399);

        return Payment::query()->create([
            'order_id' => $order->id,
            'provider' => 'mercadopago',
            'environment' => 'sandbox',
            'external_order_id' => $extOrderId,
            'external_payment_id' => $extPaymentId,
            'idempotency_key' => $idempotencyKey,
            'method' => $method,
            'installments' => $installments,
            'gross_amount_cents' => $order->total_cents,
            'fee_cents' => $status === PaymentStatus::Approved ? $feeCents : 0,
            'net_amount_cents' => $status === PaymentStatus::Approved ? max(0, $order->total_cents - $feeCents) : 0,
            'status' => $status,
            'card_last_four' => isset($paymentInput['card_last_four']) ? substr((string) $paymentInput['card_last_four'], -4) : '4242',
            'card_brand' => (string) ($paymentInput['payment_method_id'] ?? 'visa'),
            'failure_reason' => $status === PaymentStatus::Rejected ? 'Cartão recusado pelo emissor (sandbox).' : null,
            'raw_sanitized_response' => [
                'simulated_sandbox' => true,
                'external_order_id' => $extOrderId,
                'status' => $status->value,
            ],
            'paid_at' => $status === PaymentStatus::Approved ? now() : null,
        ]);
    }

    /** @return array{status: PaymentStatus, fee_cents: int}|null */
    public function fetchRemoteOrderStatus(Payment $payment): ?array
    {
        $token = $this->accessToken();
        if (! $token || ! $payment->external_order_id || str_starts_with($payment->external_order_id, 'SBX-')) {
            return null;
        }

        $resp = Http::timeout(8)
            ->withToken($token)
            ->get('https://api.mercadopago.com/v1/orders/'.$payment->external_order_id);

        if (! $resp->successful()) {
            return null;
        }

        $data = $resp->json();
        $first = $data['transactions']['payments'][0] ?? [];
        $statusStr = (string) ($first['status'] ?? $data['status'] ?? 'pending');
        $feeCents = (int) round(((float) ($first['fee_amount'] ?? 0)) * 100);

        return [
            'status' => $this->mapStatus($statusStr),
            'fee_cents' => $feeCents,
        ];
    }

    public function refundPayment(Payment $payment, int $amountCents): ?string
    {
        $token = $this->accessToken();
        if (! $token || ! $payment->external_order_id || str_starts_with($payment->external_order_id, 'SBX-')) {
            return 'SBX-REF-'.strtoupper(Str::random(10));
        }

        $resp = Http::timeout(10)
            ->withToken($token)
            ->withHeaders(['X-Idempotency-Key' => Str::uuid()->toString()])
            ->post("https://api.mercadopago.com/v1/orders/{$payment->external_order_id}/refund", [
                'transactions' => [
                    [
                        'id' => $payment->external_payment_id,
                        'amount' => number_format($amountCents / 100, 2, '.', ''),
                    ],
                ],
            ]);

        if (! $resp->successful()) {
            throw new \RuntimeException('Falha ao solicitar reembolso no Mercado Pago (HTTP '.$resp->status().').');
        }

        return (string) ($resp->json('id') ?? Str::uuid()->toString());
    }

    public function verifyWebhookSignature(?string $xSignature, ?string $xRequestId, ?string $dataId): bool
    {
        $secret = $this->webhookSecret();
        if ($secret === null || $secret === '') {
            // In local/testing sandbox without secret configured, allow explicit sandbox tests when marked
            return ! app()->isProduction();
        }

        if (! $xSignature || ! $dataId) {
            return false;
        }

        $parts = [];
        foreach (explode(',', $xSignature) as $segment) {
            $kv = explode('=', trim($segment), 2);
            if (count($kv) === 2) {
                $parts[trim($kv[0])] = trim($kv[1]);
            }
        }

        $ts = $parts['ts'] ?? null;
        $v1 = $parts['v1'] ?? null;
        if (! $ts || ! $v1) {
            return false;
        }

        $manifest = "id:{$dataId};request-id:".($xRequestId ?? '').";ts:{$ts};";
        $expected = hash_hmac('sha256', $manifest, $secret);

        return hash_equals($expected, $v1);
    }

    public function mapStatus(string $providerStatus): PaymentStatus
    {
        return match (strtolower($providerStatus)) {
            'approved', 'processed', 'paid' => PaymentStatus::Approved,
            'rejected', 'failed', 'action_required' => PaymentStatus::Rejected,
            'cancelled', 'canceled' => PaymentStatus::Cancelled,
            'refunded' => PaymentStatus::Refunded,
            'partially_refunded' => PaymentStatus::PartiallyRefunded,
            'charged_back' => PaymentStatus::ChargedBack,
            'expired' => PaymentStatus::Expired,
            default => PaymentStatus::Pending,
        };
    }
}
