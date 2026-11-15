<?php

declare(strict_types=1);
use App\Domain\Payments\Services\GatewayFailure;
use App\Domain\Payments\Services\PaymentService;
use App\Domain\Settings\Services\StoreSettingsService;
use App\Jobs\ProcessPaymentEvent;
use App\Models\CartItem;
use App\Models\IntegrationSetting;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentEvent;
use App\Models\ProductVariant;
use App\Models\ShippingQuote;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;

function prepareRealStore(): void
{
    test()->seed(DemoStoreSeeder::class);
    Mail::fake();
    realPaymentFakes();
}
function checkoutCart(): array
{
    $variant = ProductVariant::where('sku', 'MF-CAB-007')->firstOrFail();
    $token = test()->withHeader('X-Cart-Token', Str::uuid()->toString())->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])->assertCreated()->json('data.token');
    $quote = test()->withHeader('X-Cart-Token', $token)->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310100'])->assertOk()->json('data.options.0.quote_id');

    return ['token' => $token, 'body' => ['customer_name' => 'Cliente Checkout', 'customer_email' => 'cliente@example.com', 'customer_phone' => '11999999999', 'customer_cpf_cnpj' => '52998224725', 'shipping_quote_id' => $quote, 'shipping_address' => ['cep' => '01310100', 'street' => 'Av Paulista', 'number' => '100', 'neighborhood' => 'Bela Vista', 'city' => 'São Paulo', 'state' => 'SP'], 'payment_method' => 'pix']];
}

test('disabled provider returns 503 without creating order or loading credentials publicly', function (): void {
    prepareRealStore();
    IntegrationSetting::where('provider', 'mercadopago')->firstOrFail()->update(['is_active' => false]);
    $cart = checkoutCart();
    $this->getJson('/api/v1/checkout/config')->assertOk()->assertJsonPath('data.enabled', false)->assertJsonMissing(['access_token' => 'TEST-token']);
    $this->withHeader('X-Cart-Token', $cart['token'])->postJson('/api/v1/checkout', $cart['body'])->assertStatus(503);
    expect(Order::count())->toBe(0);
    Http::assertNothingSent();
});
test('deferred Mercado Pago order uses server totals and only charges after Brick token', function (): void {
    prepareRealStore();
    $cart = checkoutCart();
    $body = [...$cart['body'], 'payment_method' => 'credit_card', 'defer_payment' => true];
    $created = $this->withHeaders(['X-Cart-Token' => $cart['token'], 'X-Idempotency-Key' => 'brick-order'])->postJson('/api/v1/checkout', $body)->assertCreated()->assertJsonPath('data.payment', null);
    Http::assertNothingSent();
    $token = $created->json('data.order.public_token');
    $total = $created->json('data.order.total_cents');
    $this->withHeader('X-Idempotency-Key', 'brick-payment')->postJson("/api/v1/orders/$token/retry-payment", ['payment_method' => 'credit_card', 'payment_data' => ['card_token' => 'token-from-sdk', 'payment_method_id' => 'visa', 'installments' => 1]])->assertOk()->assertJsonPath('data.order.status', 'paid');
    Http::assertSent(fn (Request $r) => $r->method() === 'POST' && $r['transaction_amount'] === $total / 100 && $r['token'] === 'token-from-sdk' && $r->hasHeader('X-Idempotency-Key', 'brick-payment'));
    expect(Order::count())->toBe(1);
    $this->withHeader('X-Idempotency-Key', 'brick-order')->postJson('/api/v1/checkout', [...$body, 'customer_name' => 'Outro Nome'])->assertConflict();
});
test('quote cannot cross carts or survive changed quantities and dimensions', function (): void {
    prepareRealStore();
    $first = checkoutCart();
    $second = checkoutCart();
    $this->withHeader('X-Cart-Token', $second['token'])->postJson('/api/v1/cart/shipping/select', ['quote_id' => $first['body']['shipping_quote_id']])->assertNotFound();
    $variant = ProductVariant::where('sku', 'MF-CAB-007')->firstOrFail();
    $variant->update(['weight_grams' => 999]);
    $this->withHeader('X-Cart-Token', $first['token'])->postJson('/api/v1/checkout', $first['body'])->assertUnprocessable();
    expect(Order::count())->toBe(0);
});
test('Asaas creates hosted boleto with frozen reference and total and validates webhook token', function (): void {
    prepareRealStore();
    app(StoreSettingsService::class)->setMany(['payment_provider' => 'asaas']);
    IntegrationSetting::create(['provider' => 'asaas', 'environment' => 'sandbox', 'is_active' => true, 'encrypted_credentials' => ['api_key' => 'asaas-test', 'webhook_token' => 'asaas-secret']]);
    Http::swap(new Factory);
    Http::preventStrayRequests();
    Http::fake(['api-sandbox.asaas.com/v3/customers*' => Http::response(['data' => [['id' => 'cus_test']]]), 'api-sandbox.asaas.com/v3/payments' => function (Request $r) {
        return Http::response(['id' => 'pay_asaas', 'status' => 'PENDING', 'externalReference' => $r['externalReference'], 'value' => $r['value'], 'invoiceUrl' => 'https://sandbox.asaas.com/i/abc']);
    }]);
    $cart = checkoutCart();
    $response = $this->withHeader('X-Cart-Token', $cart['token'])->postJson('/api/v1/checkout', [...$cart['body'], 'payment_method' => 'boleto'])->assertCreated()->assertJsonPath('data.payment.provider', 'asaas')->assertJsonPath('data.payment.checkout_url', 'https://sandbox.asaas.com/i/abc');
    Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/payments') && $r['billingType'] === 'BOLETO' && $r['value'] === $response->json('data.order.total_cents') / 100 && $r->hasHeader('access_token', 'asaas-test'));
    $this->postJson('/api/v1/webhooks/asaas', ['id' => 'evt_a', 'event' => 'PAYMENT_RECEIVED', 'payment' => ['id' => 'pay_asaas']])->assertUnauthorized();
    Queue::fake([ProcessPaymentEvent::class]);
    for ($i = 0; $i < 2; $i++) {
        $this->withHeader('asaas-access-token', 'asaas-secret')->postJson('/api/v1/webhooks/asaas', ['id' => 'evt_a', 'event' => 'PAYMENT_RECEIVED', 'payment' => ['id' => 'pay_asaas']])->assertOk();
    }
    Queue::assertPushed(ProcessPaymentEvent::class, 1);
    expect(PaymentEvent::count())->toBe(1);
});
test('uncertain payment does not create a second charge when retried', function (): void {
    prepareRealStore();
    Http::swap(new Factory);
    Http::preventStrayRequests();
    Http::fake(['api.mercadopago.com/v1/payments' => Http::response([], 500)]);
    $cart = checkoutCart();
    $created = $this->withHeader('X-Cart-Token', $cart['token'])->postJson('/api/v1/checkout', $cart['body'])->assertCreated()->assertJsonPath('data.payment.status', 'unknown');
    $token = $created->json('data.order.public_token');
    $this->postJson("/api/v1/orders/$token/retry-payment", ['payment_method' => 'pix'])->assertConflict();
    Http::assertSentCount(1);
});
test('Correios authenticates and reads both price and deadline for actual package dimensions', function (): void {
    prepareRealStore();
    config(['checkout.correios' => ['enabled' => true, 'environment' => 'sandbox', 'username' => 'cws', 'password' => 'password', 'card' => '123', 'contract' => '456', 'regional' => '10', 'origin_zip' => '01001000', 'services' => ['03220:SEDEX']]]);
    Http::swap(new Factory);
    Http::preventStrayRequests();
    Http::fake(['apihom.correios.com.br/token/v1/autentica/cartaopostagem' => Http::response(['token' => 'correios-token', 'expiraEm' => now()->addHour()->toIso8601String()]), 'apihom.correios.com.br/preco/v1/nacional/03220*' => Http::response(['pcFinal' => '27,35']), 'apihom.correios.com.br/prazo/v1/nacional/03220*' => Http::response(['prazoEntrega' => 4])]);
    $variant = ProductVariant::where('sku', 'MF-CAB-007')->firstOrFail();
    $variant->update(['weight_grams' => 400, 'height_cm' => 5, 'width_cm' => 16, 'length_cm' => 20]);
    $token = $this->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 2])->assertCreated()->json('data.token');
    $this->withHeader('X-Cart-Token', $token)->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310100'])->assertOk()->assertJsonPath('data.options.0.price_cents', 2735)->assertJsonPath('data.options.0.estimated_days', 4);
    Http::assertSent(fn (Request $r) => str_contains($r->url(), '/preco/') && $r['altura'] === 10 && $r['psObjeto'] === 800 && $r['nuContrato'] === '456');
});
test('canonical provider amount mismatch cannot approve or deduct inventory', function (): void {
    prepareRealStore();
    $cart = checkoutCart();
    $created = $this->withHeader('X-Cart-Token', $cart['token'])->postJson('/api/v1/checkout', $cart['body'])->assertCreated();
    $payment = Payment::firstOrFail();
    expect(fn () => app(PaymentService::class)->apply($payment, ['id' => $payment->external_payment_id, 'status' => 'approved', 'external_reference' => $payment->idempotency_key, 'transaction_amount' => 0.01, 'currency_id' => 'BRL']))->toThrow(GatewayFailure::class);
    expect($payment->fresh()->status->value)->toBe('pending');
});
test('admin integration secrets are encrypted and only authorized roles may change them', function (): void {
    prepareRealStore();
    $admin = User::where('email', 'admin@misturafeminina.local')->firstOrFail();
    $this->actingAs($admin)->putJson('/api/v1/admin/settings/integrations/asaas', ['environment' => 'sandbox', 'is_active' => true, 'credentials' => ['api_key' => 'private-key', 'webhook_token' => 'secret-token']])->assertOk()->assertJsonMissing(['api_key' => 'private-key']);
    expect(IntegrationSetting::where('provider', 'asaas')->firstOrFail()->getRawOriginal('encrypted_credentials'))->not->toContain('private-key');
    $this->actingAs(User::where('email', 'marketing@misturafeminina.local')->firstOrFail())->putJson('/api/v1/admin/settings/integrations/asaas', ['environment' => 'production'])->assertForbidden();
});

test('configured Correios never replaces a failed live quote with the store table', function (): void {
    prepareRealStore();
    config(['checkout.correios' => ['enabled' => true, 'environment' => 'sandbox', 'username' => 'cws', 'password' => 'password', 'card' => '123', 'contract' => '456', 'regional' => '10', 'services' => ['03220:SEDEX']]]);
    Http::swap(new Factory);
    Http::preventStrayRequests();
    Http::fake(['apihom.correios.com.br/token/v1/autentica/cartaopostagem' => Http::response([], 503)]);
    $variant = ProductVariant::where('sku', 'MF-CAB-007')->firstOrFail();
    $token = $this->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])->assertCreated()->json('data.token');
    $this->withHeader('X-Cart-Token', $token)->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310100'])->assertStatus(503);
    Http::assertSentCount(1);
});
test('checkout charges the selected delivery even when another quote was previously selected', function (): void {
    prepareRealStore();
    $cart = checkoutCart();
    $original = ShippingQuote::findOrFail($cart['body']['shipping_quote_id']);
    $expensive = $original->replicate();
    $expensive->price_cents = 5500;
    $expensive->save();
    $this->withHeader('X-Cart-Token', $cart['token'])->postJson('/api/v1/checkout', [...$cart['body'], 'shipping_quote_id' => $expensive->id, 'defer_payment' => true])->assertCreated()->assertJsonPath('data.order.shipping_cents', 5500);
});

test('Asaas Pix requires settlement and canonical fees appear in admin without paid status regression', function (): void {
    prepareRealStore();
    app(StoreSettingsService::class)->setMany(['payment_provider' => 'asaas']);
    IntegrationSetting::create(['provider' => 'asaas', 'environment' => 'sandbox', 'is_active' => true, 'encrypted_credentials' => ['api_key' => 'asaas-test', 'webhook_token' => 'asaas-secret']]);
    Http::swap(new Factory);
    Http::preventStrayRequests();
    Http::fake(['api-sandbox.asaas.com/v3/customers*' => Http::response(['data' => [['id' => 'cus_a']]]), 'api-sandbox.asaas.com/v3/payments' => fn (Request $r) => Http::response(['id' => 'pay_a', 'status' => 'CONFIRMED', 'externalReference' => $r['externalReference'], 'value' => $r['value'], 'invoiceUrl' => 'https://sandbox.asaas.com/i/a'])]);
    $cart = checkoutCart();
    $this->withHeader('X-Cart-Token', $cart['token'])->postJson('/api/v1/checkout', $cart['body'])->assertCreated()->assertJsonPath('data.payment.status', 'pending');
    $payment = Payment::firstOrFail();
    $canonical = ['id' => 'pay_a', 'status' => 'RECEIVED', 'externalReference' => $payment->idempotency_key, 'value' => $payment->gross_amount_cents / 100, 'netValue' => ($payment->gross_amount_cents - 150) / 100, 'invoiceUrl' => 'https://sandbox.asaas.com/i/a'];
    $service = app(PaymentService::class);
    $service->apply($payment, $canonical);
    expect($payment->fresh()->fee_cents)->toBe(150)->and($payment->fresh()->status->value)->toBe('approved');
    $service->apply($payment, [...$canonical, 'status' => 'PENDING']);
    expect($payment->order->fresh()->status->value)->toBe('paid');
});

test('cart edited while Correios responds invalidates the in-flight quote', function (): void {
    prepareRealStore();
    config(['checkout.correios' => ['enabled' => true, 'environment' => 'sandbox', 'username' => 'cws', 'password' => 'password', 'card' => '123', 'contract' => '456', 'regional' => '10', 'services' => ['03220:SEDEX']]]);
    Http::swap(new Factory);
    Http::preventStrayRequests();
    Http::fake(['apihom.correios.com.br/token/v1/autentica/cartaopostagem' => Http::response(['token' => 'correios-token', 'expiraEm' => now()->addHour()->toIso8601String()]), 'apihom.correios.com.br/preco/v1/nacional/03220*' => function () {
        CartItem::query()->update(['quantity' => 2]);

        return Http::response(['pcFinal' => '27,35']);
    }, 'apihom.correios.com.br/prazo/v1/nacional/03220*' => Http::response(['prazoEntrega' => 4])]);
    $variant = ProductVariant::where('sku', 'MF-CAB-007')->firstOrFail();
    $token = $this->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])->assertCreated()->json('data.token');
    $this->withHeader('X-Cart-Token', $token)->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310100'])->assertUnprocessable()->assertJsonValidationErrors('cart');
    expect(ShippingQuote::count())->toBe(0);
    Http::assertSentCount(3);
});
test('scheduled reconciliation confirms a pending payment without submitting a new charge', function (): void {
    prepareRealStore();
    $this->freezeTime();
    $cart = checkoutCart();
    $this->withHeader('X-Cart-Token', $cart['token'])->postJson('/api/v1/checkout', $cart['body'])->assertCreated()->assertJsonPath('data.payment.status', 'pending');
    $this->travel(3)->minutes();
    $this->artisan('mistura:reconcile-payments')->assertSuccessful();
    expect(Payment::firstOrFail()->status->value)->toBe('approved');
    Http::assertSentCount(2);
});

test('oversized package returns validation feedback before making Correios requests', function (): void {
    prepareRealStore();
    config(['checkout.correios' => ['enabled' => true, 'environment' => 'sandbox', 'username' => 'cws', 'password' => 'password', 'card' => '123', 'contract' => '456', 'regional' => '10', 'services' => ['03220:SEDEX']]]);
    $variant = ProductVariant::where('sku', 'MF-CAB-007')->firstOrFail();
    $variant->update(['height_cm' => 101]);
    $token = $this->postJson('/api/v1/cart/items', ['variant_id' => $variant->id, 'quantity' => 1])->assertCreated()->json('data.token');
    $this->withHeader('X-Cart-Token', $token)->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310100'])->assertUnprocessable()->assertJsonValidationErrors('cart');
    Http::assertNothingSent();
});
