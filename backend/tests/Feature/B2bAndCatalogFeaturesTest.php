<?php

declare(strict_types=1);

use App\Domain\Catalog\Events\VariantRestocked;
use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Shared\Enums\InventoryMovementType;
use App\Domain\Shared\Enums\RoleSlug;
use App\Mail\RestockAvailableMail;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\RestockRequest;
use App\Models\SharedCart;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
});

function customerUser(): User
{
    /** @var User $user */
    $user = User::query()->whereHas('roles', fn ($q) => $q->where('slug', RoleSlug::Customer->value))->firstOrFail();

    return $user;
}

function adminUser(): User
{
    /** @var User $user */
    $user = User::query()->whereHas('roles', fn ($q) => $q->where('slug', RoleSlug::Superadmin->value))->firstOrFail();

    return $user;
}

test('TESTE 01 - replenishment lists manage custom lists, live stock check, guest sync and partial add to cart', function (): void {
    $this->actingAs(customerUser());

    $inStockVariant = ProductVariant::query()->where('sku', 'MF-ESM-001-ROS')->firstOrFail();
    $lowStockVariant = ProductVariant::query()->where('sku', 'MF-ESM-001-RUB')->firstOrFail();
    $outOfStockVariant = ProductVariant::query()->where('sku', 'MF-ESM-001-R42')->firstOrFail();

    // Ensure low stock scenario for partial fulfillment
    $lowStockVariant->update(['stock_qty' => 3, 'reserved_qty' => 0]);

    // 1. Create custom replenishment list
    $createRes = $this->postJson('/api/v1/account/replenishment-lists', [
        'name' => 'Salão Segunda-Feira',
        'is_default' => true,
    ])->assertCreated();

    $listId = (int) $createRes->json('data.id');
    expect($listId)->toBeGreaterThan(0);

    // 2. Add items (one ok, one partial stock, one out of stock)
    $this->postJson('/api/v1/account/replenishment-lists/items', [
        'list_id' => $listId,
        'variant_id' => $inStockVariant->id,
        'quantity' => 2,
    ])->assertCreated();

    $lowItemRes = $this->postJson('/api/v1/account/replenishment-lists/items', [
        'list_id' => $listId,
        'variant_id' => $lowStockVariant->id,
        'quantity' => 5,
    ])->assertCreated();

    $this->postJson('/api/v1/account/replenishment-lists/items', [
        'list_id' => $listId,
        'variant_id' => $outOfStockVariant->id,
        'quantity' => 4,
    ])->assertCreated();

    // 3. Guest sync adds missing item / bumps qty into default list
    $syncVariant = ProductVariant::query()->where('sku', 'MF-MSC-004')->firstOrFail();
    $this->postJson('/api/v1/account/replenishment-lists/sync', [
        'items' => [
            ['variant_id' => $syncVariant->id, 'quantity' => 2],
        ],
    ])->assertOk();

    // 4. Add available items to cart -> out of stock skipped, low stock capped at available (3)
    $addCartRes = $this->postJson("/api/v1/account/replenishment-lists/{$listId}/add-to-cart");
    $addCartRes->assertOk();

    $data = $addCartRes->json('data');
    expect(count($data['unavailable_items']))->toBe(1);
    expect(count($data['partial_items']))->toBe(1);
    expect($data['added_units_total'])->toBe(7); // 2 + 3 (capped) + 2 (synced)

    // Verify cart actually holds expected items
    $cartItems = collect($data['cart']['items']);
    expect($cartItems->firstWhere('variant_id', $outOfStockVariant->id))->toBeNull();
    expect((int) $cartItems->firstWhere('variant_id', $lowStockVariant->id)['quantity'])->toBe(3);

    // 5. Update quantity & create from cart
    $firstItemId = (int) $lowItemRes->json('data.items.0.id');
    $this->patchJson("/api/v1/account/replenishment-lists/{$listId}/items/{$firstItemId}", [
        'quantity' => 4,
    ])->assertOk();

    $fromCartRes = $this->postJson('/api/v1/account/replenishment-lists/from-cart', [
        'name' => 'Lista Do Carrinho',
    ]);
    $fromCartRes->assertCreated();
    expect($fromCartRes->json('data.name'))->toBe('Lista Do Carrinho');
});

test('TESTE 02 - multi-shade bulk cart purchase adds valid shades, rejects OOS, and groups wholesale discount across shades', function (): void {
    $product = Product::query()->where('sku', 'MF-ESM-001')->firstOrFail();
    $product->update([
        'wholesale_enabled' => true,
        'wholesale_group_variants' => true,
        'wholesale_tiers' => [['min_qty' => 5, 'discount_percent' => 10], ['min_qty' => 10, 'discount_percent' => 20]],
    ]);

    $rose = ProductVariant::query()->where('sku', 'MF-ESM-001-ROS')->firstOrFail();
    $rubi = ProductVariant::query()->where('sku', 'MF-ESM-001-RUB')->firstOrFail();
    $nude = ProductVariant::query()->where('sku', 'MF-ESM-001-NUD')->firstOrFail();
    $oos = ProductVariant::query()->where('sku', 'MF-ESM-001-R42')->firstOrFail();

    // 2 + 2 + 2 = 6 total units across 3 shades of the same product (>= 5 min_qty tier = 10% wholesale discount)
    $res = $this->postJson('/api/v1/cart/items/bulk', [
        'items' => [
            ['variant_id' => $rose->id, 'quantity' => 2],
            ['variant_id' => $rubi->id, 'quantity' => 2],
            ['variant_id' => $nude->id, 'quantity' => 2],
            ['variant_id' => $oos->id, 'quantity' => 1],
        ],
    ]);

    $res->assertCreated();
    expect(count($res->json('added')))->toBe(3);
    expect(count($res->json('rejected')))->toBe(1);
    expect((int) $res->json('rejected.0.variant_id'))->toBe($oos->id);
    expect((int) $res->json('data.wholesale_discount_cents'))->toBeGreaterThan(0);
    expect((int) $res->json('data.items_count'))->toBe(6);
});

test('TESTE 03 - category contextual attribute filters return category facets and narrow results', function (): void {
    // Esmaltes category should expose acabado / volume / familia-cor attributes, NOT cabine potencia/tensao
    $catRes = $this->getJson('/api/v1/catalog/categories/esmaltes-em-gel')->assertOk();
    $attrSlugs = collect($catRes->json('data.facets.attributes'))->pluck('slug')->all();

    expect($attrSlugs)->toContain('acabamento');
    expect($attrSlugs)->not->toContain('potencia');

    // Filter cabines by attr_potencia=48w
    $cabinesFiltered = $this->getJson('/api/v1/catalog/categories/cabines-e-estufas?attr_potencia=48w')->assertOk();
    $skus = collect($cabinesFiltered->json('data.products'))->pluck('sku')->all();
    expect($skus)->toContain('MF-CAB-007');
    expect($skus)->toContain('JK-DST-001');
    expect($skus)->not->toContain('JK-DST-002'); // 268w must be excluded
});

test('TESTE 04 - product comparator compares compatible products with diff flags and blocks incompatible categories', function (): void {
    $cab1 = Product::query()->where('sku', 'MF-CAB-007')->firstOrFail();
    $cab2 = Product::query()->where('sku', 'JK-DST-001')->firstOrFail();
    $cab3 = Product::query()->where('sku', 'JK-DST-002')->firstOrFail();
    $esmalte = Product::query()->where('sku', 'MF-ESM-001')->firstOrFail();
    $primer = Product::query()->where('sku', 'MF-PRM-008')->firstOrFail();

    // Compatible cabines comparison
    $res = $this->getJson("/api/v1/catalog/compare?ids={$cab2->id},{$cab3->id}")->assertOk();
    $attrs = collect($res->json('data.attributes'));
    $potencia = $attrs->firstWhere('slug', 'potencia');
    $tensao = $attrs->firstWhere('slug', 'tensao');

    expect($potencia)->not->toBeNull();
    expect($potencia['has_difference'])->toBeTrue(); // 48W vs 268W
    expect($tensao['has_difference'])->toBeFalse(); // Bivolt vs Bivolt

    // Incompatible categories -> 422
    $this->getJson("/api/v1/catalog/compare?ids={$cab2->id},{$esmalte->id}")
        ->assertStatus(422);

    // > 3 products -> 422
    $this->getJson("/api/v1/catalog/compare?ids={$cab1->id},{$cab2->id},{$cab3->id},{$primer->id}")
        ->assertStatus(422);
});

test('TESTE 05 - shared cart generates token, rehydrates live prices/stock, merges into recipient cart and handles expired/missing tokens', function (): void {
    $rose = ProductVariant::query()->where('sku', 'MF-ESM-001-ROS')->firstOrFail();
    $rubi = ProductVariant::query()->where('sku', 'MF-ESM-001-RUB')->firstOrFail();
    $mascara = ProductVariant::query()->where('sku', 'MF-MSC-004')->firstOrFail();

    // Cart A creates share link
    $addA = $this->postJson('/api/v1/cart/items', [
        'variant_id' => $rose->id,
        'quantity' => 2,
    ])->assertCreated();
    $tokenA = $addA->headers->get('X-Cart-Token');

    $shareRes = $this->withHeader('X-Cart-Token', (string) $tokenA)
        ->postJson('/api/v1/cart/share', ['title' => 'Pedido Salão Teste']);
    $shareRes->assertCreated();
    $shareToken = (string) $shareRes->json('data.token');
    expect(strlen($shareToken))->toBeGreaterThanOrEqual(16);

    // Update live price + deplete rubi or cap stock
    $rose->update(['promo_price_cents' => 1450]);

    $sharedView = $this->getJson("/api/v1/cart/shared/{$shareToken}")->assertOk();
    expect((int) $sharedView->json('data.items.0.unit_price_cents'))->toBe(1450);

    // Cart B already has Mascara, then imports shared cart -> Mascara stays, Rose is merged
    $addB = $this->postJson('/api/v1/cart/items', [
        'variant_id' => $mascara->id,
        'quantity' => 1,
    ])->assertCreated();
    $tokenB = $addB->headers->get('X-Cart-Token');

    $importRes = $this->withHeader('X-Cart-Token', (string) $tokenB)
        ->postJson("/api/v1/cart/shared/{$shareToken}/import")
        ->assertOk();

    $importedSkus = collect($importRes->json('data.items'))->pluck('sku')->all();
    expect($importedSkus)->toContain('MF-MSC-004');
    expect($importedSkus)->toContain('MF-ESM-001-ROS');

    // Invalid token -> 404
    $this->getJson('/api/v1/cart/shared/token-inexistente-xyz')->assertNotFound();

    // Expired token -> 410
    /** @var SharedCart $sharedCart */
    $sharedCart = SharedCart::query()->where('token', $shareToken)->firstOrFail();
    $sharedCart->update(['expires_at' => now()->subDay()]);
    $this->getJson("/api/v1/cart/shared/{$shareToken}")->assertStatus(410);
});

test('TESTE 06 - variant restock alert subscription, duplicate prevention, VariantRestocked dispatch, mail queue, cancel token and admin demand analytics', function (): void {
    Mail::fake();

    $esmalte = Product::query()->where('sku', 'MF-ESM-001')->firstOrFail();
    $inStockShade = ProductVariant::query()->where('sku', 'MF-ESM-001-ROS')->firstOrFail();
    $oosShade = ProductVariant::query()->where('sku', 'MF-ESM-001-R42')->firstOrFail();
    $secondOosProduct = Product::query()->where('sku', 'MF-ESM-015')->firstOrFail();
    $secondOosVariant = $secondOosProduct->variants()->firstOrFail();

    // 1. In-stock variant rejected
    $this->postJson("/api/v1/catalog/products/{$esmalte->slug}/restock-alert", [
        'variant_id' => $inStockShade->id,
        'email' => 'cliente@salao.com.br',
        'consent_given' => true,
    ])->assertStatus(422);

    // 2. OOS variant accepted
    $sub1 = $this->postJson("/api/v1/catalog/products/{$esmalte->slug}/restock-alert", [
        'variant_id' => $oosShade->id,
        'email' => 'cliente@salao.com.br',
        'name' => 'Maria Manicure',
        'consent_given' => true,
    ]);
    $sub1->assertCreated();
    $unsubToken = (string) $sub1->json('data.unsubscribe_token');

    // 3. Same email + same variant rejected as 409 duplicate
    $this->postJson("/api/v1/catalog/products/{$esmalte->slug}/restock-alert", [
        'variant_id' => $oosShade->id,
        'email' => 'cliente@salao.com.br',
        'consent_given' => true,
    ])->assertStatus(409);

    // 4. Same email + DIFFERENT OOS variant allowed
    $sub2 = $this->postJson("/api/v1/catalog/products/{$secondOosProduct->slug}/restock-alert", [
        'variant_id' => $secondOosVariant->id,
        'email' => 'cliente@salao.com.br',
        'consent_given' => true,
    ]);
    $sub2->assertCreated();

    // 5. Cancel by unsubscribe token
    $this->postJson("/api/v1/catalog/restock-alerts/{$unsubToken}/cancel")->assertOk();
    expect(RestockRequest::query()->where('unsubscribe_token', $unsubToken)->value('status'))->toBe('cancelled');

    // Re-subscribe new user on OOS shade to verify notification dispatch on 0 -> >0
    $this->postJson("/api/v1/catalog/products/{$esmalte->slug}/restock-alert", [
        'variant_id' => $oosShade->id,
        'email' => 'aviso.ativo@salao.com.br',
        'consent_given' => true,
    ])->assertCreated();

    // Verify admin summary before restock
    $admin = adminUser();
    $this->actingAs($admin);
    $summaryRes = $this->getJson('/api/v1/admin/restock-alerts/summary')->assertOk();
    expect($summaryRes->json('data.kpis.pending_count'))->toBeGreaterThanOrEqual(2);
    expect(count($summaryRes->json('data.demand_ranking')))->toBeGreaterThanOrEqual(1);

    $this->getJson('/api/v1/admin/replenishment/insights')->assertOk();
    $this->getJson('/api/v1/admin/dashboard')
        ->assertOk()
        ->assertJsonStructure([
            'data' => [
                'kpis' => [
                    'multi_shade_add_count',
                    'shared_carts_created_count',
                    'replenishment_lists_count',
                    'pending_restock_count',
                ],
                'top_demanded_variants',
                'top_replenishment_variants',
            ],
        ]);

    // 6. Trigger 0 -> 10 stock transition and verify event & queued mail
    Event::fake([VariantRestocked::class]);
    app(InventoryService::class)->adjustStock(
        $oosShade->fresh(),
        10,
        InventoryMovementType::In,
        $admin,
        'Reposição de estoque em lote'
    );
    Event::assertDispatched(VariantRestocked::class, fn (VariantRestocked $e): bool => $e->variant->id === $oosShade->id);
    Mail::assertQueued(RestockAvailableMail::class, fn (RestockAvailableMail $mail): bool => $mail->hasTo('aviso.ativo@salao.com.br'));

    expect(
        RestockRequest::query()
            ->where('product_variant_id', $oosShade->id)
            ->where('email', 'aviso.ativo@salao.com.br')
            ->value('status')
    )->toBe('notified');
});
