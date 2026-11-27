<?php

declare(strict_types=1);

use App\Domain\Shared\Enums\OrderStatus;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Models\Address;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Payment;
use App\Models\ProductVariant;
use App\Models\StockReservation;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
    Mail::fake();
    realPaymentFakes();
});

function createTestOrder(User $user, OrderStatus $status = OrderStatus::PendingPayment): Order
{
    $variant = ProductVariant::query()->where('is_active', true)->firstOrFail();

    $order = Order::query()->create([
        'user_id' => $user->id,
        'order_number' => 'MF-' . date('Ymd') . '-' . strtoupper(Str::random(6)),
        'public_token' => Str::random(40),
        'idempotency_key' => Str::uuid()->toString(),
        'customer_name' => $user->name,
        'customer_email' => $user->email,
        'customer_phone' => '11999998888',
        'customer_cpf_cnpj' => '52998224725',
        'status' => $status,
        'payment_provider' => 'mercadopago',
        'payment_environment' => 'sandbox',
        'payment_method' => 'pix',
        'subtotal_cents' => 3500,
        'discount_cents' => 0,
        'shipping_cents' => 0,
        'total_cents' => 3500,
        'shipping_address_snapshot' => [
            'cep' => '01310100',
            'street' => 'Av Paulista',
            'number' => '1000',
            'neighborhood' => 'Bela Vista',
            'city' => 'São Paulo',
            'state' => 'SP',
        ],
        'shipping_service_snapshot' => 'PAC',
    ]);

    OrderItem::query()->create([
        'order_id' => $order->id,
        'product_id' => $variant->product_id,
        'product_variant_id' => $variant->id,
        'product_name_snapshot' => 'Esmalte Teste',
        'variant_name_snapshot' => 'Cor Padrão',
        'sku_snapshot' => $variant->sku,
        'quantity' => 1,
        'unit_price_cents' => 3500,
        'total_cents' => 3500,
    ]);

    StockReservation::query()->create([
        'order_id' => $order->id,
        'product_variant_id' => $variant->id,
        'quantity' => 1,
        'status' => 'active',
        'expires_at' => now()->addMinutes(30),
    ]);

    Payment::query()->create([
        'order_id' => $order->id,
        'idempotency_key' => Str::uuid()->toString(),
        'provider' => 'mercadopago',
        'environment' => 'sandbox',
        'method' => 'pix',
        'installments' => 1,
        'gross_amount_cents' => 3500,
        'status' => PaymentStatus::Pending,
        'pix_copy_paste' => '00020126580014br.gov.bcb.pix...',
    ]);

    return $order;
}

test('unauthenticated users are strictly rejected from account orders endpoints', function (): void {
    $this->getJson('/api/v1/account/orders')->assertUnauthorized();
    $this->getJson('/api/v1/account/orders/MF-NONEXISTENT')->assertUnauthorized();
    $this->postJson('/api/v1/account/orders/MF-NONEXISTENT/cancel')->assertUnauthorized();
});

test('user cannot view or cancel another user orders (Anti-IDOR isolation)', function (): void {
    $user1 = User::factory()->create(['email' => 'cliente1@example.com']);
    $user2 = User::factory()->create(['email' => 'cliente2@example.com']);

    $order1 = createTestOrder($user1, OrderStatus::PendingPayment);

    // User 2 authenticated tries to access User 1's order
    $this->actingAs($user2)
        ->getJson("/api/v1/account/orders/{$order1->order_number}")
        ->assertNotFound();

    // User 2 authenticated tries to cancel User 1's order
    $this->actingAs($user2)
        ->postJson("/api/v1/account/orders/{$order1->order_number}/cancel", [
            'reason' => 'Tentativa maliciosa de outro usuário',
        ])
        ->assertNotFound();

    // Order 1 remains unchanged in PendingPayment status
    expect($order1->fresh()->status)->toBe(OrderStatus::PendingPayment);
});

test('user cannot access, update or delete another user addresses (Anti-IDOR)', function (): void {
    $user1 = User::factory()->create(['email' => 'user1.addr@example.com']);
    $user2 = User::factory()->create(['email' => 'user2.addr@example.com']);

    $addr1 = Address::query()->create([
        'user_id' => $user1->id,
        'recipient_name' => 'Cliente 1',
        'label' => 'Casa',
        'cep' => '01310100',
        'street' => 'Rua do Cliente 1',
        'number' => '10',
        'neighborhood' => 'Centro',
        'city' => 'São Paulo',
        'state' => 'SP',
        'is_default' => true,
    ]);

    // User 2 tries to update User 1's address
    $this->actingAs($user2)
        ->putJson("/api/v1/account/addresses/{$addr1->id}", [
            'recipient_name' => 'Cliente Invasor',
            'label' => 'Hacked',
            'cep' => '01310100',
            'street' => 'Rua Invasora',
            'number' => '99',
            'neighborhood' => 'Centro',
            'city' => 'São Paulo',
            'state' => 'SP',
        ])
        ->assertNotFound();

    // User 2 tries to delete User 1's address
    $this->actingAs($user2)
        ->deleteJson("/api/v1/account/addresses/{$addr1->id}")
        ->assertNotFound();

    // Address remains untouched
    expect($addr1->fresh()->street)->toBe('Rua do Cliente 1');
});

test('customer can successfully cancel their own pending payment order and releases stock reservation', function (): void {
    $user = User::factory()->create(['email' => 'cliente.cancela@example.com']);
    $order = createTestOrder($user, OrderStatus::PendingPayment);

    $response = $this->actingAs($user)
        ->postJson("/api/v1/account/orders/{$order->order_number}/cancel", [
            'reason' => 'Mudei de ideia sobre a cor',
        ])
        ->assertOk();

    $response->assertJsonPath('data.status', 'cancelled');
    $response->assertJsonPath('data.order_number', $order->order_number);

    $freshOrder = $order->fresh();
    expect($freshOrder->status)->toBe(OrderStatus::Cancelled);
    expect($freshOrder->cancelled_at)->not->toBeNull();
    expect($freshOrder->notes_internal)->toContain('Mudei de ideia sobre a cor');

    // Status history recorded
    $history = OrderStatusHistory::query()->where('order_id', $order->id)->latest('id')->first();
    expect($history)->not->toBeNull();
    expect($history->to_status)->toBe('cancelled');
    expect($history->user_id)->toBe($user->id);

    // Stock reservation released
    $reservation = StockReservation::query()->where('order_id', $order->id)->first();
    expect($reservation->status)->toBe('released');
});

test('customer cannot cancel an order that is already paid, preparing or shipped', function (): void {
    $user = User::factory()->create(['email' => 'cliente.pago@example.com']);

    // Paid order
    $orderPaid = createTestOrder($user, OrderStatus::Paid);
    $this->actingAs($user)
        ->postJson("/api/v1/account/orders/{$orderPaid->order_number}/cancel")
        ->assertStatus(422)
        ->assertJsonValidationErrors(['order']);

    expect($orderPaid->fresh()->status)->toBe(OrderStatus::Paid);

    // Preparing order
    $orderPrep = createTestOrder($user, OrderStatus::Preparing);
    $this->actingAs($user)
        ->postJson("/api/v1/account/orders/{$orderPrep->order_number}/cancel")
        ->assertStatus(422)
        ->assertJsonValidationErrors(['order']);

    // Shipped order
    $orderShipped = createTestOrder($user, OrderStatus::Shipped);
    $this->actingAs($user)
        ->postJson("/api/v1/account/orders/{$orderShipped->order_number}/cancel")
        ->assertStatus(422)
        ->assertJsonValidationErrors(['order']);
});

test('customer cannot cancel an already cancelled order', function (): void {
    $user = User::factory()->create(['email' => 'cliente.dup@example.com']);
    $order = createTestOrder($user, OrderStatus::Cancelled);

    $this->actingAs($user)
        ->postJson("/api/v1/account/orders/{$order->order_number}/cancel")
        ->assertStatus(422)
        ->assertJsonValidationErrors(['order']);
});

test('guest customer can cancel pending order via secure public token', function (): void {
    $user = User::factory()->create(['email' => 'visitante@example.com']);
    $order = createTestOrder($user, OrderStatus::PendingPayment);

    // Cancel with valid public token
    $this->postJson("/api/v1/orders/{$order->public_token}/cancel", [
        'reason' => 'Desisti da compra',
    ])
        ->assertOk()
        ->assertJsonPath('data.order.status', 'cancelled');

    expect($order->fresh()->status)->toBe(OrderStatus::Cancelled);
    expect($order->fresh()->cancelled_at)->not->toBeNull();

    // Trying to cancel again with same token returns 422
    $this->postJson("/api/v1/orders/{$order->public_token}/cancel")
        ->assertStatus(422);

    // Invalid token returns 404
    $this->postJson("/api/v1/orders/token-totalmente-invalido-12345/cancel")
        ->assertNotFound();
});

test('public order tracking endpoint masks sensitive customer details', function (): void {
    $user = User::factory()->create([
        'name' => 'Maria Silva Sauro',
        'email' => 'maria.segredo@example.com',
    ]);
    $order = createTestOrder($user, OrderStatus::PendingPayment);

    $response = $this->getJson("/api/v1/orders/track/{$order->public_token}")
        ->assertOk();

    // Only first name is exposed
    $response->assertJsonPath('data.order.customer_first_name', 'Maria');

    // Sensitive data must never be exposed publicly
    $json = $response->json();
    expect(json_encode($json))->not->toContain('maria.segredo@example.com');
    expect(json_encode($json))->not->toContain('52998224725');
    expect(json_encode($json))->not->toContain('11999998888');
    expect(json_encode($json))->not->toContain('Av Paulista');
});
