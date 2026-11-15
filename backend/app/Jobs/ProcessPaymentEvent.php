<?php

namespace App\Jobs;

use App\Domain\Payments\Services\PaymentGateway;
use App\Domain\Payments\Services\PaymentService;
use App\Models\Payment;
use App\Models\PaymentEvent;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ProcessPaymentEvent implements ShouldQueue
{
    use Queueable;

    public int $tries = 5;

    public int $timeout = 60;

    public function __construct(public int $eventId) {}

    public function backoff(): array
    {
        return [10, 60, 180, 600];
    }

    public function handle(PaymentGateway $gateway, PaymentService $payments): void
    {
        $event = PaymentEvent::findOrFail($this->eventId);
        if ($event->status === 'processed') {
            return;
        }
        $payload = $event->payload;
        $remote = $gateway->get($event->provider, $payload['environment'], $payload['resource_id']);
        $reference = $remote[$event->provider === 'mercadopago' ? 'external_reference' : 'externalReference'] ?? null;
        $payment = Payment::where('provider', $event->provider)->where('environment', $payload['environment'])->where('idempotency_key', $reference)->firstOrFail();
        $payments->apply($payment, $remote);
        $event->update(['payment_id' => $payment->id, 'status' => 'processed', 'processed_at' => now()]);
    }
}
