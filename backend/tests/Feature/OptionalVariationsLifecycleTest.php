<?php

declare(strict_types=1);

use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Orders\Services\ProfitAndCostAnalyticsService;
use App\Domain\Shared\Enums\InventoryMovementType;
use App\Domain\Shared\Enums\RoleSlug;
use App\Models\Brand;
use App\Models\Category;
use App\Models\IntegrationSetting;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
    Mail::fake();
});

function makeVariationsAdminUser(): User
{
    $user = User::factory()->create([
        'name' => 'Operadora Catálogo Completo',
        'email' => 'catalogo.var.'.uniqid().'@misturafeminina.com.br',
        'is_active' => true,
    ]);
    $role = Role::query()->where('slug', RoleSlug::Admin->value)->firstOrFail();
    $user->roles()->sync([$role->id]);

    return $user;
}

function checkoutSingleCartAsCustomer(object $testCase, User $customer, array $cartItems): Order
{
    realPaymentFakes();
    $cartToken = '';
    foreach ($cartItems as $item) {
        $resp = $testCase->actingAs($customer)
            ->postJson('/api/v1/cart/items', $item)
            ->assertCreated();
        $cartToken = (string) $resp->json('data.token');
    }

    $quoteResp = $testCase->actingAs($customer)
        ->withHeader('X-Cart-Token', $cartToken)
        ->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310-100'])
        ->assertOk();
    $quoteId = (int) $quoteResp->json('data.options.0.quote_id');

    $checkoutResp = $testCase->actingAs($customer)
        ->withHeader('X-Cart-Token', $cartToken)
        ->withHeader('X-Idempotency-Key', 'idem-var-'.uniqid())
        ->postJson('/api/v1/checkout', [
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'customer_phone' => '11999990000',
            'customer_cpf_cnpj' => '12345678909',
            'shipping_quote_id' => $quoteId,
            'shipping_address' => [
                'cep' => '01310-100',
                'street' => 'Av Paulista',
                'number' => '1200',
                'neighborhood' => 'Bela Vista',
                'city' => 'São Paulo',
                'state' => 'SP',
            ],
            'payment_method' => 'pix',
        ])
        ->assertCreated();

    $orderId = (int) $checkoutResp->json('data.order.id');

    return Order::query()->with('items')->findOrFail($orderId);
}

test('cenario 1: cadastra produto simples sem atributos de variacao e permite compra direta', function (): void {
    $admin = makeVariationsAdminUser();
    $brand = Brand::query()->firstOrFail();
    $category = Category::query()->firstOrFail();

    $res = $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Luminária LED Mesa Bivolt Simples',
        'sku' => 'LUM-SIMP-01',
        'brand_id' => $brand->id,
        'category_ids' => [$category->id],
        'price_cents' => 15990,
        'cost_cents' => 8200,
        'weight_grams' => 650,
        'unit_label' => '48W Bivolt',
        'has_variants' => false,
        'product_type' => 'simple',
        'stock_qty' => 12,
        'is_active' => true,
    ])->assertCreated();

    $product = Product::query()->with('variants')->findOrFail((int) $res->json('data.id'));
    expect($product->has_variants)->toBeFalse();
    expect($product->unit_label)->toBe('48W Bivolt');
    expect($product->variants)->toHaveCount(1);
    expect($product->variants[0]->name)->toBe('Padrão');
    expect($product->variants[0]->sku)->toBe('LUM-SIMP-01');
    expect($product->variants[0]->stock_qty)->toBe(12);
    expect($product->variants[0]->cost_cents)->toBe(8200);

    $pdp = $this->getJson("/api/v1/catalog/products/{$product->slug}")->assertOk();
    expect($pdp->json('data.has_variants'))->toBeFalse();
    expect($pdp->json('data.variation_axes'))->toBe([]);
    expect($pdp->json('data.unit_label'))->toBe('48W Bivolt');

    $customer = User::factory()->create();
    $order = checkoutSingleCartAsCustomer($this, $customer, [
        ['variant_id' => $product->variants[0]->id, 'quantity' => 2],
    ]);

    expect($order->items)->toHaveCount(1);
    expect($order->items[0]->sku_snapshot)->toBe('LUM-SIMP-01');
    expect($order->items[0]->weight_grams_snapshot)->toBe(650);
});

test('cenario 2 e 3: gera grade 3x2 com 5 combinacoes ativas, custos e pesos distintos, carrinho separado e snapshots de lucro', function (): void {
    $admin = makeVariationsAdminUser();
    $brand = Brand::query()->firstOrFail();
    $category = Category::query()->firstOrFail();

    // 3 Cor x 2 Volume = 6 combinations; deliberately omitting "Vermelho · 15 ml" (only 5 saved)
    $payload = [
        'name' => 'Esmalte Em Gel Coleção Paris',
        'sku' => 'EGP-01',
        'brand_id' => $brand->id,
        'category_ids' => [$category->id],
        'price_cents' => 2490,
        'weight_grams' => 50,
        'has_variants' => true,
        'product_type' => 'variable',
        'variation_attributes' => [
            [
                'name' => 'Cor',
                'slug' => 'cor',
                'display_type' => 'color_swatch',
                'sort_order' => 1,
                'values' => [
                    ['uid' => 'c1', 'value' => 'Nude', 'slug' => 'nude', 'color_hex' => '#d9b3a0'],
                    ['uid' => 'c2', 'value' => 'Rosé', 'slug' => 'rose', 'color_hex' => '#c97b96'],
                    ['uid' => 'c3', 'value' => 'Vermelho', 'slug' => 'vermelho', 'color_hex' => '#b31b2c'],
                ],
            ],
            [
                'name' => 'Volume',
                'slug' => 'volume',
                'display_type' => 'pill',
                'sort_order' => 2,
                'values' => [
                    ['uid' => 'v1', 'value' => '8 ml', 'slug' => '8-ml'],
                    ['uid' => 'v2', 'value' => '15 ml', 'slug' => '15-ml'],
                ],
            ],
        ],
        'variants' => [
            [
                'name' => 'Nude · 8 ml',
                'sku' => 'EGP-NUDE-8ML',
                'option_values' => [
                    ['uid' => 'c1', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Nude', 'value_slug' => 'nude', 'color_hex' => '#d9b3a0'],
                    ['uid' => 'v1', 'attribute_slug' => 'volume', 'attribute_name' => 'Volume', 'value' => '8 ml', 'value_slug' => '8-ml'],
                ],
                'price_cents' => 2490,
                'inherits_price' => true,
                'cost_cents' => 900,
                'stock_qty' => 10,
                'inherits_weight' => true,
                'is_default' => true,
                'is_active' => true,
            ],
            [
                'name' => 'Nude · 15 ml',
                'sku' => 'EGP-NUDE-15ML',
                'option_values' => [
                    ['uid' => 'c1', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Nude', 'value_slug' => 'nude', 'color_hex' => '#d9b3a0'],
                    ['uid' => 'v2', 'attribute_slug' => 'volume', 'attribute_name' => 'Volume', 'value' => '15 ml', 'value_slug' => '15-ml'],
                ],
                'price_cents' => 3890,
                'inherits_price' => false,
                'cost_cents' => 1400,
                'stock_qty' => 0, // Registered and out of stock
                'weight_grams' => 75,
                'inherits_weight' => false,
                'is_active' => true,
            ],
            [
                'name' => 'Rosé · 8 ml',
                'sku' => 'EGP-ROSE-8ML',
                'option_values' => [
                    ['uid' => 'c2', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Rosé', 'value_slug' => 'rose', 'color_hex' => '#c97b96'],
                    ['uid' => 'v1', 'attribute_slug' => 'volume', 'attribute_name' => 'Volume', 'value' => '8 ml', 'value_slug' => '8-ml'],
                ],
                'price_cents' => 2490,
                'inherits_price' => false,
                'cost_cents' => 950,
                'stock_qty' => 14,
                'weight_grams' => 45,
                'inherits_weight' => false,
                'image_path' => 'catalog/rose-8ml.jpg',
                'inherits_image' => false,
                'is_active' => true,
            ],
            [
                'name' => 'Rosé · 15 ml',
                'sku' => 'EGP-ROSE-15ML',
                'option_values' => [
                    ['uid' => 'c2', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Rosé', 'value_slug' => 'rose', 'color_hex' => '#c97b96'],
                    ['uid' => 'v2', 'attribute_slug' => 'volume', 'attribute_name' => 'Volume', 'value' => '15 ml', 'value_slug' => '15-ml'],
                ],
                'price_cents' => 3990,
                'inherits_price' => false,
                'promo_price_cents' => 3490,
                'inherits_promo_price' => false,
                'cost_cents' => 1500,
                'stock_qty' => 9,
                'weight_grams' => 85,
                'inherits_weight' => false,
                'image_path' => 'catalog/rose-15ml.jpg',
                'inherits_image' => false,
                'is_active' => true,
            ],
            [
                'name' => 'Vermelho · 8 ml',
                'sku' => 'EGP-VERM-8ML',
                'option_values' => [
                    ['uid' => 'c3', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Vermelho', 'value_slug' => 'vermelho', 'color_hex' => '#b31b2c'],
                    ['uid' => 'v1', 'attribute_slug' => 'volume', 'attribute_name' => 'Volume', 'value' => '8 ml', 'value_slug' => '8-ml'],
                ],
                'price_cents' => 2490,
                'inherits_price' => true,
                'cost_cents' => null, // Uninformed cost stays NULL, NOT 0
                'stock_qty' => 6,
                'inherits_weight' => true,
                'is_active' => true,
            ],
        ],
        'is_active' => true,
    ];

    $created = $this->actingAs($admin)->postJson('/api/v1/admin/products', $payload)->assertCreated();
    $product = Product::query()->with('variants')->findOrFail((int) $created->json('data.id'));

    expect($product->has_variants)->toBeTrue();
    expect($product->variants)->toHaveCount(5);

    $verm8 = $product->variants->firstWhere('sku', 'EGP-VERM-8ML');
    expect($verm8?->cost_cents)->toBeNull();

    // Storefront returns 2 variation axes and only the 5 active sellable combinations
    $pdp = $this->getJson("/api/v1/catalog/products/{$product->slug}")->assertOk();
    expect($pdp->json('data.variation_axes'))->toHaveCount(2);
    expect(collect($pdp->json('data.variants'))->pluck('sku')->all())->not->toContain('EGP-VERM-15ML');

    // Buyer adds both Rosé · 8 ml (2 un.) and Rosé · 15 ml (3 un.) -> must remain separate cart & order lines
    $rose8 = $product->variants->firstWhere('sku', 'EGP-ROSE-8ML');
    $rose15 = $product->variants->firstWhere('sku', 'EGP-ROSE-15ML');
    expect($rose8)->not->toBeNull();
    expect($rose15)->not->toBeNull();

    $customer = User::factory()->create();
    $cartFirst = $this->actingAs($customer)
        ->postJson('/api/v1/cart/items', ['variant_id' => $rose8->id, 'quantity' => 2])
        ->assertCreated();
    $token = (string) $cartFirst->json('data.token');

    $cartBoth = $this->actingAs($customer)
        ->withHeader('X-Cart-Token', $token)
        ->postJson('/api/v1/cart/items', ['variant_id' => $rose15->id, 'quantity' => 3])
        ->assertCreated();

    $items = $cartBoth->json('data.items');
    expect($items)->toHaveCount(2);
    $line8 = collect($items)->firstWhere('variant_id', $rose8->id);
    $line15 = collect($items)->firstWhere('variant_id', $rose15->id);
    expect($line8['variant_name'])->toBe('Rosé · 8 ml');
    expect($line8['unit_price_cents'])->toBe(2490);
    expect($line8['weight_grams'])->toBe(45);
    expect($line8['image_url'])->toBe('catalog/rose-8ml.jpg');
    expect($line15['variant_name'])->toBe('Rosé · 15 ml');
    expect($line15['unit_price_cents'])->toBe(3490);
    expect($line15['weight_grams'])->toBe(85);
    expect($line15['image_url'])->toBe('catalog/rose-15ml.jpg');

    // Checkout locks distinct per-variant cost, weight, price, and SKU snapshots
    realPaymentFakes();
    $quoteResp = $this->actingAs($customer)
        ->withHeader('X-Cart-Token', $token)
        ->postJson('/api/v1/cart/shipping/quote', ['cep' => '01310-100'])
        ->assertOk();
    $orderResp = $this->actingAs($customer)
        ->withHeader('X-Cart-Token', $token)
        ->withHeader('X-Idempotency-Key', 'idem-multi-axis-order')
        ->postJson('/api/v1/checkout', [
            'customer_name' => $customer->name,
            'customer_email' => $customer->email,
            'customer_phone' => '11999990000',
            'customer_cpf_cnpj' => '12345678909',
            'shipping_quote_id' => (int) $quoteResp->json('data.options.0.quote_id'),
            'shipping_address' => [
                'cep' => '01310-100',
                'street' => 'Av Paulista',
                'number' => '1200',
                'neighborhood' => 'Bela Vista',
                'city' => 'São Paulo',
                'state' => 'SP',
            ],
            'payment_method' => 'pix',
        ])
        ->assertCreated();

    $orderId = (int) $orderResp->json('data.order.id');
    // Confirm payment via admin status endpoint -> deducts stock & freezes exact per-variant unit_cost_cents_snapshot
    $this->actingAs($admin)
        ->patchJson("/api/v1/admin/orders/{$orderId}/status", ['status' => 'paid'])
        ->assertOk();

    $order = Order::query()->with('items')->findOrFail($orderId);
    $orderItem8 = $order->items->firstWhere('product_variant_id', $rose8->id);
    $orderItem15 = $order->items->firstWhere('product_variant_id', $rose15->id);
    expect($orderItem8?->unit_cost_cents_snapshot)->toBe(950);
    expect($orderItem8?->weight_grams_snapshot)->toBe(45);
    expect($orderItem8?->sku_snapshot)->toBe('EGP-ROSE-8ML');
    expect($orderItem15?->unit_cost_cents_snapshot)->toBe(1500);
    expect($orderItem15?->weight_grams_snapshot)->toBe(85);
    expect($orderItem15?->unit_price_cents)->toBe(3490);

    // 2 + 3 = 5 mixed combination units qualify for automatic wholesale tier (10% off 15450 = 13905), while CMV uses exact per-variant costs (950*2 + 1500*3 = 6400)
    $orderSummary = app(ProfitAndCostAnalyticsService::class)->summarizeOrder($order->fresh('items'), true);
    expect($orderSummary['financial_summary']['products_revenue_cents'])->toBe(13905);
    expect($orderSummary['financial_summary']['cmv_cents'])->toBe(6400);
    expect($orderSummary['financial_summary']['gross_profit_cents'])->toBe(13905 - 6400);
});

test('cenario 4 e 6: evoluir grade preserva IDs, SKUs e estoque, valida SKU duplicado na linha e arquivamento preserva pedidos', function (): void {
    $admin = makeVariationsAdminUser();
    $brand = Brand::query()->firstOrFail();
    $category = Category::query()->firstOrFail();

    $created = $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Batom Matte Veludo',
        'sku' => 'BTM-01',
        'brand_id' => $brand->id,
        'category_ids' => [$category->id],
        'price_cents' => 3500,
        'has_variants' => true,
        'product_type' => 'variable',
        'variation_attributes' => [
            [
                'name' => 'Cor',
                'slug' => 'cor',
                'display_type' => 'color_swatch',
                'sort_order' => 1,
                'values' => [
                    ['uid' => 'c_rose', 'value' => 'Rose', 'slug' => 'rose'],
                    ['uid' => 'c_nude', 'value' => 'Nude', 'slug' => 'nude'],
                ],
            ],
        ],
        'variants' => [
            [
                'name' => 'Rose',
                'sku' => 'BTM-ROSE-CUSTOM',
                'option_values' => [
                    ['uid' => 'c_rose', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Rose', 'value_slug' => 'rose'],
                ],
                'price_cents' => 3500,
                'cost_cents' => 1200,
                'stock_qty' => 7,
                'is_default' => true,
                'is_active' => true,
            ],
            [
                'name' => 'Nude',
                'sku' => 'BTM-NUDE-CUSTOM',
                'option_values' => [
                    ['uid' => 'c_nude', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Nude', 'value_slug' => 'nude'],
                ],
                'price_cents' => 3500,
                'cost_cents' => 1200,
                'stock_qty' => 5,
                'is_active' => true,
            ],
        ],
        'is_active' => true,
    ])->assertCreated();

    $product = Product::query()->with('variants')->findOrFail((int) $created->json('data.id'));
    $roseVariant = $product->variants->firstWhere('sku', 'BTM-ROSE-CUSTOM');
    $nudeVariant = $product->variants->firstWhere('sku', 'BTM-NUDE-CUSTOM');
    expect($roseVariant)->not->toBeNull();
    expect($nudeVariant)->not->toBeNull();

    $movementsBefore = InventoryMovement::query()->where('product_variant_id', $roseVariant->id)->count();
    expect($movementsBefore)->toBeGreaterThan(0);

    // Place a customer order on Nude before renaming/archiving
    $customer = User::factory()->create();
    $order = checkoutSingleCartAsCustomer($this, $customer, [
        ['variant_id' => $nudeVariant->id, 'quantity' => 1],
    ]);

    // Row-level duplicate SKU error points to exact index without erasing state
    $this->actingAs($admin)->putJson("/api/v1/admin/products/{$product->id}", [
        'name' => $product->name,
        'sku' => $product->sku,
        'brand_id' => $brand->id,
        'category_ids' => [$category->id],
        'price_cents' => 3500,
        'has_variants' => true,
        'product_type' => 'variable',
        'variation_attributes' => [
            [
                'name' => 'Cor',
                'slug' => 'cor',
                'display_type' => 'color_swatch',
                'sort_order' => 1,
                'values' => [
                    ['uid' => 'c_rose', 'value' => 'Rosé', 'slug' => 'rose'],
                    ['uid' => 'c_nude', 'value' => 'Nude', 'slug' => 'nude'],
                    ['uid' => 'c_bordo', 'value' => 'Bordô', 'slug' => 'bordo'],
                ],
            ],
        ],
        'variants' => [
            [
                'id' => $roseVariant->id,
                'name' => 'Rosé',
                'sku' => 'BTM-ROSE-CUSTOM',
                'price_cents' => 3500,
                'cost_cents' => 1200,
                'stock_qty' => 7,
                'is_active' => true,
            ],
            [
                'id' => $nudeVariant->id,
                'name' => 'Nude',
                'sku' => 'BTM-NUDE-CUSTOM',
                'price_cents' => 3500,
                'cost_cents' => 1200,
                'stock_qty' => 5,
                'is_active' => true,
            ],
            [
                'name' => 'Bordô',
                'sku' => 'BTM-ROSE-CUSTOM', // Duplicate SKU!
                'price_cents' => 3500,
                'stock_qty' => 4,
                'is_active' => true,
            ],
        ],
    ])->assertStatus(422)
        ->assertJsonValidationErrors(['variants.2.sku']);

    // Now fix Bordô SKU, rename Rose -> Rosé, reorder -> existing variant ID, SKU, cost, and movements must be preserved
    $this->actingAs($admin)->putJson("/api/v1/admin/products/{$product->id}", [
        'name' => $product->name,
        'sku' => $product->sku,
        'brand_id' => $brand->id,
        'category_ids' => [$category->id],
        'price_cents' => 3500,
        'has_variants' => true,
        'product_type' => 'variable',
        'variation_attributes' => [
            [
                'name' => 'Cor',
                'slug' => 'cor',
                'display_type' => 'color_swatch',
                'sort_order' => 1,
                'values' => [
                    ['uid' => 'c_bordo', 'value' => 'Bordô', 'slug' => 'bordo'],
                    ['uid' => 'c_rose', 'value' => 'Rosé', 'slug' => 'rose'],
                    ['uid' => 'c_nude', 'value' => 'Nude', 'slug' => 'nude'],
                ],
            ],
        ],
        'variants' => [
            [
                'name' => 'Bordô',
                'sku' => 'BTM-BORDO-NEW',
                'option_values' => [
                    ['uid' => 'c_bordo', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Bordô', 'value_slug' => 'bordo'],
                ],
                'price_cents' => 3500,
                'stock_qty' => 4,
                'sort_order' => 0,
                'is_default' => true,
                'is_active' => true,
            ],
            [
                'id' => $roseVariant->id,
                'name' => 'Rosé',
                'sku' => 'BTM-ROSE-CUSTOM',
                'option_values' => [
                    ['uid' => 'c_rose', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Rosé', 'value_slug' => 'rose'],
                ],
                'price_cents' => 3500,
                'cost_cents' => 1200,
                'stock_qty' => 7,
                'sort_order' => 1,
                'is_active' => true,
            ],
            [
                'id' => $nudeVariant->id,
                'name' => 'Nude',
                'sku' => 'BTM-NUDE-CUSTOM',
                'option_values' => [
                    ['uid' => 'c_nude', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Nude', 'value_slug' => 'nude'],
                ],
                'price_cents' => 3500,
                'cost_cents' => 1200,
                'stock_qty' => 5,
                'sort_order' => 2,
                'is_active' => true,
            ],
        ],
    ])->assertOk();

    $roseVariant->refresh();
    expect($roseVariant->name)->toBe('Rosé');
    expect($roseVariant->stock_qty)->toBe(7);
    expect($roseVariant->cost_cents)->toBe(1200);
    expect(InventoryMovement::query()->where('product_variant_id', $roseVariant->id)->count())->toBe($movementsBefore);

    // Scenario 6: Archive Nude after confirming reservation deduction (simulated payment settlement)
    app(InventoryService::class)->confirmDeduction($order);
    $nudeVariant->refresh();

    $this->actingAs($admin)
        ->postJson("/api/v1/admin/products/{$product->id}/variants/{$nudeVariant->id}/archive")
        ->assertOk();

    $nudeVariant->refresh();
    expect($nudeVariant->archived_at)->not->toBeNull();
    expect($nudeVariant->is_active)->toBeFalse();

    // Archived SKU cannot be added to cart anymore
    $this->postJson('/api/v1/cart/items', ['variant_id' => $nudeVariant->id, 'quantity' => 1])
        ->assertStatus(422);

    // Storefront hides archived SKU from sellable variants
    $pdpAfterArchive = $this->getJson("/api/v1/catalog/products/{$product->slug}")->assertOk();
    expect(collect($pdpAfterArchive->json('data.variants'))->pluck('id')->all())->not->toContain($nudeVariant->id);

    // Historical admin order still identifies SKU, name, and archived flag
    $orderShow = $this->actingAs($admin)->getJson("/api/v1/admin/orders/{$order->id}")->assertOk();
    $archivedOrderItem = collect($orderShow->json('data.items'))->firstWhere('product_variant_id', $nudeVariant->id);
    expect($archivedOrderItem['sku_snapshot'])->toBe('BTM-NUDE-CUSTOM');
    expect($archivedOrderItem['variant_name_snapshot'])->toBe('Nude');
    expect($archivedOrderItem['variant_archived'])->toBeTrue();

    // Restore works cleanly
    $this->actingAs($admin)
        ->postJson("/api/v1/admin/products/{$product->id}/variants/{$nudeVariant->id}/restore")
        ->assertOk();
    $nudeVariant->refresh();
    expect($nudeVariant->archived_at)->toBeNull();
    expect($nudeVariant->is_active)->toBeTrue();
});

test('cenario 5: converter produto simples com 20 un em 2 variacoes distribui estoque e valida desativacao com impacto', function (): void {
    $admin = makeVariationsAdminUser();
    $brand = Brand::query()->firstOrFail();
    $category = Category::query()->firstOrFail();

    $created = $this->actingAs($admin)->postJson('/api/v1/admin/products', [
        'name' => 'Cabine LED UV Simples Inicial',
        'sku' => 'CAB-CONV-01',
        'brand_id' => $brand->id,
        'category_ids' => [$category->id],
        'price_cents' => 14990,
        'has_variants' => false,
        'product_type' => 'simple',
        'stock_qty' => 20,
        'is_active' => true,
    ])->assertCreated();

    $product = Product::query()->with('variants')->findOrFail((int) $created->json('data.id'));
    $oldSimpleVariant = $product->variants[0];
    expect($oldSimpleVariant->stock_qty)->toBe(20);

    // Convert simple (20 un.) into 2 colors (12 + 8 = 20 distributed)
    $this->actingAs($admin)->putJson("/api/v1/admin/products/{$product->id}", [
        'name' => $product->name,
        'sku' => $product->sku,
        'brand_id' => $brand->id,
        'category_ids' => [$category->id],
        'price_cents' => 14990,
        'has_variants' => true,
        'product_type' => 'variable',
        'variation_attributes' => [
            [
                'name' => 'Cor',
                'slug' => 'cor',
                'display_type' => 'color_swatch',
                'sort_order' => 1,
                'values' => [
                    ['uid' => 'wht', 'value' => 'Branco', 'slug' => 'branco'],
                    ['uid' => 'pnk', 'value' => 'Rosa', 'slug' => 'rosa'],
                ],
            ],
        ],
        'variants' => [
            [
                'name' => 'Branco',
                'sku' => 'CAB-CONV-01-BRAN',
                'option_values' => [
                    ['uid' => 'wht', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Branco', 'value_slug' => 'branco'],
                ],
                'price_cents' => 14990,
                'stock_qty' => 12,
                'is_default' => true,
                'is_active' => true,
            ],
            [
                'name' => 'Rosa',
                'sku' => 'CAB-CONV-01-ROSA',
                'option_values' => [
                    ['uid' => 'pnk', 'attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Rosa', 'value_slug' => 'rosa'],
                ],
                'price_cents' => 14990,
                'stock_qty' => 8,
                'is_active' => true,
            ],
        ],
    ])->assertOk();

    $product->refresh();
    $activeVars = $product->variants()->whereNull('archived_at')->get();
    expect($product->has_variants)->toBeTrue();
    expect($activeVars)->toHaveCount(2);
    expect((int) $activeVars->sum('stock_qty'))->toBe(20);
    expect(InventoryMovement::query()->whereIn('product_variant_id', $activeVars->pluck('id'))->where('type', InventoryMovementType::In->value)->count())->toBe(2);

    // Attempting to turn OFF variations without confirm_disable_variations must fail with impact warning
    $this->actingAs($admin)->putJson("/api/v1/admin/products/{$product->id}", [
        'name' => $product->name,
        'sku' => $product->sku,
        'brand_id' => $brand->id,
        'category_ids' => [$category->id],
        'price_cents' => 14990,
        'has_variants' => false,
        'product_type' => 'simple',
        'stock_qty' => 20,
    ])->assertStatus(422)
        ->assertJsonValidationErrors(['has_variants']);

    // Confirming disable converts safely back to simple with consolidated 20 un.
    $this->actingAs($admin)->putJson("/api/v1/admin/products/{$product->id}", [
        'name' => $product->name,
        'sku' => $product->sku,
        'brand_id' => $brand->id,
        'category_ids' => [$category->id],
        'price_cents' => 14990,
        'has_variants' => false,
        'product_type' => 'simple',
        'confirm_disable_variations' => true,
        'stock_qty' => 20,
    ])->assertOk();

    $product->refresh();
    expect($product->has_variants)->toBeFalse();
    expect((int) $product->variants()->whereNull('archived_at')->sum('stock_qty'))->toBe(20);
});

test('cenario 7: busca por IA diferencia especificacao fixa de produto com opcoes de variacao', function (): void {
    $admin = makeVariationsAdminUser();

    IntegrationSetting::query()->where('provider', 'google_search')->delete();
    config()->set('services.google_search.driver', 'serper');
    config()->set('services.google_search.serper_api_key', 'serper_live_mock_key');

    Http::fake([
        'https://google.serper.dev/search' => Http::sequence()
            ->push([
                'organic' => [
                    [
                        'title' => 'Esmalte Gel Vòlia Classic 15ml - Top Coat Unhas',
                        'link' => 'https://loja.fabricante.com.br/esmalte-volia-15ml',
                        'snippet' => 'Frasco único 15ml profissional com secagem em cabine LED UV.',
                        'position' => 1,
                    ],
                ],
            ], 200)
            ->push([
                'organic' => [
                    [
                        'title' => 'Esmalte em Gel Bella Linha Completa Cores: Nude, Rosé, Vermelho',
                        'link' => 'https://loja.fabricante.com.br/esmalte-bella-colecao',
                        'snippet' => 'Disponível nas cores Nude, Rosé e Vermelho nos volumes 8 ml e 15 ml.',
                        'position' => 1,
                    ],
                ],
            ], 200),
        'https://google.serper.dev/images' => Http::response(['images' => []], 200),
        'https://loja.fabricante.com.br/*' => Http::response('<html><body>Produto cosmético oficial</body></html>', 200, ['Content-Type' => 'text/html']),
    ]);

    $resFixed = $this->actingAs($admin)->postJson('/api/v1/admin/ai/catalog/lookup', [
        'query' => 'Esmalte Gel Vòlia Classic 15ml',
    ])->assertOk();

    expect($resFixed->json('data.state'))->toBe('draft_ready');
    expect($resFixed->json('data.draft.unit_label'))->toBe('15 ml');
    expect($resFixed->json('data.draft.suggested_has_variants'))->toBeFalse();

    $resVariable = $this->actingAs($admin)->postJson('/api/v1/admin/ai/catalog/lookup', [
        'query' => 'Esmalte em Gel Bella Linha Completa Cores Volumes',
    ])->assertOk();

    expect($resVariable->json('data.state'))->toBe('draft_ready');
    expect($resVariable->json('data.draft.suggested_has_variants'))->toBeTrue();
    $suggestedAttrs = collect($resVariable->json('data.draft.suggested_variation_attributes'));
    expect($suggestedAttrs->pluck('slug')->all())->toContain('cor');
    expect($suggestedAttrs->pluck('slug')->all())->toContain('volume');
});
