<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Payments\Services\MercadoPagoService;
use App\Domain\Payments\Services\WebhookProcessorService;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class WebhookController extends Controller
{
    public function __construct(
        private readonly MercadoPagoService $mercadoPago,
        private readonly WebhookProcessorService $webhooks,
    ) {}

    public function mercadoPago(Request $request): JsonResponse
    {
        $payload = $request->all();
        $dataId = (string) ($payload['data']['id'] ?? $request->query('data.id') ?? $request->query('id') ?? '');
        $xSignature = $request->header('x-signature');
        $xRequestId = $request->header('x-request-id');

        $signatureValid = $this->mercadoPago->verifyWebhookSignature($xSignature, $xRequestId, $dataId);

        $event = $this->webhooks->processMercadoPago($payload, $signatureValid);

        if (! $signatureValid) {
            Log::warning('MercadoPago webhook signature rejected', [
                'event_id' => $event->id,
                'x_request_id' => $xRequestId,
            ]);

            return response()->json(['status' => 'rejected', 'reason' => 'invalid_signature'], 401);
        }

        return response()->json([
            'status' => $event->status,
            'event_id' => $event->id,
        ]);
    }

    public function simulateSandboxPayment(Request $request, string $publicToken): JsonResponse
    {
        if (app()->isProduction()) {
            return response()->json(['message' => 'Simulação de sandbox indisponível em produção.'], 403);
        }

        $validated = $request->validate([
            'outcome' => ['required', 'string', Rule::in(['approved', 'rejected', 'expired'])],
        ]);

        $order = Order::query()->where('public_token', $publicToken)->with('latestPayment')->firstOrFail();
        /** @var Payment|null $payment */
        $payment = $order->latestPayment;
        if (! $payment || $payment->environment !== 'sandbox') {
            return response()->json(['message' => 'Somente pagamentos em ambiente sandbox podem ser simulados aqui.'], 422);
        }

        $newStatus = match ($validated['outcome']) {
            'approved' => PaymentStatus::Approved,
            'rejected' => PaymentStatus::Rejected,
            default => PaymentStatus::Expired,
        };

        $feeCents = $newStatus === PaymentStatus::Approved
            ? (int) round($payment->gross_amount_cents * ($payment->method->value === 'pix' ? 0.0099 : 0.0399))
            : 0;

        $this->webhooks->applyPaymentTransition(
            $payment,
            $newStatus,
            $feeCents,
            'Transição simulada em ambiente sandbox ('.$newStatus->value.')',
        );

        return response()->json([
            'data' => [
                'order_status' => $order->fresh()?->status->value,
                'payment_status' => $payment->fresh()?->status->value,
            ],
        ]);
    }
}
