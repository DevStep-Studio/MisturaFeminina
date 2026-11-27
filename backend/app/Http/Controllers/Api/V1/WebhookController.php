<?php

namespace App\Http\Controllers\Api\V1;

use App\Domain\Payments\Services\PaymentSettings;
use App\Http\Controllers\Controller;
use App\Jobs\ProcessPaymentEvent;
use App\Models\PaymentEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WebhookController extends Controller
{
    public function mercadoPago(Request $request): JsonResponse
    {
        abort_if(strlen($request->getContent()) > 65536, 413);
        $settings = app(PaymentSettings::class);
        $secret = $settings->get('mercadopago', 'webhook_secret');
        $id = (string) ($request->query('data_id') ?? $request->query('data.id') ?? '');
        $requestId = $request->header('x-request-id');
        preg_match('/(?:^|,)\s*ts=(\d+)(?:,|$)/', $request->header('x-signature', ''), $ts);
        preg_match('/(?:^|,)\s*v1=([a-f0-9]{64})(?:,|$)/i', $request->header('x-signature', ''), $v1);
        $stamp = (float) ($ts[1] ?? 0);
        if ($stamp > 100000000000) {
            $stamp /= 1000;
        }
        abort_unless(is_string($secret) && $secret !== '' && $requestId && preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $id) && isset($v1[1],$ts[1]) && abs(now()->timestamp - $stamp) <= 300 && hash_equals(hash_hmac('sha256', 'id:'.strtolower($id).';request-id:'.$requestId.';ts:'.$ts[1].';', $secret), strtolower($v1[1])), 401);
        abort_if($request->input('data.id') !== null && (string) $request->input('data.id') !== $id, 401);
        if ($request->input('type') !== 'payment') {
            return response()->json(['status' => 'ignored']);
        }

        return $this->receipt('mercadopago', $id, (string) ($request->input('id') ?? hash('sha256', $request->getContent())));
    }

    public function asaas(Request $request): JsonResponse
    {
        abort_if(strlen($request->getContent()) > 65536, 413);
        $token = app(PaymentSettings::class)->get('asaas', 'webhook_token');
        abort_unless(is_string($token) && $token !== '' && hash_equals($token, $request->header('asaas-access-token', '')), 401);
        if (! str_starts_with((string) $request->input('event'), 'PAYMENT_')) {
            return response()->json(['status' => 'ignored']);
        }

        return $this->receipt('asaas', (string) $request->input('payment.id'), (string) $request->input('id'));
    }

    public function plupag(Request $request): JsonResponse
    {
        abort_if(strlen($request->getContent()) > 65536, 413);
        $settings = app(PaymentSettings::class);
        $secret = $settings->get('plupag', 'webhook_secret');
        if (is_string($secret) && $secret !== '') {
            $incomingToken = $request->header('x-webhook-token')
                ?: $request->header('x-api-secret')
                ?: $request->query('secret');
            abort_unless($incomingToken && hash_equals($secret, (string) $incomingToken), 401);
        }

        $event = (string) $request->input('event');
        if (! in_array($event, ['invoice.updated', 'invoice.created'], true)) {
            return response()->json(['status' => 'ignored']);
        }

        $invoiceId = (string) ($request->input('data.id') ?? $request->input('data.identifier') ?? '');
        abort_unless($invoiceId !== '' && preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $invoiceId), 422);

        $eventId = (string) ($request->input('id')
            ?? $request->input('data.identifier')
            ?? hash('sha256', $request->getContent()));

        return $this->receipt('plupag', $invoiceId, $eventId);
    }

    private function receipt(string $provider, string $id, string $eventId): JsonResponse
    {
        abort_unless(preg_match('/^[a-zA-Z0-9_-]{1,100}$/D', $id) && preg_match('/^[a-zA-Z0-9_-]{1,150}$/D', $eventId), 422);
        $env = app(PaymentSettings::class)->get($provider, 'environment');
        $event = PaymentEvent::firstOrCreate(['deduplication_key' => hash('sha256', "$provider|$env|$eventId")], ['provider' => $provider, 'external_event_id' => $eventId, 'topic' => 'payment', 'action' => 'payment.updated', 'signature_valid' => true, 'payload' => ['resource_id' => $id, 'environment' => $env], 'status' => 'received']);
        abort_unless(($event->payload['resource_id'] ?? null) === $id, 409);
        if ($event->wasRecentlyCreated) {
            ProcessPaymentEvent::dispatch($event->id);
        }

        return response()->json(['status' => 'received', 'event_id' => $event->id]);
    }

    public function simulateSandboxPayment(Request $request, string $publicToken): JsonResponse
    {
        abort(404);
    }
}
