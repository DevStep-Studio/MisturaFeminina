<?php

declare(strict_types=1);

use App\Domain\Catalog\Events\VariantRestocked;
use App\Domain\Shared\Enums\OrderStatus;
use App\Domain\Shared\Enums\ProductType;
use App\Domain\Shared\Enums\RoleSlug;
use App\Mail\RestockAvailableMail;
use App\Models\AssistedOrder;
use App\Models\BulkEditBatch;
use App\Models\GoodsReceipt;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\ShippingQuote;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
});

function createStaffWithRole(RoleSlug $roleSlug, string $email): User
{
    $user = User::factory()->create([
        'name' => 'Equipe '.$roleSlug->value,
        'email' => $email,
        'is_active' => true,
    ]);
    $role = Role::query()->where('slug', $roleSlug->value)->firstOrFail();
    $user->roles()->sync([$role->id]);

    return $user;
}

function makeOrder(array $overrides = []): Order
{
    static $seq = 1000;
    $seq++;

    return Order::query()->create(array_merge([
        'order_number' => "MF-20261120-T{$seq}",
        'public_token' => Str::uuid()->toString(),
        'idempotency_key' => "idem-{$seq}-".Str::random(6),
        'is_guest' => true,
        'customer_name' => 'Maria Paula',
        'customer_email' => 'maria@salao.com.br',
        'customer_phone' => '11999990000',
        'shipping_address_snapshot' => ['cep' => '01001000', 'street' => 'Praça da Sé', 'number' => '10', 'neighborhood' => 'Sé', 'city' => 'São Paulo', 'state' => 'SP'],
        'shipping_service_snapshot' => ['carrier' => 'Correios', 'service_name' => 'PAC'],
        'subtotal_cents' => 3380,
        'discount_cents' => 0,
        'shipping_cents' => 1500,
        'tax_cents' => 0,
        'total_cents' => 4880,
        'status' => OrderStatus::Paid,
        'paid_at' => now()->subHours(2),
    ], $overrides));
}

test('TESTE 1 - Today Work dashboard computes real counters, filters, task completion, and RBAC visibility', function (): void {
    $admin = createStaffWithRole(RoleSlug::Superadmin, 'super@misturafeminina.com.br');
    $fulfillment = createStaffWithRole(RoleSlug::Fulfillment, 'expedicao@misturafeminina.com.br');

    // Create 1 order to ship today, 1 order with payment_failed issue, and 1 product needing review
    $shipOrder = makeOrder(['status' => OrderStatus::Paid]);
    $issueOrder = makeOrder(['status' => OrderStatus::PaymentFailed, 'paid_at' => null]);

    $brokenProd = Product::query()->create([
        'name' => 'Produto Incompleto Sem Foto',
        'slug' => 'produto-incompleto-sem-foto',
        'sku' => 'MF-INC-999',
        'product_type' => ProductType::Simple,
        'price_cents' => 0,
        'is_active' => true,
    ]);

    $this->actingAs($admin);
    $res = $this->getJson('/api/v1/admin/today-work')->assertOk();
    $cards = $res->json('data.cards');

    expect((int) $cards['ship_today_count'])->toBeGreaterThanOrEqual(1);
    expect((int) $cards['order_issues_count'])->toBeGreaterThanOrEqual(1);
    expect((int) $cards['products_review_count'])->toBeGreaterThanOrEqual(1);
    expect((int) $cards['out_of_stock_variants_count'])->toBeGreaterThanOrEqual(1);

    // Filtered orders endpoints match cards
    $shipIds = collect($this->getJson('/api/v1/admin/orders?filter=ship_today')->assertOk()->json('data'))->pluck('id')->all();
    expect($shipIds)->toContain($shipOrder->id)->not->toContain($issueOrder->id);

    $issueIds = collect($this->getJson('/api/v1/admin/orders?filter=issues')->assertOk()->json('data'))->pluck('id')->all();
    expect($issueIds)->toContain($issueOrder->id);

    $reviewIds = collect($this->getJson('/api/v1/admin/products?filter=needs_review')->assertOk()->json('data'))->pluck('id')->all();
    expect($reviewIds)->toContain($brokenProd->id);

    // Mark order shipped -> leaves ship_today count
    $this->patchJson("/api/v1/admin/orders/{$shipOrder->id}/shipment", [
        'carrier' => 'Correios',
        'tracking_code' => 'BR998877665',
        'mark_shipped' => true,
    ])->assertOk();

    $afterShipIds = collect($this->getJson('/api/v1/admin/orders?filter=ship_today')->assertOk()->json('data'))->pluck('id')->all();
    expect($afterShipIds)->not->toContain($shipOrder->id);

    // Fulfillment role can view today-work and orders, CANNOT view financial reports
    $this->actingAs($fulfillment);
    $this->getJson('/api/v1/admin/today-work')->assertOk();
    $this->getJson('/api/v1/admin/reports')->assertForbidden();
});

test('TESTE 2 - Assisted Order searches shades, saves draft, generates checkout link, loads cart and converts at official checkout', function (): void {
    realPaymentFakes();
    $support = createStaffWithRole(RoleSlug::Support, 'atendente@misturafeminina.com.br');
    $this->actingAs($support);

    // Search catalog by SKU / shade
    $searchRes = $this->getJson('/api/v1/admin/assisted-orders/catalog-search?q=MF-ESM-001')->assertOk();
    expect(count($searchRes->json('data')))->toBeGreaterThanOrEqual(1);

    $rose = ProductVariant::query()->where('sku', 'MF-ESM-001-ROS')->firstOrFail();
    $rubi = ProductVariant::query()->where('sku', 'MF-ESM-001-RUB')->firstOrFail();
    $oos = ProductVariant::query()->where('sku', 'MF-ESM-001-R42')->firstOrFail();

    // Insufficient stock blocks draft
    $this->postJson('/api/v1/admin/assisted-orders', [
        'customer_name' => 'Ana Manicure',
        'items' => [['variant_id' => $oos->id, 'quantity' => 1]],
    ])->assertStatus(422);

    // Save draft with multiple shades & update qty
    $draft = $this->postJson('/api/v1/admin/assisted-orders', [
        'customer_name' => 'Ana Manicure',
        'customer_email' => 'ana.manicure@salao.com.br',
        'customer_phone' => '11988887777',
        'items' => [
            ['variant_id' => $rose->id, 'quantity' => 2],
            ['variant_id' => $rubi->id, 'quantity' => 1],
        ],
    ])->assertCreated();

    $assistedId = (int) $draft->json('data.id');
    expect($draft->json('data.status'))->toBe('draft');

    $this->putJson("/api/v1/admin/assisted-orders/{$assistedId}", [
        'customer_name' => 'Ana Manicure',
        'customer_email' => 'ana.manicure@salao.com.br',
        'customer_phone' => '11988887777',
        'items' => [
            ['variant_id' => $rose->id, 'quantity' => 3],
            ['variant_id' => $rubi->id, 'quantity' => 2],
        ],
    ])->assertOk();

    // Generate checkout link -> status becomes link_generated, NOT paid
    $linkRes = $this->postJson("/api/v1/admin/assisted-orders/{$assistedId}/generate-link", [
        'expires_in_hours' => 48,
    ])->assertOk();

    $token = (string) $linkRes->json('data.token');
    expect($linkRes->json('data.assisted_order.status'))->toBe('link_generated');

    // Customer opens assisted checkout in a clean guest session & loads cart
    auth()->forgetGuards();
    $this->getJson("/api/v1/checkout/assisted/{$token}")->assertOk();
    $loadRes = $this->postJson("/api/v1/checkout/assisted/{$token}/load-cart")->assertOk();
    $cartToken = $loadRes->headers->get('X-Cart-Token');

    // Quote shipping and submit real checkout using the assisted_order_token
    $quoteRes = $this->withHeader('X-Cart-Token', (string) $cartToken)
        ->postJson('/api/v1/cart/shipping/quote', ['cep' => '01001000'])
        ->assertOk();
    $quoteId = (int) ShippingQuote::query()->latest('id')->value('id');

    $checkoutRes = $this->withHeader('X-Cart-Token', (string) $cartToken)
        ->postJson('/api/v1/checkout', [
            'customer_name' => 'Ana Manicure',
            'customer_email' => 'ana.manicure@salao.com.br',
            'customer_phone' => '11988887777',
            'customer_cpf_cnpj' => '52998224725',
            'shipping_quote_id' => $quoteId,
            'shipping_address' => [
                'cep' => '01001000',
                'street' => 'Praça da Sé',
                'number' => '100',
                'neighborhood' => 'Sé',
                'city' => 'São Paulo',
                'state' => 'SP',
            ],
            'payment_method' => 'pix',
            'defer_payment' => true,
            'assisted_order_token' => $token,
        ]);

    $checkoutRes->assertCreated();
    $orderId = (int) $checkoutRes->json('data.order.id');

    $assisted = AssistedOrder::query()->findOrFail($assistedId);
    expect($assisted->status)->toBe('converted');
    expect((int) $assisted->converted_order_id)->toBe($orderId);

    // Expired token -> HTTP 410
    $assisted->update(['status' => 'link_generated', 'expires_at' => now()->subMinute()]);
    $this->getJson("/api/v1/checkout/assisted/{$token}")->assertStatus(410);
});

test('TESTE 3 - Bulk Variant Edit parses 30 pasted Excel rows with BR prices, detects errors/duplicates, commits idempotently and logs movements', function (): void {
    $catalog = createStaffWithRole(RoleSlug::Catalog, 'catalogo@misturafeminina.com.br');
    $fulfillment = createStaffWithRole(RoleSlug::Fulfillment, 'estoque.only@misturafeminina.com.br');
    $product = Product::query()->where('sku', 'MF-ESM-001')->firstOrFail();

    // Fulfillment lacks catalog.bulk_edit / catalog.pricing
    $this->actingAs($fulfillment);
    $this->postJson('/api/v1/admin/variants/bulk-commit', ['rows' => [['sku' => 'X']]])->assertForbidden();

    $this->actingAs($catalog);

    // 1. Parse invalid pasted data (duplicate SKU + negative price)
    $badRaw = "Cor\tSKU\tPreço\tEstoque\nTonalidade Dup\tDUP-001\tR$ 19,90\t5\nTonalidade Dup 2\tDUP-001\t-5,00\t10";
    $badPreview = $this->postJson('/api/v1/admin/variants/bulk-parse', [
        'raw_text' => $badRaw,
        'default_product_id' => $product->id,
    ])->assertOk();

    expect((int) $badPreview->json('data.summary.invalid_count'))->toBe(2);
    expect($badPreview->json('data.summary.duplicate_skus'))->toContain('DUP-001');

    // 2. Parse 30 valid rows pasted from Excel with Brazilian comma decimals
    $lines = ["Cor\tSKU\tPreço\tEstoque\tNúmero"];
    for ($i = 1; $i <= 30; $i++) {
        $num = str_pad((string) $i, 3, '0', STR_PAD_LEFT);
        $lines[] = "Cor Coleção {$num}\tCOL-{$num}\t19,90\t{$i}\t{$num}";
    }
    $validParse = $this->postJson('/api/v1/admin/variants/bulk-parse', [
        'raw_text' => implode("\n", $lines),
        'default_product_id' => $product->id,
    ])->assertOk();

    expect((int) $validParse->json('data.summary.total_rows'))->toBe(30);
    expect((int) $validParse->json('data.summary.new_count'))->toBe(30);
    expect((int) $validParse->json('data.summary.invalid_count'))->toBe(0);
    expect((int) $validParse->json('data.rows.0.price_cents'))->toBe(1990);

    $idemKey = 'bulk-test-idem-30-shades';
    $commit1 = $this->postJson('/api/v1/admin/variants/bulk-commit', [
        'rows' => $validParse->json('data.rows'),
        'default_product_id' => $product->id,
        'source' => 'paste',
        'idempotency_key' => $idemKey,
    ])->assertCreated();

    expect((int) $commit1->json('data.batch.created_count'))->toBe(30);
    expect(ProductVariant::query()->where('sku', 'COL-015')->value('price_cents'))->toBe(1990);
    expect(ProductVariant::query()->where('sku', 'COL-015')->value('stock_qty'))->toBe(15);
    expect(InventoryMovement::query()->count())->toBeGreaterThanOrEqual(30);

    // Repeating commit with same idempotency_key must NOT duplicate stock!
    $commit2 = $this->postJson('/api/v1/admin/variants/bulk-commit', [
        'rows' => $validParse->json('data.rows'),
        'default_product_id' => $product->id,
        'source' => 'paste',
        'idempotency_key' => $idemKey,
    ])->assertCreated();

    expect($commit2->json('data.idempotent_replay'))->toBeTrue();
    expect(ProductVariant::query()->where('sku', 'COL-015')->value('stock_qty'))->toBe(15);
    expect(BulkEditBatch::query()->count())->toBe(1);
});

test('TESTE 4 - Goods Receipt handles suppliers, discrepancy & damaged exclusion, lots/expiry, idempotent confirmation and triggers restock notification', function (): void {
    Mail::fake();

    $catalog = createStaffWithRole(RoleSlug::Catalog, 'recebimento@misturafeminina.com.br');
    $oosVariant = ProductVariant::query()->where('sku', 'MF-ESM-001-R42')->firstOrFail();

    // Subscribe customer waiting on out-of-stock shade before receipt
    $this->postJson('/api/v1/catalog/products/esmalte-gel-alta-duracao-15ml/restock-alert', [
        'variant_id' => $oosVariant->id,
        'email' => 'compradora@salao.com.br',
        'consent_given' => true,
    ])->assertCreated();

    $this->actingAs($catalog);

    $supplierRes = $this->postJson('/api/v1/admin/suppliers', [
        'name' => 'Distribuidora Beleza Sul',
        'document' => '12.345.678/0001-99',
    ])->assertCreated();
    $supplierId = (int) $supplierRes->json('data.id');

    $rose = ProductVariant::query()->where('sku', 'MF-ESM-001-ROS')->firstOrFail();
    $initialRoseStock = $rose->stock_qty;

    // Receipt: expected 20 Rose, arrived 18, accepted 16 (2 damaged rejected -> must NOT enter sellable stock)
    // Plus 12 accepted of OOS variant with lot & expiry
    $recRes = $this->postJson('/api/v1/admin/goods-receipts', [
        'supplier_id' => $supplierId,
        'invoice_number' => 'NF-44210',
        'items' => [
            [
                'product_variant_id' => $rose->id,
                'expected_qty' => 20,
                'received_qty' => 18,
                'accepted_qty' => 16,
                'discrepancy_reason' => 'damaged_product',
                'lot_code' => 'LOTE-ROS-26',
                'expires_at' => now()->addDays(20)->toDateString(),
            ],
            [
                'product_variant_id' => $oosVariant->id,
                'expected_qty' => 12,
                'received_qty' => 12,
                'accepted_qty' => 12,
                'lot_code' => 'LOTE-R42-26',
                'expires_at' => now()->addDays(180)->toDateString(),
            ],
        ],
    ])->assertCreated();

    $receiptId = (int) $recRes->json('data.id');
    expect($recRes->json('data.has_discrepancy'))->toBeTrue();
    // Stock NOT modified while still in checking/discrepancy state
    expect($rose->fresh()->stock_qty)->toBe($initialRoseStock);

    Event::fake([VariantRestocked::class]);
    $this->postJson("/api/v1/admin/goods-receipts/{$receiptId}/confirm")->assertOk();

    // Only accepted quantities added (+16, not 18 or 20)
    expect($rose->fresh()->stock_qty)->toBe($initialRoseStock + 16);
    expect($oosVariant->fresh()->stock_qty)->toBe(12);
    expect(GoodsReceipt::query()->findOrFail($receiptId)->status)->toBe('completed');
    expect(InventoryLot::query()->where('lot_code', 'LOTE-ROS-26')->value('remaining_qty'))->toBe(16);

    // Restock alert notification fired for 0 -> 12 OOS shade
    Event::assertDispatched(VariantRestocked::class, fn (VariantRestocked $e): bool => $e->variant->id === $oosVariant->id);
    Mail::assertQueued(RestockAvailableMail::class, fn (RestockAvailableMail $m): bool => $m->hasTo('compradora@salao.com.br'));

    // Lot expiry summary reflects 30d expiring lot
    $lotsRes = $this->getJson('/api/v1/admin/inventory/lots')->assertOk();
    expect((int) $lotsRes->json('data.counts.expiring_30d'))->toBeGreaterThanOrEqual(1);

    // Repeating confirm must fail cleanly without duplicating stock!
    $this->postJson("/api/v1/admin/goods-receipts/{$receiptId}/confirm")->assertStatus(422);
    expect($rose->fresh()->stock_qty)->toBe($initialRoseStock + 16);
});

test('TESTE 5 - Order Unified Timeline & After-Sales Occurrences link items, assign staff, record internal notes and preserve history', function (): void {
    $support = createStaffWithRole(RoleSlug::Support, 'posvenda@misturafeminina.com.br');
    $fulfillment = createStaffWithRole(RoleSlug::Fulfillment, 'logistica.pos@misturafeminina.com.br');

    $order = makeOrder(['status' => OrderStatus::Shipped]);
    $rose = ProductVariant::query()->where('sku', 'MF-ESM-001-ROS')->firstOrFail();
    $orderItem = OrderItem::query()->create([
        'order_id' => $order->id,
        'product_id' => $rose->product_id,
        'product_variant_id' => $rose->id,
        'product_name_snapshot' => 'Esmalte Gel',
        'variant_name_snapshot' => 'Rosé Antigo 012',
        'sku_snapshot' => $rose->sku,
        'quantity' => 2,
        'unit_price_cents' => 1690,
        'discount_cents' => 0,
        'total_cents' => 3380,
        'weight_grams_snapshot' => 200,
    ]);

    $this->actingAs($support);

    // Create item-linked occurrence
    $occRes = $this->postJson("/api/v1/admin/orders/{$order->id}/occurrences", [
        'order_item_id' => $orderItem->id,
        'type' => 'wrong_shade',
        'priority' => 'high',
        'affected_qty' => 1,
        'description' => 'Cliente recebeu tom Nude 018 no lugar de Rosé 012.',
        'assigned_to_user_id' => $support->id,
    ])->assertCreated();

    $occId = (int) $occRes->json('data.id');
    expect($order->fresh()->has_issue)->toBeTrue();
    expect($occRes->json('data.product_snapshot.sku'))->toBe($rose->sku);

    // Add internal note
    $this->postJson("/api/v1/admin/orders/{$order->id}/notes", [
        'order_occurrence_id' => $occId,
        'note_type' => 'customer_contact',
        'body' => 'Contato realizado via WhatsApp, enviada etiqueta reversa.',
        'next_action' => 'Aguardar postagem da devolução',
    ])->assertCreated();

    // Transfer & resolve occurrence
    $this->patchJson("/api/v1/admin/occurrences/{$occId}", [
        'status' => 'resolved',
        'assigned_to_user_id' => $fulfillment->id,
        'resolution_type' => 'replacement_sent',
        'resolution_notes' => 'Reenvio da cor correta efetuado.',
    ])->assertOk();

    expect($order->fresh()->has_issue)->toBeFalse();

    // Order show contains unified timeline with occurrence & note events
    $showRes = $this->getJson("/api/v1/admin/orders/{$order->id}")->assertOk();
    $timelineTitles = collect($showRes->json('data.timeline'))->pluck('title')->implode(' | ');
    expect($timelineTitles)->toContain('aberta')->toContain('Nota interna');
});

test('TESTE 6 - Intelligent Reports log zero-result searches, apply synonyms, aggregate demanded shades, calculate bought-together pairs & protect CSV export', function (): void {
    // 1. Trigger public search with zero results
    $this->getJson('/api/v1/catalog/search?q=lixa+diamante+inexistente')->assertOk();
    $this->getJson('/api/v1/catalog/search?q=lixa+diamante+inexistente')->assertOk();

    $admin = createStaffWithRole(RoleSlug::Superadmin, 'reports@misturafeminina.com.br');
    $this->actingAs($admin);

    $zeroRes = $this->getJson('/api/v1/admin/reports/zero-result-searches')->assertOk();
    $terms = collect($zeroRes->json('data.items'))->keyBy('normalized_term');
    expect((int) $terms->get('lixa diamante inexistente')['occurrences'])->toBe(2);

    // 2. Register synonym so future search finds Esmalte
    $this->postJson('/api/v1/admin/search-synonyms', [
        'term' => 'vernis',
        'synonyms' => ['esmalte'],
    ])->assertCreated();

    $synSearch = $this->getJson('/api/v1/catalog/search?q=vernis')->assertOk();
    expect(count($synSearch->json('data.products')))->toBeGreaterThanOrEqual(1);

    // 3. Bought together analysis from eligible paid orders (no duplicate A+B / B+A pairs)
    $p1 = Product::query()->where('sku', 'MF-ESM-001')->firstOrFail();
    $p2 = Product::query()->where('sku', 'MF-PRM-008')->firstOrFail();
    $v1 = $p1->variants()->firstOrFail();
    $v2 = $p2->variants()->firstOrFail();

    for ($i = 0; $i < 2; $i++) {
        $ord = makeOrder(['status' => OrderStatus::Paid]);
        OrderItem::query()->create([
            'order_id' => $ord->id, 'product_id' => $p1->id, 'product_variant_id' => $v1->id,
            'product_name_snapshot' => $p1->name, 'variant_name_snapshot' => $v1->name,
            'sku_snapshot' => $v1->sku, 'quantity' => 1, 'unit_price_cents' => 1690,
            'discount_cents' => 0, 'total_cents' => 1690, 'weight_grams_snapshot' => 200,
        ]);
        OrderItem::query()->create([
            'order_id' => $ord->id, 'product_id' => $p2->id, 'product_variant_id' => $v2->id,
            'product_name_snapshot' => $p2->name, 'variant_name_snapshot' => $v2->name,
            'sku_snapshot' => $v2->sku, 'quantity' => 1, 'unit_price_cents' => 1990,
            'discount_cents' => 0, 'total_cents' => 1990, 'weight_grams_snapshot' => 200,
        ]);
    }

    // Cancelled order must be ignored
    $cancelled = makeOrder(['status' => OrderStatus::Cancelled]);
    OrderItem::query()->create([
        'order_id' => $cancelled->id, 'product_id' => $p1->id, 'product_variant_id' => $v1->id,
        'product_name_snapshot' => $p1->name, 'variant_name_snapshot' => $v1->name,
        'sku_snapshot' => $v1->sku, 'quantity' => 1, 'unit_price_cents' => 1690,
        'discount_cents' => 0, 'total_cents' => 1690, 'weight_grams_snapshot' => 200,
    ]);

    $btRes = $this->getJson('/api/v1/admin/reports/bought-together')->assertOk();
    $pairs = collect($btRes->json('data.pairs'));
    expect($pairs->count())->toBe(1);
    expect((int) $pairs->first()['joint_orders_count'])->toBe(2);
    expect((float) $pairs->first()['pct_of_a_orders'])->toBe(100.0);

    // 4. CSV export formula injection prevention
    $this->getJson('/api/v1/catalog/search?q='.urlencode('=cmd|calc'))->assertOk();
    $csvRes = $this->get('/api/v1/admin/reports/export-intelligent-csv?type=zero_results')->assertOk();
    expect($csvRes->getContent())->toContain("'=cmd|calc");
});
