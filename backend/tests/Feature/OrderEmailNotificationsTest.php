<?php

declare(strict_types=1);

use App\Domain\Orders\Services\OrderEmailService;
use App\Domain\Shared\Enums\OrderStatus;
use App\Jobs\SendOrderEmailNotification;
use App\Mail\OrderStatusMail;
use App\Models\Order;
use App\Models\OrderEmailNotification;
use App\Models\Payment;
use App\Models\Role;
use App\Models\Shipment;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;

beforeEach(function (): void {
    config(['mail.default' => 'smtp', 'queue.default' => 'sync', 'app.frontend_url' => 'https://misturafeminina.com.br']);
    Mail::fake();
    $this->order = Order::query()->create([
        'order_number' => 'MF-'.Str::random(12), 'public_token' => Str::uuid(), 'idempotency_key' => Str::uuid(),
        'customer_name' => 'Ana', 'customer_email' => 'ana@example.com', 'customer_phone' => '11999999999',
        'shipping_address_snapshot' => [], 'shipping_service_snapshot' => [],
        'subtotal_cents' => 9990, 'total_cents' => 9990, 'status' => OrderStatus::PendingPayment,
    ]);
});

test('records each lifecycle status once with customer labels', function (OrderStatus $status): void {
    if ($status === OrderStatus::PendingPayment) {
        app(OrderEmailService::class)->statusChanged($this->order);
    } else {
        $this->order->update(['status' => $status]);
    }
    app(OrderEmailService::class)->statusChanged($this->order);
    expect(OrderEmailNotification::count())->toBe(1);
    Mail::assertSent(OrderStatusMail::class, fn ($mail) => $mail->data['status_label'] === $status->label());
})->with(OrderStatus::cases());

test('keeps the original status snapshot while waiting for the queue', function (): void {
    Queue::fake();
    app(OrderEmailService::class)->statusChanged($this->order);
    $this->order->update(['status' => OrderStatus::Paid]);
    $notification = OrderEmailNotification::oldest('id')->firstOrFail();
    (new SendOrderEmailNotification($notification->id))->handle();
    (new SendOrderEmailNotification($notification->id))->handle();
    Mail::assertSentCount(1);
    Mail::assertSent(OrderStatusMail::class, fn ($mail) => str_contains($mail->render(), 'Aguardando pagamento'));
});

test('includes tracking links and escapes shipment descriptions', function (): void {
    Shipment::query()->create(['order_id' => $this->order->id, 'carrier' => 'Correios', 'service_code' => 'PAC', 'service_name' => 'PAC', 'tracking_code' => 'AA123BR', 'tracking_url' => 'https://correios.com.br/rastreio', 'weight_grams' => 500]);
    app(OrderEmailService::class)->shipmentUpdated($this->order, 'shipment:test', '<script>alert(1)</script>');
    Mail::assertSent(OrderStatusMail::class, function ($mail): bool {
        $html = $mail->render();

        return str_contains($html, 'AA123BR') && str_contains($html, 'https://correios.com.br/rastreio') && ! str_contains($html, '<script>');
    });
    expect(OrderEmailService::safeUrl('javascript:alert(1)'))->toBeNull();
});

test('SMTP failure does not prevent the status update and can be retried', function (): void {
    $manager = app('mail.manager');
    Mail::shouldReceive('to')->andThrow(new RuntimeException('SMTP unavailable'));
    $this->order->update(['status' => OrderStatus::Paid]);
    expect($this->order->fresh()->status)->toBe(OrderStatus::Paid);
    $notification = OrderEmailNotification::firstOrFail();
    expect($notification->status)->toBe('failed')->and($notification->attempts)->toBe(1)->and($notification->sent_at)->toBeNull();
    Mail::swap($manager);
    Mail::fake();
    $this->travel(6)->minutes();
    $this->artisan('mistura:retry-order-emails')->assertSuccessful();
    expect($notification->fresh()->status)->toBe('sent');
    Mail::assertSentCount(1);
});

test('does not count log mail as delivered and retries after SMTP configuration', function (): void {
    config(['mail.default' => 'log']);
    app(OrderEmailService::class)->statusChanged($this->order);
    expect(OrderEmailNotification::firstOrFail()->sent_at)->toBeNull();
    config(['mail.default' => 'smtp']);
    $this->artisan('mistura:retry-order-emails')->assertSuccessful();
    Mail::assertSentCount(1);
});

test('does not queue emails for rolled back changes', function (): void {
    Queue::fake();
    DB::beginTransaction();
    $this->order->update(['status' => OrderStatus::Paid]);
    DB::rollBack();
    expect(OrderEmailNotification::count())->toBe(0);
    Queue::assertNothingPushed();
});

test('admin shipment updates send the current tracking once and notify delivery progress', function (): void {
    $this->seed(DemoStoreSeeder::class);
    $admin = User::factory()->create(['is_active' => true]);
    $admin->roles()->sync([Role::where('slug', 'superadmin')->firstOrFail()->id]);
    $this->actingAs($admin);
    $payload = ['carrier' => 'Correios', 'tracking_code' => 'AA123BR', 'tracking_url' => 'https://correios.com.br/rastreio', 'mark_shipped' => true];
    $url = "/api/v1/admin/orders/{$this->order->id}/shipment";
    $this->patchJson($url, $payload)->assertOk();
    Mail::assertSent(OrderStatusMail::class, fn ($mail) => $mail->data['status_label'] === 'Enviado' && $mail->data['tracking_code'] === 'AA123BR');
    $this->patchJson($url, $payload)->assertOk();
    Mail::assertSentCount(1);
    $progress = ['tracking_description' => 'Saiu para entrega', 'tracking_location' => 'São Paulo'];
    $this->patchJson($url, $progress)->assertOk();
    $this->patchJson($url, $progress)->assertOk();
    Mail::assertSentCount(2);
    $this->patchJson($url, ['mark_delivered' => true])->assertOk();
    Mail::assertSentCount(3);
    expect($this->order->fresh()->status)->toBe(OrderStatus::Delivered);
});

test('notifies payment creation failures without exposing provider diagnostics', function (): void {
    $payment = Payment::query()->create([
        'order_id' => $this->order->id, 'provider' => 'mercadopago', 'environment' => 'sandbox',
        'idempotency_key' => Str::uuid(), 'method' => 'credit_card', 'gross_amount_cents' => 9990,
        'net_amount_cents' => 9990, 'status' => 'failed', 'failure_reason' => 'internal provider secret',
    ]);
    app(OrderEmailService::class)->paymentUnconfirmed($payment);
    app(OrderEmailService::class)->paymentUnconfirmed($payment);
    Mail::assertSentCount(1);
    Mail::assertSent(OrderStatusMail::class, fn ($mail) => ! str_contains($mail->render(), 'internal provider secret'));
});

test('stops automatic delivery attempts after three SMTP failures', function (): void {
    Queue::fake();
    app(OrderEmailService::class)->statusChanged($this->order);
    $notification = OrderEmailNotification::firstOrFail();
    Mail::shouldReceive('to')->times(3)->andThrow(new RuntimeException('SMTP unavailable'));
    for ($attempt = 0; $attempt < 3; $attempt++) {
        expect(fn () => (new SendOrderEmailNotification($notification->id))->handle())->toThrow(RuntimeException::class);
    }
    (new SendOrderEmailNotification($notification->id))->handle();
    expect($notification->fresh()->attempts)->toBe(3);
});
