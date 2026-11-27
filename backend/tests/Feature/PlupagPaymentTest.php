<?php

declare(strict_types=1);

use App\Domain\Payments\Services\PaymentGateway;
use App\Domain\Payments\Services\PaymentService;
use App\Domain\Payments\Services\PaymentSettings;
use App\Domain\Shared\Enums\OrderStatus;
use App\Domain\Shared\Enums\PaymentMethod;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Jobs\ProcessPaymentEvent;
use App\Models\IntegrationSetting;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\ProductVariant;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

function preparePlupagStore(bool $active = true): void
{
    test()->seed(DemoStoreSeeder::class);
    Mail::fake();

    IntegrationSetting::query()->updateOrCreate(
        ['provider' => 'plupag'],
        [
            'environment' => 'sandbox',
            'is_active' => $active,
            'encrypted_credentials' => [
                'api_key' => 'plupag_test_api_key_123',
                'api_secret' => 'plupag_test_secret_456',
                'webhook_secret' => 'plupag_wh_secret_789',
            ],
            'public_config' => [
                'public_key' => 'plupag_pub_key_abc',
            ],
        ]
    );
}

function plupagCheckoutCart(): array
{
    $variant = ProductVariant::where('sku', 'MF-CAB-007')->firstOrFail();
    $token = test()->withHeader('X-Cart-Token', Str::uuid()->toString())
        ->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])
        ->assertCreated()
        ->json('data.token');

    $quote = test()->withHeader('X-Cart-Token', $token)
        ->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310100'])
        ->assertOk()
        ->json('data.options.0.quote_id');

    return [
        'token' => $token,
        'body' => [
            'customer_name' => 'Cliente Plupag Teste',
            'customer_email' => 'cliente.plupag@example.com',
            'customer_phone' => '11988887777',
            'customer_cpf_cnpj' => '52998224725',
            'shipping_quote_id' => $quote,
            'shipping_address' => [
                'cep' => '01310100',
                'street' => 'Av Paulista',
                'number' => '1500',
                'neighborhood' => 'Bela Vista',
                'city' => 'São Paulo',
                'state' => 'SP',
            ],
            'payment_provider' => 'plupag',
            'payment_method' => 'pix',
        ],
    ];
}

test('checkout config returns plupag among available providers when enabled', function (): void {
    preparePlupagStore(true);

    $res = $this->getJson('/api/v1/checkout/config')->assertOk();
    $data = $res->json('data');

    expect($data['available_providers'])->toBeArray();
    $plupag = collect($data['available_providers'])->firstWhere('id', 'plupag');
    expect($plupag)->not->toBeNull()
        ->and($plupag['name'])->toBe('Plupag')
        ->and($plupag['public_key'])->toBe('plupag_pub_key_abc')
        ->and($plupag['methods'])->toContain('pix', 'credit_card');
});

test('transparent checkout creates pix invoice with qr code on plupag', function (): void {
    preparePlupagStore(true);
    $cart = plupagCheckoutCart();

    Http::preventStrayRequests();
    Http::fake([
        'api.plupag.com.br/v1/invoices/recipient' => function (Request $r) {
            return Http::response([
                'id' => 98765,
                'identifier' => 'inv-plupag-98765',
                'amount' => $r['amount'],
                'status' => 'pending',
                'paymentMethod' => 'pix',
                'externalId' => $r['externalId'],
                'paymentData' => [
                    'pixKey' => '00020126580014BR.GOV.BCB.PIX0136test-pix-copia-e-cola',
                    'pixQrCode' => 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                ],
                'dueDate' => '2026-12-01',
            ], 201);
        },
    ]);

    $res = $this->withHeaders([
        'X-Cart-Token' => $cart['token'],
        'X-Idempotency-Key' => 'plupag-idemp-1',
    ])->postJson('/api/v1/checkout', $cart['body'])->assertCreated();

    $order = Order::where('customer_email', 'cliente.plupag@example.com')->firstOrFail();
    expect($order->payment_provider)->toBe('plupag');

    $payment = $order->latestPayment;
    expect($payment)->not->toBeNull()
        ->and($payment->provider)->toBe('plupag')
        ->and($payment->external_payment_id)->toBe('98765')
        ->and($payment->status)->toBe(PaymentStatus::Pending)
        ->and($payment->pix_copy_paste)->toBe('00020126580014BR.GOV.BCB.PIX0136test-pix-copia-e-cola')
        ->and($payment->pix_qr_code_base64)->not->toBeNull();

    Http::assertSent(function (Request $req) {
        return $req->url() === 'https://api.plupag.com.br/v1/invoices/recipient'
            && $req->hasHeader('x-api-key', 'plupag_test_api_key_123')
            && $req->hasHeader('x-api-secret', 'plupag_test_secret_456')
            && $req['paymentMethod'] === 'pix'
            && $req['client']['document'] === '52998224725';
    });
});

test('plupag webhook transitions payment and order to approved/paid idempotently', function (): void {
    preparePlupagStore(true);
    $cart = plupagCheckoutCart();

    $storedAmount = 0.0;
    $storedExternalId = '';

    Http::preventStrayRequests();
    Http::fake([
        'api.plupag.com.br/v1/invoices/recipient' => function (Request $r) use (&$storedAmount, &$storedExternalId) {
            $storedAmount = (float) $r['amount'];
            $storedExternalId = (string) $r['externalId'];
            return Http::response([
                'id' => 98766,
                'identifier' => 'inv-plupag-98766',
                'amount' => $storedAmount,
                'status' => 'pending',
                'paymentMethod' => 'pix',
                'externalId' => $storedExternalId,
                'paymentData' => ['pixKey' => 'key-123', 'pixQrCode' => 'base64-123'],
            ], 201);
        },
        'api.plupag.com.br/v1/invoices/recipient/98766' => function () use (&$storedAmount, &$storedExternalId) {
            return Http::response([
                'id' => 98766,
                'identifier' => 'inv-plupag-98766',
                'amount' => $storedAmount,
                'status' => 'paid',
                'paymentMethod' => 'pix',
                'externalId' => $storedExternalId,
                'calculatedFee' => 2.50,
                'paidAt' => now()->toIso8601String(),
            ], 200);
        },
    ]);

    $this->withHeaders([
        'X-Cart-Token' => $cart['token'],
        'X-Idempotency-Key' => 'plupag-wh-idemp',
    ])->postJson('/api/v1/checkout', $cart['body'])->assertCreated();

    $order = Order::where('customer_email', 'cliente.plupag@example.com')->firstOrFail();
    expect($order->status)->toBe(OrderStatus::PendingPayment);

    // Enviar webhook da Plupag
    $webhookPayload = [
        'event' => 'invoice.updated',
        'id' => 'evt_plupag_001',
        'data' => [
            'id' => 98766,
            'identifier' => 'inv-plupag-98766',
            'status' => 'paid',
            'amount' => $storedAmount,
            'externalId' => 'plupag-wh-idemp',
        ],
    ];

    $this->withHeaders([
        'x-webhook-token' => 'plupag_wh_secret_789',
    ])->postJson('/api/v1/webhooks/plupag', $webhookPayload)->assertOk()->assertJsonPath('status', 'received');

    $order->refresh();
    expect($order->status)->toBe(OrderStatus::Paid);
    expect($order->latestPayment->status)->toBe(PaymentStatus::Approved);
    expect($order->latestPayment->fee_cents)->toBe(250);

    // Reenvio do mesmo webhook não duplica processamento
    $this->withHeaders([
        'x-webhook-token' => 'plupag_wh_secret_789',
    ])->postJson('/api/v1/webhooks/plupag', $webhookPayload)->assertOk();

    expect(PaymentEvent::count())->toBe(1);
});

test('plupag webhook rejects invalid secret with 401', function (): void {
    preparePlupagStore(true);

    $this->withHeaders([
        'x-webhook-token' => 'wrong_secret',
    ])->postJson('/api/v1/webhooks/plupag', [
        'event' => 'invoice.updated',
        'data' => ['id' => 123],
    ])->assertStatus(401);
});

test('plupag transparent credit card checkout handles approved card', function (): void {
    preparePlupagStore(true);
    $cart = plupagCheckoutCart();

    $body = [
        ...$cart['body'],
        'payment_method' => 'credit_card',
        'payment_data' => [
            'card_token' => 'tok_plupag_test_card_999',
            'installments' => 3,
            'card_last_four' => '1234',
            'brand' => 'mastercard',
        ],
    ];

    Http::preventStrayRequests();
    Http::fake([
        'api.plupag.com.br/v1/invoices/recipient' => function (Request $r) {
            return Http::response([
                'id' => 98770,
                'identifier' => 'inv-card-98770',
                'amount' => $r['amount'],
                'status' => 'approved',
                'paymentMethod' => 'credit_card',
                'externalId' => $r['externalId'],
                'paidAt' => now()->toIso8601String(),
            ], 201);
        },
    ]);

    $this->withHeaders([
        'X-Cart-Token' => $cart['token'],
        'X-Idempotency-Key' => 'plupag-card-idemp',
    ])->postJson('/api/v1/checkout', $body)->assertCreated();

    $order = Order::where('customer_email', 'cliente.plupag@example.com')->firstOrFail();
    expect($order->status)->toBe(OrderStatus::Paid);
    expect($order->latestPayment->status)->toBe(PaymentStatus::Approved);
    expect($order->latestPayment->provider)->toBe('plupag');

    Http::assertSent(function (Request $req) {
        return $req->url() === 'https://api.plupag.com.br/v1/invoices/recipient'
            && $req['paymentMethod'] === 'credit_card'
            && $req['creditCard']['token'] === 'tok_plupag_test_card_999'
            && $req['creditCard']['installments'] === 3;
    });
});

test('plupag handles rejected card with safe diagnostic', function (): void {
    preparePlupagStore(true);
    $cart = plupagCheckoutCart();

    $body = [
        ...$cart['body'],
        'payment_method' => 'credit_card',
        'payment_data' => [
            'card_token' => 'tok_plupag_rejected',
            'installments' => 1,
        ],
    ];

    Http::preventStrayRequests();
    Http::fake([
        'api.plupag.com.br/v1/invoices/recipient' => function (Request $r) {
            return Http::response([
                'id' => 98771,
                'identifier' => 'inv-card-rejected',
                'amount' => $r['amount'],
                'status' => 'rejected',
                'paymentMethod' => 'credit_card',
                'externalId' => $r['externalId'],
            ], 201);
        },
    ]);

    $this->withHeaders([
        'X-Cart-Token' => $cart['token'],
        'X-Idempotency-Key' => 'plupag-card-rej',
    ])->postJson('/api/v1/checkout', $body)->assertCreated();

    $order = Order::where('customer_email', 'cliente.plupag@example.com')->firstOrFail();
    expect($order->status)->toBe(OrderStatus::PaymentFailed);
    expect($order->latestPayment->status)->toBe(PaymentStatus::Rejected);
    expect($order->latestPayment->failure_reason)->not->toBeNull();
});
