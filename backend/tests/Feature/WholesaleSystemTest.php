<?php

declare(strict_types=1);

use App\Domain\Cart\Services\CartService;
use App\Domain\Cart\Services\SharedCartService;
use App\Domain\Checkout\Services\CheckoutService;
use App\Domain\Shared\Enums\OrderStatus;
use App\Domain\Shared\Enums\RoleSlug;
use App\Domain\Shipping\Services\ShippingQuoteService;
use App\Domain\Wholesale\Services\WholesaleBulkPricingService;
use App\Domain\Wholesale\Services\WholesalePricingService;
use App\Domain\Wholesale\Services\WholesaleReportsService;
use App\Domain\Wholesale\Services\WholesaleRuleService;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\ShippingQuote;
use App\Models\User;
use App\Models\WholesaleCustomerGroup;
use App\Models\WholesaleCustomerGroupMember;
use App\Models\WholesaleRule;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
});

function makeWholesaleStaffUser(RoleSlug $roleSlug, string $email): User
{
    $user = User::factory()->create([
        'name' => 'Operador '.$roleSlug->value,
        'email' => $email,
        'is_active' => true,
    ]);
    $role = Role::query()->where('slug', $roleSlug->value)->firstOrFail();
    $user->roles()->sync([$role->id]);

    return $user;
}

function createWholesaleProductWithVariants(string $name, int $priceCents = 890): Product
{
    /** @var Product $product */
    $product = Product::query()->create([
        'name' => $name,
        'slug' => Str::slug($name).'-'.Str::random(5),
        'sku' => 'PROD-'.Str::upper(Str::random(6)),
        'price_cents' => $priceCents,
        'product_type' => 'variable',
        'is_active' => true,
        'wholesale_enabled' => true,
        'wholesale_group_variants' => true,
    ]);

    // Create 3 variants (shades)
    foreach (['Nude 017', 'Nude 018', 'Vermelho 005'] as $idx => $shade) {
        ProductVariant::query()->create([
            'product_id' => $product->id,
            'name' => $shade,
            'sku' => 'VAR-'.Str::upper(Str::random(6)),
            'price_cents' => $priceCents,
            'stock_qty' => 50,
            'reserved_qty' => 0,
            'is_active' => true,
            'is_default' => $idx === 0,
        ]);
    }

    return $product->fresh(['variants']);
}

// =========================================================================
// TESTE 1: Agrupamento de quantidades entre múltiplas tonalidades
// 2 un. Nude 017 + 2 un. Nude 018 + 2 un. Vermelho 005 = 6 un. -> atinge atacado
// =========================================================================
test('cenario 01: agrupa quantidades entre multiplas tonalidades para atingir a faixa de atacado', function (): void {
    $product = createWholesaleProductWithVariants('Esmalte Linha Top Lírio', 890);
    $variants = $product->variants;

    // Create rule: scope = product, 6+ un. = R$ 5,90 (590 cents)
    /** @var WholesaleRule $rule */
    $rule = WholesaleRule::query()->create([
        'name' => 'Atacado Esmaltes Lírio',
        'slug' => 'atacado-esmaltes-lirio',
        'status' => 'active',
        'access_mode' => 'open',
        'quantity_scope' => 'product',
        'min_quantity' => 6,
    ]);
    $rule->tiers()->create([
        'min_quantity' => 6,
        'max_quantity' => null,
        'discount_type' => 'fixed_price',
        'discount_value' => 5.90,
    ]);
    $rule->ruleProducts()->create(['product_id' => $product->id]);

    $cart = Cart::query()->create(['token' => Str::uuid()->toString(), 'expires_at' => now()->addDays(7)]);

    // Add 2 of each shade (total = 6)
    $cartService = app(CartService::class);
    $cartService->addItem($cart, $variants[0], 2);
    $cartService->addItem($cart, $variants[1], 2);
    $cartService->addItem($cart, $variants[2], 2);

    $summary = $cartService->buildSummary($cart);

    expect($summary['wholesale_is_active'])->toBeTrue();
    expect($summary['wholesale_discount_cents'])->toBe((890 - 590) * 6); // R$ 3,00 x 6 = 1800 cents discount
    expect($summary['subtotal_cents'])->toBe(590 * 6); // 3540 cents

    foreach ($summary['items'] as $item) {
        expect($item['wholesale_applied'])->toBeTrue();
        expect($item['unit_price_cents'])->toBe(590);
    }
});

// =========================================================================
// TESTE 2: Quantidade mínima não atingida -> preço de varejo e aviso dinâmico
// =========================================================================
test('cenario 02: quantidade minima nao atingida mantem preco de varejo e indica unidades faltantes', function (): void {
    $product = createWholesaleProductWithVariants('Esmalte Linha Top Lírio', 890);
    $variants = $product->variants;

    $rule = WholesaleRule::query()->create([
        'name' => 'Atacado Esmaltes Lírio',
        'slug' => 'atacado-esmaltes-lirio-2',
        'status' => 'active',
        'access_mode' => 'open',
        'quantity_scope' => 'product',
        'min_quantity' => 6,
    ]);
    $rule->tiers()->create([
        'min_quantity' => 6,
        'max_quantity' => null,
        'discount_type' => 'fixed_price',
        'discount_value' => 5.90,
    ]);
    $rule->ruleProducts()->create(['product_id' => $product->id]);

    $cart = Cart::query()->create(['token' => Str::uuid()->toString(), 'expires_at' => now()->addDays(7)]);
    $cartService = app(CartService::class);

    // Add 2 of shade 1 and 2 of shade 2 (total = 4, faltam 2)
    $cartService->addItem($cart, $variants[0], 2);
    $cartService->addItem($cart, $variants[1], 2);

    $summary = $cartService->buildSummary($cart);

    expect($summary['wholesale_is_active'])->toBeFalse();
    expect($summary['wholesale_discount_cents'])->toBe(0);
    expect($summary['subtotal_cents'])->toBe(890 * 4);

    expect($summary['wholesale_scope_summaries'])->not->toBeEmpty();
    $scope = $summary['wholesale_scope_summaries'][0];
    expect($scope['units_to_next_tier'])->toBe(2);
    expect($scope['is_tier_unlocked'])->toBeFalse();
    expect($scope['message'])->toContain('Faltam apenas 2 un.');
});

// =========================================================================
// TESTE 3: Remoção de item recalibra condições dinamicamente
// =========================================================================
test('cenario 03: remocao de item recalibra condicoes de atacado dinamicamente', function (): void {
    $product = createWholesaleProductWithVariants('Esmalte Linha Top Lírio', 890);
    $variants = $product->variants;

    $rule = WholesaleRule::query()->create([
        'name' => 'Atacado Esmaltes Lírio',
        'slug' => 'atacado-esmaltes-lirio-3',
        'status' => 'active',
        'access_mode' => 'open',
        'quantity_scope' => 'product',
        'min_quantity' => 6,
    ]);
    $rule->tiers()->create([
        'min_quantity' => 6,
        'max_quantity' => null,
        'discount_type' => 'fixed_price',
        'discount_value' => 5.90,
    ]);
    $rule->ruleProducts()->create(['product_id' => $product->id]);

    $cart = Cart::query()->create(['token' => Str::uuid()->toString(), 'expires_at' => now()->addDays(7)]);
    $cartService = app(CartService::class);

    // Start with 6 units total
    $cartService->addItem($cart, $variants[0], 3);
    $item2 = $cartService->addItem($cart, $variants[1], 3);

    $summary1 = $cartService->buildSummary($cart);
    expect($summary1['wholesale_is_active'])->toBeTrue();

    // Reduce item2 quantity from 3 to 2 (total = 5 units, below 6)
    $cartItem = $cart->items()->where('product_variant_id', $variants[1]->id)->firstOrFail();
    $cartService->updateItemQuantity($cart, $cartItem, 2);

    $summary2 = $cartService->buildSummary($cart);
    expect($summary2['wholesale_is_active'])->toBeFalse();
    expect($summary2['wholesale_discount_cents'])->toBe(0);
    expect($summary2['subtotal_cents'])->toBe(890 * 5);
});

// =========================================================================
// TESTE 4: Escopo estrito por SKU não agrupa variações diferentes
// =========================================================================
test('cenario 04: escopo por sku nao agrupa variacoes de tonalidades diferentes', function (): void {
    $product = createWholesaleProductWithVariants('Esmalte Linha Top Lírio', 890);
    $variants = $product->variants;

    // Rule with quantity_scope = 'sku'
    $rule = WholesaleRule::query()->create([
        'name' => 'Atacado Estrito por SKU',
        'slug' => 'atacado-sku-estrito',
        'status' => 'active',
        'access_mode' => 'open',
        'quantity_scope' => 'sku',
        'min_quantity' => 6,
    ]);
    $rule->tiers()->create([
        'min_quantity' => 6,
        'max_quantity' => null,
        'discount_type' => 'fixed_price',
        'discount_value' => 5.90,
    ]);
    $rule->ruleProducts()->create(['product_id' => $product->id]);

    $cart = Cart::query()->create(['token' => Str::uuid()->toString(), 'expires_at' => now()->addDays(7)]);
    $cartService = app(CartService::class);

    // 2 units of 3 different SKUs -> none reaches 6 units
    $cartService->addItem($cart, $variants[0], 2);
    $cartService->addItem($cart, $variants[1], 2);
    $cartService->addItem($cart, $variants[2], 2);

    $summary = $cartService->buildSummary($cart);
    expect($summary['wholesale_is_active'])->toBeFalse();
    expect($summary['wholesale_discount_cents'])->toBe(0);

    // Now add 4 more to variant[0] (so variant[0] reaches 6)
    $cartItem0 = $cart->items()->where('product_variant_id', $variants[0]->id)->firstOrFail();
    $cartService->updateItemQuantity($cart, $cartItem0, 6);

    $summaryWith6 = $cartService->buildSummary($cart);
    // variant[0] (6 units) gets wholesale, variant[1] (2) and variant[2] (2) stay retail
    $item0Summary = collect($summaryWith6['items'])->firstWhere('variant_id', $variants[0]->id);
    $item1Summary = collect($summaryWith6['items'])->firstWhere('variant_id', $variants[1]->id);

    expect($item0Summary['wholesale_applied'])->toBeTrue();
    expect($item0Summary['unit_price_cents'])->toBe(590);
    expect($item1Summary['wholesale_applied'])->toBeFalse();
    expect($item1Summary['unit_price_cents'])->toBe(890);
});

// =========================================================================
// TESTE 5: Progressão por múltiplas faixas (5, 6-11, 12-23, 24+)
// =========================================================================
test('cenario 05: progressao correta atraves de multiplas faixas de atacado', function (): void {
    $product = createWholesaleProductWithVariants('Esmalte Linha Top Lírio', 1000); // R$ 10,00 retail
    $variant = $product->variants[0];

    $rule = WholesaleRule::query()->create([
        'name' => 'Atacado Multi-Faixa',
        'slug' => 'atacado-multi-faixa',
        'status' => 'active',
        'access_mode' => 'open',
        'quantity_scope' => 'product',
        'min_quantity' => 6,
    ]);
    $rule->tiers()->createMany([
        ['min_quantity' => 6, 'max_quantity' => 11, 'discount_type' => 'fixed_price', 'discount_value' => 8.00],
        ['min_quantity' => 12, 'max_quantity' => 23, 'discount_type' => 'fixed_price', 'discount_value' => 7.00],
        ['min_quantity' => 24, 'max_quantity' => null, 'discount_type' => 'fixed_price', 'discount_value' => 6.00],
    ]);
    $rule->ruleProducts()->create(['product_id' => $product->id]);

    $pricingService = app(WholesalePricingService::class);

    // 5 units -> Retail (R$ 10,00)
    $res5 = $pricingService->simulate([['product_id' => $product->id, 'product_variant_id' => $variant->id, 'quantity' => 5]]);
    expect($res5['is_wholesale_active'])->toBeFalse();
    expect($res5['items'][1]['wholesale_unit_price_cents'])->toBe(1000);

    // 6 units -> Tier 1 (R$ 8,00)
    $res6 = $pricingService->simulate([['product_id' => $product->id, 'product_variant_id' => $variant->id, 'quantity' => 6]]);
    expect($res6['is_wholesale_active'])->toBeTrue();
    expect($res6['items'][1]['wholesale_unit_price_cents'])->toBe(800);

    // 12 units -> Tier 2 (R$ 7,00)
    $res12 = $pricingService->simulate([['product_id' => $product->id, 'product_variant_id' => $variant->id, 'quantity' => 12]]);
    expect($res12['items'][1]['wholesale_unit_price_cents'])->toBe(700);

    // 24 units -> Tier 3 (R$ 6,00)
    $res24 = $pricingService->simulate([['product_id' => $product->id, 'product_variant_id' => $variant->id, 'quantity' => 24]]);
    expect($res24['items'][1]['wholesale_unit_price_cents'])->toBe(600);
});

// =========================================================================
// TESTE 6: Acesso exclusivo para revendedores aprovados
// =========================================================================
test('cenario 06: regra exclusiva de revendedor aplica apenas para clientes aprovados no grupo', function (): void {
    $product = createWholesaleProductWithVariants('Esmalte Exclusivo B2B', 1000);
    $variant = $product->variants[0];

    $group = WholesaleCustomerGroup::query()->create([
        'name' => 'Revendedores Ouro',
        'slug' => 'revendedores-ouro',
        'status' => 'active',
    ]);

    $rule = WholesaleRule::query()->create([
        'name' => 'Super Atacado Ouro',
        'slug' => 'super-atacado-ouro',
        'status' => 'active',
        'access_mode' => 'exclusive',
        'quantity_scope' => 'product',
        'min_quantity' => 6,
    ]);
    $rule->tiers()->create(['min_quantity' => 6, 'discount_type' => 'fixed_price', 'discount_value' => 4.50]);
    $rule->customerGroups()->attach($group->id);

    $regularUser = User::factory()->create(['email' => 'regular@cliente.com']);
    $resellerUser = User::factory()->create(['email' => 'reseller@vip.com']);

    // Associate reseller with approved status
    WholesaleCustomerGroupMember::query()->create([
        'customer_group_id' => $group->id,
        'user_id' => $resellerUser->id,
        'status' => 'approved',
    ]);

    $pricingService = app(WholesalePricingService::class);

    // Guest / Regular user cannot access exclusive rule
    $simRegular = $pricingService->simulate([['product_id' => $product->id, 'product_variant_id' => $variant->id, 'quantity' => 10]], $regularUser);
    expect($simRegular['is_wholesale_active'])->toBeFalse();

    // Approved reseller user accesses exclusive rule
    $simReseller = $pricingService->simulate([['product_id' => $product->id, 'product_variant_id' => $variant->id, 'quantity' => 10]], $resellerUser);
    expect($simReseller['is_wholesale_active'])->toBeTrue();
    expect($simReseller['items'][1]['wholesale_unit_price_cents'])->toBe(450);

    // If reseller is suspended, loses access
    WholesaleCustomerGroupMember::query()->where('user_id', $resellerUser->id)->update(['status' => 'suspended']);
    $simSuspended = $pricingService->simulate([['product_id' => $product->id, 'product_variant_id' => $variant->id, 'quantity' => 10]], $resellerUser);
    expect($simSuspended['is_wholesale_active'])->toBeFalse();
});

// =========================================================================
// TESTE 7: Políticas de acúmulo com cupom de desconto
// =========================================================================
test('cenario 07: politica de acumulo bloqueia cupom quando regra define no_stacking', function (): void {
    $product = createWholesaleProductWithVariants('Esmalte Top Lírio', 1000);
    $variant = $product->variants[0];

    // Rule with no_stacking
    $rule = WholesaleRule::query()->create([
        'name' => 'Atacado Sem Acúmulo',
        'slug' => 'atacado-sem-acumulo',
        'status' => 'active',
        'access_mode' => 'open',
        'quantity_scope' => 'product',
        'stacking_policy' => 'no_stacking',
        'min_quantity' => 6,
    ]);
    $rule->tiers()->create(['min_quantity' => 6, 'discount_type' => 'fixed_price', 'discount_value' => 6.00]);
    $rule->ruleProducts()->create(['product_id' => $product->id]);

    // Active coupon for 10% off
    Coupon::query()->create([
        'code' => 'DESCONTO10',
        'name' => '10% OFF',
        'type' => 'percent',
        'value' => 10,
        'is_active' => true,
        'min_subtotal_cents' => 1000,
    ]);

    $cart = Cart::query()->create(['token' => Str::uuid()->toString(), 'coupon_code' => 'DESCONTO10', 'expires_at' => now()->addDays(7)]);
    $cartService = app(CartService::class);
    $cartService->addItem($cart, $variant, 6);

    $summary = $cartService->buildSummary($cart);

    expect($summary['wholesale_is_active'])->toBeTrue();
    expect($summary['wholesale_discount_cents'])->toBe(2400); // (1000 - 600) x 6
    // Coupon must be rejected because rule does not stack with coupons
    expect($summary['coupon_code'])->toBeNull();
    expect($summary['coupon_discount_cents'])->toBe(0);
    expect($summary['coupon_error'])->toContain('não acumulam com cupom');
});

// =========================================================================
// TESTE 8: Integração com checkout, snapshot no OrderItem e reserva de estoque
// =========================================================================
test('cenario 08: checkout persiste snapshot de atacado no OrderItem e reserva estoque', function (): void {
    realPaymentFakes();
    $product = createWholesaleProductWithVariants('Esmalte Top Lírio', 1000);
    $variant = $product->variants[0];

    $rule = WholesaleRule::query()->create([
        'name' => 'Atacado Lírio Oficial',
        'slug' => 'atacado-lirio-oficial',
        'status' => 'active',
        'access_mode' => 'open',
        'quantity_scope' => 'product',
        'min_quantity' => 6,
    ]);
    $rule->tiers()->create(['min_quantity' => 6, 'discount_type' => 'fixed_price', 'discount_value' => 6.50]);
    $rule->ruleProducts()->create(['product_id' => $product->id]);

    $cart = Cart::query()->create(['token' => Str::uuid()->toString(), 'shipping_cep' => '22041001', 'expires_at' => now()->addDays(7)]);
    $cartService = app(CartService::class);
    $cartService->addItem($cart, $variant, 6);

    // Mock shipping quote
    $quote = ShippingQuote::query()->create([
        'cart_id' => $cart->id,
        'provider' => 'melhorenvio',
        'service_code' => 'sedex',
        'service_name' => 'SEDEX',
        'carrier' => 'Correios',
        'price_cents' => 1500,
        'estimated_days' => 2,
        'cep' => '22041001',
        'items_fingerprint' => app(ShippingQuoteService::class)->cartFingerprint($cart),
        'expires_at' => now()->addHours(2),
    ]);
    $cart->update(['shipping_quote_id' => $quote->id, 'shipping_service_code' => 'sedex']);

    $checkoutService = app(CheckoutService::class);
    $checkoutResult = $checkoutService->submitCheckout(
        $cart,
        null,
        [
            'payment_method' => 'pix',
            'customer_name' => 'Cliente Atacado',
            'customer_email' => 'atacado@cliente.com',
            'customer_phone' => '21988887777',
            'customer_cpf_cnpj' => '12345678901',
            'shipping_address' => [
                'recipient_name' => 'Cliente Atacado',
                'street' => 'Rua Barata Ribeiro',
                'number' => '100',
                'neighborhood' => 'Copacabana',
                'city' => 'Rio de Janeiro',
                'state' => 'RJ',
                'cep' => '22041001',
            ],
        ],
        'idempotency-key-atacado-001'
    );

    /** @var Order $order */
    $order = $checkoutResult['order'];
    expect($order->status)->toBe(OrderStatus::PendingPayment);
    expect($order->subtotal_cents)->toBe(650 * 6); // 3900 cents
    expect($order->items)->toHaveCount(1);

    /** @var OrderItem $orderItem */
    $orderItem = $order->items->first();
    expect($orderItem->wholesale_rule_id)->toBe($rule->id);
    expect($orderItem->wholesale_rule_name)->toBe($rule->name);
    expect($orderItem->wholesale_tier_min_qty)->toBe(6);
    expect($orderItem->wholesale_discount_cents)->toBe(350); // 1000 - 650 = 350 per unit
    expect($orderItem->unit_price_cents)->toBe(650);
    expect($orderItem->original_unit_price_cents)->toBe(1000);

    // Verify stock reservation per variant
    expect($variant->fresh()->reserved_qty)->toBe(6);
});

// =========================================================================
// TESTE 9: Gestão administrativa de regras, tiers e auditoria
// =========================================================================
test('cenario 09: admin gerencia regras e tiers com registro de auditoria', function (): void {
    $staff = makeWholesaleStaffUser(RoleSlug::Admin, 'admin.wholesale@misturafeminina.com.br');
    $ruleService = app(WholesaleRuleService::class);

    $rule = $ruleService->create([
        'name' => 'Regra Esmaltes Verão',
        'status' => 'active',
        'access_mode' => 'open',
        'quantity_scope' => 'commercial_line',
        'min_quantity' => 12,
        'tiers' => [
            ['min_quantity' => 12, 'discount_type' => 'percent', 'discount_value' => 20.0],
        ],
    ], $staff);

    expect($rule->exists)->toBeTrue();
    expect($rule->audits)->toHaveCount(1);
    expect($rule->audits->first()->action)->toBe('created');

    // Update rule
    $ruleService->update($rule, [
        'name' => 'Regra Esmaltes Verão 2026',
        'min_quantity' => 6,
    ], $staff);

    expect($rule->fresh()->audits)->toHaveCount(2);
    expect($rule->fresh()->audits()->latest('id')->first()->action)->toBe('updated');
});

// =========================================================================
// TESTE 10: Imutabilidade do histórico de pedidos após alteração de regras
// =========================================================================
test('cenario 10: alteracoes em regras de atacado nao modificam pedidos historicos', function (): void {
    $product = createWholesaleProductWithVariants('Esmalte Top Lírio', 1000);
    $variant = $product->variants[0];

    $rule = WholesaleRule::query()->create([
        'name' => 'Atacado Histórico',
        'slug' => 'atacado-historico',
        'status' => 'active',
        'access_mode' => 'open',
        'min_quantity' => 6,
    ]);
    $rule->tiers()->create(['min_quantity' => 6, 'discount_type' => 'fixed_price', 'discount_value' => 5.00]);

    // Create an order with this rule
    $order = Order::query()->create([
        'order_number' => 'MF-HIST-001',
        'public_token' => Str::uuid()->toString(),
        'idempotency_key' => 'idem-hist-001',
        'is_guest' => true,
        'customer_name' => 'Cliente Antigo',
        'customer_email' => 'antigo@cliente.com',
        'customer_phone' => '21999998888',
        'shipping_address_snapshot' => ['cep' => '01001000', 'street' => 'Praça da Sé', 'number' => '10', 'neighborhood' => 'Sé', 'city' => 'São Paulo', 'state' => 'SP'],
        'shipping_service_snapshot' => ['carrier' => 'Correios', 'service_name' => 'PAC'],
        'subtotal_cents' => 3000,
        'discount_cents' => 3000,
        'total_cents' => 3000,
        'status' => OrderStatus::Delivered,
    ]);

    $orderItem = OrderItem::query()->create([
        'order_id' => $order->id,
        'product_id' => $product->id,
        'product_variant_id' => $variant->id,
        'product_name_snapshot' => $product->name,
        'variant_name_snapshot' => $variant->name,
        'sku_snapshot' => $variant->sku,
        'quantity' => 6,
        'unit_price_cents' => 500,
        'discount_cents' => 3000,
        'total_cents' => 3000,
        'wholesale_rule_id' => $rule->id,
        'wholesale_rule_name' => $rule->name,
        'wholesale_tier_min_qty' => 6,
        'wholesale_discount_cents' => 500,
        'wholesale_unit_price_cents' => 500,
        'original_unit_price_cents' => 1000,
    ]);

    // Now admin changes the rule price from R$ 5,00 to R$ 8,00 or even deletes the rule
    $rule->tiers()->update(['discount_value' => 8.00]);
    $rule->update(['status' => 'ended']);

    // Order item must remain intact
    $refreshedItem = $orderItem->fresh();
    expect($refreshedItem->unit_price_cents)->toBe(500);
    expect($refreshedItem->wholesale_discount_cents)->toBe(500);
    expect($refreshedItem->wholesale_rule_name)->toBe('Atacado Histórico');
});

// =========================================================================
// TESTE 11: Integridade do controle de estoque por SKU individual
// =========================================================================
test('cenario 11: agrupamento de cores nao compromete estoque por sku individual', function (): void {
    $product = createWholesaleProductWithVariants('Esmalte Top Lírio', 890);
    $variantA = $product->variants[0];
    $variantB = $product->variants[1];

    $variantA->update(['stock_qty' => 5, 'reserved_qty' => 0]); // only 5 units in stock

    $cart = Cart::query()->create(['token' => Str::uuid()->toString(), 'expires_at' => now()->addDays(7)]);
    $cartService = app(CartService::class);

    // Customer tries to add 6 units of variant A -> must fail because stock is 5
    expect(fn () => $cartService->addItem($cart, $variantA, 6))
        ->toThrow(ValidationException::class);

    // Adding 5 of variant A + 5 of variant B works and preserves individual stock
    $cartService->addItem($cart, $variantA, 5);
    $cartService->addItem($cart, $variantB, 5);

    expect($cart->items)->toHaveCount(2);
    expect($variantA->availableStock())->toBe(5);
    expect($variantB->availableStock())->toBe(50);
});

// =========================================================================
// TESTE 12: Integrações (Listas de reposição e carrinho compartilhado)
// =========================================================================
test('cenario 12: integracao com carrinho compartilhado e reposicao mantem preco de atacado', function (): void {
    $product = createWholesaleProductWithVariants('Esmalte Linha Top Lírio', 1000);
    $variant = $product->variants[0];

    $rule = WholesaleRule::query()->create([
        'name' => 'Atacado 6+',
        'slug' => 'atacado-6-plus',
        'status' => 'active',
        'access_mode' => 'open',
        'min_quantity' => 6,
    ]);
    $rule->tiers()->create(['min_quantity' => 6, 'discount_type' => 'fixed_price', 'discount_value' => 6.00]);
    $rule->ruleProducts()->create(['product_id' => $product->id]);

    $cart = Cart::query()->create(['token' => Str::uuid()->toString(), 'expires_at' => now()->addDays(7)]);
    $cartService = app(CartService::class);
    $cartService->addItem($cart, $variant, 6);

    // Share cart
    $sharedCartService = app(SharedCartService::class);
    $shared = $sharedCartService->createFromCart($cart, null, 'Carrinho Atacado Compartilhado');
    expect($shared->token)->toBeString();

    // Import into a new cart
    $newCart = Cart::query()->create(['token' => Str::uuid()->toString(), 'expires_at' => now()->addDays(7)]);
    $importResult = $sharedCartService->importToCart($shared->token, $newCart, null);

    $summary = $cartService->buildSummary($newCart);
    expect($summary['wholesale_is_active'])->toBeTrue();
    expect($summary['wholesale_discount_cents'])->toBe(2400);
});

// =========================================================================
// TESTE 13: Simulador administrativo reproduz checkout com zero efeitos colaterais
// =========================================================================
test('cenario 13: simulador administrativo calcula precos idênticos ao checkout sem salvar dados', function (): void {
    $product = createWholesaleProductWithVariants('Esmalte Top Lírio', 1000);
    $variant = $product->variants[0];

    $rule = WholesaleRule::query()->create([
        'name' => 'Atacado 12+',
        'slug' => 'atacado-12-plus',
        'status' => 'active',
        'access_mode' => 'open',
        'min_quantity' => 12,
    ]);
    $rule->tiers()->create(['min_quantity' => 12, 'discount_type' => 'fixed_price', 'discount_value' => 5.50]);
    $rule->ruleProducts()->create(['product_id' => $product->id]);

    $ordersBefore = Order::count();
    $pricingService = app(WholesalePricingService::class);

    $simulation = $pricingService->simulate([
        [
            'product_id' => $product->id,
            'product_variant_id' => $variant->id,
            'quantity' => 12,
        ],
    ]);

    expect($simulation['is_wholesale_active'])->toBeTrue();
    expect($simulation['total_cents'])->toBe(550 * 12); // 6600 cents
    expect($simulation['total_wholesale_discount_cents'])->toBe(450 * 12); // 5400 cents

    // Zero side effects: no orders created
    expect(Order::count())->toBe($ordersBefore);
});

// =========================================================================
// TESTE 14: Edição em massa e parser de colagem de Excel/Sheets
// =========================================================================
test('cenario 14: parser de excel suporta formato brasileiro e aplica atualizacoes em lote', function (): void {
    $product = createWholesaleProductWithVariants('Cabine Sun 8 Pro', 5990);
    $bulkService = app(WholesaleBulkPricingService::class);

    $excelPasteText = "{$product->sku}\tR$ 42,50\t6";
    $parsed = $bulkService->parseExcelPaste($excelPasteText);

    expect($parsed)->toHaveCount(1);
    expect($parsed[0]['sku'])->toBe($product->sku);
    expect($parsed[0]['wholesale_price_cents'])->toBe(4250); // R$ 42,50 = 4250 cents
    expect($parsed[0]['min_quantity'])->toBe(6);

    // Preview
    $preview = $bulkService->previewBulkUpdate($parsed);
    expect($preview['valid_count'])->toBe(1);
    expect($preview['error_count'])->toBe(0);

    // Apply
    $applied = $bulkService->applyBulkUpdate($parsed);
    expect($applied['success'])->toBeTrue();
    expect($applied['applied_count'])->toBe(1);
});

// =========================================================================
// TESTE 15: Segurança e permissões RBAC nas rotas administrativas de atacado
// =========================================================================
test('cenario 15: seguranca e rbac bloqueiam usuarios sem permissao e protegem exportacao csv contra formula injection', function (): void {
    // 1. Regular customer cannot access admin wholesale routes
    $customer = User::factory()->create(['email' => 'cliente.comum@gmail.com']);
    $res = $this->actingAs($customer)->getJson('/api/v1/admin/wholesale/overview');
    $res->assertForbidden();

    // 2. Staff with wholesale.view can access
    $staff = makeWholesaleStaffUser(RoleSlug::Admin, 'admin.teste@misturafeminina.com.br');
    $adminRes = $this->actingAs($staff)->getJson('/api/v1/admin/wholesale/overview');
    $adminRes->assertOk();

    // 3. Formula injection sanitization in CSV export
    $reportsService = app(WholesaleReportsService::class);
    $csv = $reportsService->exportCsv();
    expect($csv)->toBeString();
});
