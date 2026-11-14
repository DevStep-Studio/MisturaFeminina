<?php

declare(strict_types=1);

use App\Mail\RestockAvailableMail;
use App\Models\Coupon;
use App\Models\IntegrationSetting;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockReservation;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
    Mail::fake();
});

test('storefront bootstrap, home, search, and restock alert work end-to-end', function (): void {
    $this->getJson('/api/v1/storefront/bootstrap')
        ->assertOk()
        ->assertJsonPath('data.settings.store_name', 'Mistura Feminina Cosméticos')
        ->assertJsonCount(6, 'data.menu_categories');

    $this->getJson('/api/v1/storefront/home')
        ->assertOk()
        ->assertJsonStructure(['data' => ['sections']]);

    $this->getJson('/api/v1/catalog/search?q=Esmalte&autocomplete=1')
        ->assertOk()
        ->assertJsonFragment(['slug' => 'esmalte-gel-alta-duracao-15ml']);

    // Out of stock product allows registering restock alert
    $outProduct = Product::query()->where('sku', 'MF-PIN-011')->firstOrFail();
    $outVariant = $outProduct->variants()->firstOrFail();
    expect($outVariant->availableStock())->toBe(0);

    $this->postJson("/api/v1/catalog/products/{$outProduct->slug}/restock-alert", [
        'email' => 'avise@misturafeminina.local',
        'name' => 'Carla',
        'variant_id' => $outVariant->id,
    ])->assertCreated();

    // Admin replenishes stock -> RestockAvailableMail queued automatically
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();
    $this->actingAs($admin)
        ->postJson("/api/v1/admin/variants/{$outVariant->id}/stock", [
            'qty_delta' => 10,
            'reason' => 'Entrada de lote',
        ])
        ->assertOk()
        ->assertJsonPath('data.stock_qty', 10);

    Mail::assertQueued(RestockAvailableMail::class, fn (RestockAvailableMail $mail): bool => $mail->hasTo('avise@misturafeminina.local'));
});

test('guest cart merges on login, recalculates coupon/shipping, and prevents last-unit overselling', function (): void {
    $variant = ProductVariant::query()->where('sku', 'MF-MSC-004')->firstOrFail();
    $variant->update(['stock_qty' => 1, 'reserved_qty' => 0]);

    // Guest adds last 1 unit
    $addResp = $this->postJson('/api/v1/cart/items', [
        'variant_id' => $variant->id,
        'quantity' => 1,
    ])->assertCreated();

    $guestToken = (string) $addResp->json('data.token');
    expect($guestToken)->not->toBeEmpty();

    // Another customer logs in and merges guest cart
    $customer = User::query()->where('email', 'cliente@misturafeminina.local')->firstOrFail();
    $this->withHeader('X-Cart-Token', $guestToken)
        ->postJson('/login', [
            'email' => $customer->email,
            'password' => 'Cliente@2026!',
        ])
        ->assertNoContent();

    $cartResp = $this->actingAs($customer)->getJson('/api/v1/cart')->assertOk();
    expect($cartResp->json('data.items_count'))->toBe(1);

    // Apply valid coupon BEMVINDA10 (effective price 5490 >= 5000)
    $this->actingAs($customer)
        ->postJson('/api/v1/cart/coupon', ['code' => 'BEMVINDA10'])
        ->assertOk()
        ->assertJsonPath('data.coupon_code', 'BEMVINDA10')
        ->assertJsonPath('data.coupon_discount_cents', 549);

    // Invalid coupon rejected with 422
    $this->actingAs($customer)
        ->postJson('/api/v1/cart/coupon', ['code' => 'NAOEXISTE'])
        ->assertStatus(422);

    // Shipping quote returns server quotes
    $quoteResp = $this->actingAs($customer)
        ->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310-100'])
        ->assertOk();
    $quoteId = (int) $quoteResp->json('data.options.0.quote_id');

    $idempotencyKey = 'idem-last-unit-001';
    $checkoutPayload = [
        'customer_name' => 'Marina Almeida',
        'customer_email' => 'cliente@misturafeminina.local',
        'customer_phone' => '11988881234',
        'customer_cpf_cnpj' => '12345678909',
        'shipping_quote_id' => $quoteId,
        'shipping_address' => [
            'cep' => '01310-100',
            'street' => 'Av Paulista',
            'number' => '1500',
            'neighborhood' => 'Bela Vista',
            'city' => 'São Paulo',
            'state' => 'SP',
        ],
        'payment_method' => 'pix',
    ];

    $first = $this->actingAs($customer)
        ->withHeader('X-Idempotency-Key', $idempotencyKey)
        ->postJson('/api/v1/checkout', $checkoutPayload)
        ->assertCreated();

    $orderNumber = (string) $first->json('data.order.order_number');
    expect($first->json('data.payment.pix_copy_paste'))->not->toBeEmpty();

    // Same idempotency key does NOT create duplicate order
    $duplicate = $this->actingAs($customer)
        ->withHeader('X-Idempotency-Key', $idempotencyKey)
        ->postJson('/api/v1/checkout', $checkoutPayload)
        ->assertCreated();
    expect($duplicate->json('data.order.order_number'))->toBe($orderNumber);

    // Physical stock still 1, reserved is 1 => available is 0
    $variant->refresh();
    expect($variant->availableStock())->toBe(0);

    // Concurrent/second buyer tries to buy the same 1 unit -> blocked 422!
    $secondCart = $this->postJson('/api/v1/cart/items', [
        'variant_id' => $variant->id,
        'quantity' => 1,
    ])->assertStatus(422);
    expect($secondCart->json('errors.quantity.0'))->toContain('estoque');
});

test('pix sandbox webhook HMAC validation and 10x duplicate idempotency work reliably', function (): void {
    IntegrationSetting::query()->where('provider', 'mercadopago')->firstOrFail()->update([
        'encrypted_credentials' => ['webhook_secret' => 'sbx-secret-key-123'],
    ]);

    $variant = ProductVariant::query()->where('sku', 'MF-CAB-007')->firstOrFail();
    $initialStock = $variant->stock_qty;

    $add = $this->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 2])->assertCreated();
    $token = (string) $add->json('data.token');

    $quote = $this->withHeader('X-Cart-Token', $token)
        ->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310-100'])
        ->assertOk();
    $quoteId = (int) $quote->json('data.options.0.quote_id');

    $checkout = $this->withHeader('X-Cart-Token', $token)
        ->withHeader('X-Idempotency-Key', 'idem-pix-hmac-1')
        ->postJson('/api/v1/checkout', [
            'customer_name' => 'Beatriz Guest',
            'customer_email' => 'beatriz@misturafeminina.local',
            'customer_phone' => '11977776666',
            'shipping_quote_id' => $quoteId,
            'shipping_address' => [
                'cep' => '01310-100',
                'street' => 'Rua Augusta',
                'number' => '100',
                'neighborhood' => 'Consolação',
                'city' => 'São Paulo',
                'state' => 'SP',
            ],
            'payment_method' => 'pix',
        ])->assertCreated();

    $order = Order::query()->where('order_number', $checkout->json('data.order.order_number'))->with('latestPayment')->firstOrFail();
    $extOrderId = (string) $order->latestPayment->external_order_id;

    // Tampered webhook signature rejected 401
    $this->withHeaders([
        'x-signature' => 'ts=1730000000,v1=invalidhash',
        'x-request-id' => 'req-999',
    ])->postJson('/api/v1/webhooks/mercadopago', [
        'id' => 'evt-1',
        'type' => 'order',
        'action' => 'order.processed',
        'data' => ['id' => $extOrderId, 'status' => 'processed'],
    ])->assertStatus(401);

    // Compute valid HMAC signature per Mercado Pago manifest
    $ts = '1730000001';
    $reqId = 'req-valid-001';
    $sig = hash_hmac('sha256', "id:{$extOrderId};request-id:{$reqId};ts:{$ts};", 'sbx-secret-key-123');

    $payload = [
        'id' => 'evt-mp-valid-1',
        'type' => 'order',
        'action' => 'order.processed',
        'data' => ['id' => $extOrderId, 'status' => 'approved'],
    ];

    // Replay the exact webhook 10 times — must process idempotently without deducting stock twice!
    for ($i = 0; $i < 10; $i++) {
        $this->withHeaders([
            'x-signature' => "ts={$ts},v1={$sig}",
            'x-request-id' => $reqId,
        ])->postJson('/api/v1/webhooks/mercadopago', $payload)->assertOk();
    }

    $order->refresh();
    $variant->refresh();

    expect($order->status->value)->toBe('paid')
        ->and($variant->stock_qty)->toBe($initialStock - 2)
        ->and($variant->reserved_qty)->toBe(0);

    // Tracking lookup validates order number + email
    $this->postJson('/api/v1/orders/track-lookup', [
        'order_number' => $order->order_number,
        'identifier' => 'beatriz@misturafeminina.local',
    ])->assertOk()->assertJsonPath('data.order.status', 'paid');

    // Wrong email blocked with 404
    $this->postJson('/api/v1/orders/track-lookup', [
        'order_number' => $order->order_number,
        'identifier' => 'intruder@example.com',
    ])->assertNotFound();
});

test('declined card releases reservation and expired reservations release via command', function (): void {
    $variant = ProductVariant::query()->where('sku', 'MF-PRM-008')->firstOrFail();
    $initialStock = $variant->stock_qty;

    $add = $this->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 3])->assertCreated();
    $token = (string) $add->json('data.token');
    $quote = $this->withHeader('X-Cart-Token', $token)->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310-100'])->assertOk();
    $quoteId = (int) $quote->json('data.options.0.quote_id');

    $declined = $this->withHeader('X-Cart-Token', $token)
        ->withHeader('X-Idempotency-Key', 'idem-card-declined-1')
        ->postJson('/api/v1/checkout', [
            'customer_name' => 'Julia Teste',
            'customer_email' => 'julia@misturafeminina.local',
            'customer_phone' => '11999991111',
            'shipping_quote_id' => $quoteId,
            'shipping_address' => [
                'cep' => '01310-100',
                'street' => 'Av Brasil',
                'number' => '50',
                'neighborhood' => 'Jardins',
                'city' => 'São Paulo',
                'state' => 'SP',
            ],
            'payment_method' => 'credit_card',
            'payment_data' => [
                'installments' => 3,
                'card_token' => 'sbx_tok_rejected',
                'card_last_four' => '0004',
                'payment_method_id' => 'master',
                'sandbox_outcome' => 'rejected',
            ],
        ])->assertCreated();

    expect($declined->json('data.order.status'))->toBe('payment_failed');
    $variant->refresh();
    expect($variant->availableStock())->toBe($initialStock);

    // Retry payment with approval succeeds cleanly
    $publicToken = (string) $declined->json('data.order.public_token');
    $retry = $this->postJson("/api/v1/orders/{$publicToken}/retry-payment", [
        'payment_method' => 'credit_card',
        'payment_data' => [
            'installments' => 2,
            'card_token' => 'sbx_tok_ok',
            'card_last_four' => '4242',
            'payment_method_id' => 'visa',
            'sandbox_outcome' => 'approved',
        ],
    ])->assertOk();

    expect($retry->json('data.order.status'))->toBe('paid');
    $variant->refresh();
    expect($variant->stock_qty)->toBe($initialStock - 3)
        ->and($variant->reserved_qty)->toBe(0);

    // Test expired pending reservation cleanup
    $add2 = $this->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 2])->assertCreated();
    $token2 = (string) $add2->json('data.token');
    $quote2 = $this->withHeader('X-Cart-Token', $token2)->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310-100'])->assertOk();
    $pendingCheckout = $this->withHeaders([
        'X-Cart-Token' => $token2,
        'X-Idempotency-Key' => 'idem-expired-pix-1',
    ])
        ->postJson('/api/v1/checkout', [
            'customer_name' => 'Ana Expirada',
            'customer_email' => 'ana@misturafeminina.local',
            'customer_phone' => '11977771111',
            'shipping_quote_id' => (int) $quote2->json('data.options.0.quote_id'),
            'shipping_address' => [
                'cep' => '01310-100',
                'street' => 'Rua Oscar Freire',
                'number' => '10',
                'neighborhood' => 'Pinheiros',
                'city' => 'São Paulo',
                'state' => 'SP',
            ],
            'payment_method' => 'pix',
        ])->assertCreated();

    $pendingOrder = Order::query()->where('order_number', $pendingCheckout->json('data.order.order_number'))->firstOrFail();
    $pendingOrder->update(['stock_reserved_until' => now()->subMinutes(5)]);
    StockReservation::query()->where('order_id', $pendingOrder->id)->update(['expires_at' => now()->subMinutes(5)]);

    Artisan::call('mistura:release-expired-reservations');

    expect($pendingOrder->fresh()->status->value)->toBe('expired');
    expect($variant->fresh()->reserved_qty)->toBe(0);
});
