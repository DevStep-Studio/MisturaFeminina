<?php

declare(strict_types=1);

use App\Domain\Shared\Enums\ProductType;
use App\Domain\Shared\Enums\RoleSlug;
use App\Models\AuditLog;
use App\Models\Brand;
use App\Models\BulkEditBatch;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
});

function createRedesignStaff(RoleSlug $slug, string $email): User
{
    $user = User::factory()->create([
        'name' => 'Equipe '.$slug->value,
        'email' => $email,
        'is_active' => true,
    ]);
    $role = Role::query()->where('slug', $slug->value)->firstOrFail();
    $user->roles()->sync([$role->id]);

    return $user;
}

function createSimpleCatalogItem(string $sku, string $name, int $priceCents, int $stockQty, ?Brand $brand = null): Product
{
    $product = Product::query()->create([
        'brand_id' => $brand?->id,
        'name' => $name,
        'slug' => Str::slug($name.'-'.$sku),
        'sku' => $sku,
        'product_type' => ProductType::Simple,
        'price_cents' => $priceCents,
        'promo_price_cents' => null,
        'weight_grams' => 150,
        'is_active' => true,
    ]);

    ProductVariant::query()->create([
        'product_id' => $product->id,
        'sku' => $sku,
        'name' => 'Padrão',
        'price_cents' => $priceCents,
        'stock_qty' => $stockQty,
        'reserved_qty' => 0,
        'is_default' => true,
        'is_active' => true,
    ]);

    return $product->fresh(['variants']);
}

test('CENARIO 1 - Selecionar itens entre paginas e todos os resultados, aplicar +10% e refletir na vitrine apenas nos selecionados', function (): void {
    $catalog = createRedesignStaff(RoleSlug::Catalog, 'cat1@misturafeminina.com.br');
    $this->actingAs($catalog);

    $brandA = Brand::query()->create(['name' => 'Marca Reajuste A', 'slug' => 'marca-reajuste-a', 'is_active' => true]);
    $brandB = Brand::query()->create(['name' => 'Marca Controle B', 'slug' => 'marca-controle-b', 'is_active' => true]);

    $target1 = createSimpleCatalogItem('RED-A-01', 'Gel Base Marca A 01', 2000, 10, $brandA);
    $target2 = createSimpleCatalogItem('RED-A-02', 'Gel Base Marca A 02', 3000, 10, $brandA);
    $untouched = createSimpleCatalogItem('RED-B-01', 'Top Coat Marca B', 5000, 10, $brandB);

    // Filtered listing finds Marca A
    $list = $this->getJson("/api/v1/admin/products?brand_id={$brandA->id}")->assertOk();
    expect((int) $list->json('total'))->toBe(2);

    // Server-side "select_all_matching" with Marca A filter + +10% rule
    $preview = $this->postJson('/api/v1/admin/products/bulk-rules/preview', [
        'selection' => [
            'select_all_matching' => true,
            'filters' => ['brand_id' => (string) $brandA->id],
        ],
        'rules' => [
            'price_op' => 'adjust_percent',
            'percent' => 10,
        ],
    ])->assertOk()->json('data');

    expect((int) $preview['summary']['total_products'])->toBe(2);

    $this->postJson('/api/v1/admin/products/bulk-rules/commit', [
        'selection' => [
            'select_all_matching' => true,
            'filters' => ['brand_id' => (string) $brandA->id],
        ],
        'rules' => [
            'price_op' => 'adjust_percent',
            'percent' => 10,
        ],
        'idempotency_key' => 'cen1-reajuste-10',
        'preview_snapshot' => $preview['preview_snapshot'],
    ])->assertOk();

    // Check DB + storefront endpoint directly
    expect(Product::query()->find($target1->id)?->price_cents)->toBe(2200);
    expect(Product::query()->find($target2->id)?->price_cents)->toBe(3300);
    expect(Product::query()->find($untouched->id)?->price_cents)->toBe(5000);

    $storeShowA = $this->getJson("/api/v1/catalog/products/{$target1->slug}")->assertOk()->json('data');
    $storeShowB = $this->getJson("/api/v1/catalog/products/{$untouched->slug}")->assertOk()->json('data');
    expect((int) $storeShowA['price_cents'])->toBe(2200);
    expect((int) $storeShowB['price_cents'])->toBe(5000);

    // Admin audit trail created
    expect(BulkEditBatch::query()->where('idempotency_key', 'cen1-reajuste-10')->exists())->toBeTrue();
    expect(AuditLog::query()->where('action', 'catalog.bulk_rule_committed')->exists())->toBeTrue();
});

test('CENARIO 2 - Colar planilha fora de ordem com 5 SKUs e 1 invalido, manter vazios intactos e aplicar apenas os 4 validos', function (): void {
    $catalog = createRedesignStaff(RoleSlug::Catalog, 'cat2@misturafeminina.com.br');
    $this->actingAs($catalog);

    $p1 = createSimpleCatalogItem('GRID-01', 'Cor 01', 1500, 10);
    $p2 = createSimpleCatalogItem('GRID-02', 'Cor 02', 1600, 12);
    $p3 = createSimpleCatalogItem('GRID-03', 'Cor 03', 1700, 14);
    $p4 = createSimpleCatalogItem('GRID-04', 'Cor 04', 1800, 16);

    $existingRows = collect([$p1, $p2, $p3, $p4])->values()->map(function (Product $p, int $idx): array {
        $v = $p->variants->first();

        return [
            'row_index' => $idx,
            'variant_id' => $v->id,
            'product_id' => $p->id,
            'name' => $v->name,
            'sku' => $v->sku,
            'price_cents' => $v->price_cents,
            'promo_price_cents' => $v->promo_price_cents,
            'stock_qty' => $v->stock_qty,
        ];
    })->all();

    // Pasted in reverse order; GRID-02 leaves price blank (must keep 1600); includes 1 unknown invalid SKU
    $rawPaste = implode("\n", [
        "SKU\tPreço\tEstoque",
        "GRID-04\t22,00\t20",
        "GRID-99\t25,00\t5",
        "GRID-02\t\t30",
        "GRID-03\t19,90\t18",
        "GRID-01\t18,00\t15",
    ]);

    $parsed = $this->postJson('/api/v1/admin/variants/bulk-parse', [
        'raw_text' => $rawPaste,
        'existing_rows' => $existingRows,
    ])->assertOk()->json('data');

    expect((int) $parsed['summary']['invalid_count'])->toBe(1);
    expect($parsed['summary']['unknown_skus'])->toContain('GRID-99');

    $grid2Preview = collect($parsed['rows'])->firstWhere('sku', 'GRID-02');
    expect((int) $grid2Preview['price_cents'])->toBe(1600);
    expect((int) $grid2Preview['stock_qty'])->toBe(30);

    // Partial commit: saves the 4 valid rows while returning GRID-99 as pending
    $commit = $this->postJson('/api/v1/admin/variants/bulk-commit', [
        'rows' => $parsed['rows'],
        'idempotency_key' => 'cen2-partial-paste',
        'source' => 'paste',
        'apply_valid_only' => true,
    ])->assertCreated()->json('data');

    expect((int) $commit['counts']['completed'])->toBe(4);
    expect((int) $commit['counts']['pending'])->toBe(1);
    expect($commit['pending_rows'][0]['sku'])->toBe('GRID-99');

    expect(ProductVariant::query()->where('sku', 'GRID-02')->first()?->price_cents)->toBe(1600);
    expect(ProductVariant::query()->where('sku', 'GRID-02')->first()?->stock_qty)->toBe(30);
    expect(ProductVariant::query()->where('sku', 'GRID-04')->first()?->price_cents)->toBe(2200);
});

test('CENARIO 3 - Concorrencia no estoque: detecta alteracao apos previa e retorna HTTP 409 com saldo atualizado', function (): void {
    $catalog = createRedesignStaff(RoleSlug::Catalog, 'cat3@misturafeminina.com.br');
    $this->actingAs($catalog);

    $prod = createSimpleCatalogItem('CONC-01', 'Produto Concorrencia', 2500, 10);
    $variant = $prod->variants->firstOrFail();

    // Operator A generates bulk rule preview expecting stock 10
    $preview = $this->postJson('/api/v1/admin/products/bulk-rules/preview', [
        'selection' => ['product_ids' => [$prod->id]],
        'rules' => [
            'stock_op' => 'set',
            'stock_qty' => 25,
            'stock_reason' => 'Contagem inventario',
        ],
    ])->assertOk()->json('data');

    // Concurrent movement changes stock from 10 to 14
    $this->postJson("/api/v1/admin/variants/{$variant->id}/stock", [
        'operation' => 'add',
        'quantity' => 4,
        'reason' => 'Recebimento simultaneo',
    ])->assertOk();

    expect($variant->fresh()->stock_qty)->toBe(14);

    // Operator A tries to commit with stale snapshot -> blocked with HTTP 409 & live balance 14
    $conflictResp = $this->postJson('/api/v1/admin/products/bulk-rules/commit', [
        'selection' => ['product_ids' => [$prod->id]],
        'rules' => [
            'stock_op' => 'set',
            'stock_qty' => 25,
            'stock_reason' => 'Contagem inventario',
        ],
        'idempotency_key' => 'cen3-conflict-key',
        'preview_snapshot' => $preview['preview_snapshot'],
    ])->assertStatus(409)->json();

    expect((int) $conflictResp['data']['conflicts'][0]['live_stock_qty'])->toBe(14);
    expect($variant->fresh()->stock_qty)->toBe(14);

    // Single quick stock adjustment also guards expected_stock_qty
    $this->postJson("/api/v1/admin/variants/{$variant->id}/stock", [
        'operation' => 'set',
        'quantity' => 18,
        'expected_stock_qty' => 10,
        'reason' => 'Tentativa com saldo antigo',
    ])->assertStatus(409)->assertJsonPath('conflict.current_stock_qty', 14);
});

test('CENARIO 4 - Exclusao em lote com item livre e item vinculado a pedido preserva historico e arquiva o vinculado', function (): void {
    $catalog = createRedesignStaff(RoleSlug::Catalog, 'cat4@misturafeminina.com.br');
    $this->actingAs($catalog);

    $freeProd = createSimpleCatalogItem('DEL-FREE-01', 'Produto Livre Sem Vinculo', 1990, 0);
    $linkedProd = createSimpleCatalogItem('DEL-LINK-01', 'Produto Com Pedido Historico', 3990, 5);
    $linkedVariant = $linkedProd->variants->firstOrFail();

    $order = Order::query()->create([
        'order_number' => 'MF-HIST-9901',
        'public_token' => Str::uuid()->toString(),
        'idempotency_key' => 'hist-order-'.Str::random(6),
        'is_guest' => true,
        'customer_name' => 'Cliente Historica',
        'customer_email' => 'hist@cliente.com.br',
        'customer_phone' => '11999990000',
        'shipping_address_snapshot' => ['cep' => '01001000', 'street' => 'Praça da Sé', 'number' => '10', 'neighborhood' => 'Sé', 'city' => 'São Paulo', 'state' => 'SP'],
        'shipping_service_snapshot' => ['carrier' => 'Correios', 'service_name' => 'PAC'],
        'subtotal_cents' => 3990,
        'discount_cents' => 0,
        'shipping_cents' => 0,
        'tax_cents' => 0,
        'total_cents' => 3990,
        'status' => 'delivered',
    ]);

    OrderItem::query()->create([
        'order_id' => $order->id,
        'product_id' => $linkedProd->id,
        'product_variant_id' => $linkedVariant->id,
        'sku_snapshot' => 'DEL-LINK-01',
        'product_name_snapshot' => 'Produto Com Pedido Historico',
        'variant_name_snapshot' => 'Padrão',
        'unit_price_cents' => 3990,
        'quantity' => 1,
        'total_cents' => 3990,
    ]);

    $preview = $this->postJson('/api/v1/admin/products/bulk-lifecycle/preview', [
        'selection' => ['product_ids' => [$freeProd->id, $linkedProd->id]],
        'action' => 'delete',
    ])->assertOk()->json('data');

    expect((int) $preview['deletable_count'])->toBe(1);
    expect((int) $preview['blocked_count'])->toBe(1);

    // Delete free, archive blocked
    $commit = $this->postJson('/api/v1/admin/products/bulk-lifecycle/commit', [
        'selection' => ['product_ids' => [$freeProd->id, $linkedProd->id]],
        'action' => 'delete',
        'idempotency_key' => 'cen4-del-mixed',
        'archive_blocked' => true,
    ])->assertOk()->json('data');

    expect((int) $commit['counts']['completed'])->toBe(2);
    expect(Product::withTrashed()->find($freeProd->id))->toBeNull();

    $archivedLinked = Product::withTrashed()->find($linkedProd->id);
    expect($archivedLinked)->not->toBeNull();
    expect($archivedLinked?->trashed())->toBeTrue();
    expect(OrderItem::query()->where('order_id', $order->id)->first()?->product_name_snapshot)->toBe('Produto Com Pedido Historico');
});

test('CENARIOS 5 e 6 - Importacao IA com 6 cores, preservacao de zeros à esquerda, foto de cabine sem watts e lista de custo fornecedor', function (): void {
    Storage::fake('public');
    $catalog = createRedesignStaff(RoleSlug::Catalog, 'cat56@misturafeminina.com.br');
    $this->actingAs($catalog);

    // Existing variant whose missing attributes must be preserved on update
    $existingProd = Product::query()->create([
        'name' => 'Coleção Lux Gel — 15 ml',
        'slug' => 'colecao-lux-gel-15-ml',
        'sku' => 'LUX-PARENT',
        'gtin' => '00789123456789',
        'product_type' => ProductType::Variable,
        'price_cents' => 2490,
        'weight_grams' => 180,
        'is_active' => true,
    ]);
    $existingVar = ProductVariant::query()->create([
        'product_id' => $existingProd->id,
        'sku' => 'LUX-COR-01',
        'name' => 'Nude Clássico Original',
        'shade_code' => '001',
        'color_family' => 'Nude',
        'price_cents' => 2490,
        'stock_qty' => 22,
        'is_default' => true,
        'is_active' => true,
    ]);

    // CSV with 6 colors: LUX-COR-01 already exists, LUX-COR-06 has missing price, GTIN has leading zeros
    $csvRows = implode("\n", [
        'Nome;Tonalidade;Sku;GTIN;Preco;Estoque',
        'Coleção Lux Gel;Padrão;LUX-COR-01;00789123456789;26,90;',
        'Coleção Lux Gel;Cor 02;LUX-COR-02;00789123456790;24,90;10',
        'Coleção Lux Gel;Cor 03;LUX-COR-03;00789123456791;24,90;10',
        'Coleção Lux Gel;Cor 04;LUX-COR-04;00789123456792;24,90;10',
        'Coleção Lux Gel;Cor 05;LUX-COR-05;00789123456793;24,90;10',
        'Coleção Lux Gel;Cor 06;LUX-COR-06;00789123456794;;10',
    ]);

    $import = $this->postJson('/api/v1/admin/ai/catalog/imports', [
        'raw_text' => $csvRows,
    ])->assertCreated()->json('data');

    expect((int) $import['grouped_variants_count'])->toBe(6);
    expect((int) $import['update_count'])->toBe(1);

    // Leading zeros preserved as string
    $row2 = collect($import['items'])->firstWhere('sku', 'LUX-COR-02');
    expect($row2['gtin'])->toBe('00789123456790');

    // Fill missing price on LUX-COR-06
    $row6 = collect($import['items'])->firstWhere('sku', 'LUX-COR-06');
    expect((int) $row6['proposed_data']['price_cents'])->toBe(0);
    $this->patchJson("/api/v1/admin/ai/catalog/imports/{$import['id']}/items/{$row6['id']}", [
        'price_cents' => 2490,
    ])->assertOk();

    $commit = $this->postJson("/api/v1/admin/ai/catalog/imports/{$import['id']}/approve", [
        'idempotency_key' => 'cen5-ai-commit',
    ])->assertOk()->json('data');

    expect((int) $commit['created_variants'])->toBe(5);
    expect((int) $commit['updated_variants'])->toBe(1);

    // Absent stock_qty in LUX-COR-01 source preserved existing 22 un.; absent variant_name kept 'Nude Clássico Original'
    $reloadedExisting = $existingVar->fresh();
    expect($reloadedExisting->stock_qty)->toBe(22);
    expect($reloadedExisting->name)->toBe('Nude Clássico Original');
    expect($reloadedExisting->price_cents)->toBe(2690);

    // Scenario 6A: Photo upload of Cabine without legible watts leaves power_watts pending & invalid
    $cabineImg = UploadedFile::fake()->image('cabine-uv-sem-watts.png', 400, 400);
    $photoImport = $this->post('/api/v1/admin/ai/catalog/imports', [
        'files' => [$cabineImg],
    ], ['Accept' => 'application/json'])->assertCreated()->json('data');

    $photoItem = $photoImport['items'][0];
    expect($photoItem['proposed_data']['is_equipment'])->toBeTrue();
    expect($photoItem['proposed_data']['power_watts'])->toBeNull();
    expect($photoItem['source_evidence']['fields']['power_watts'])->toBe('missing_illegible');
    expect($photoItem['source_evidence']['image_url'])->toStartWith('/storage/ai-imports/');

    // Scenario 6B: Supplier cost list with "Gel 15 g" does NOT set shipping weight to 15g and requires retail price
    $supplierCostImport = $this->postJson('/api/v1/admin/ai/catalog/imports', [
        'raw_text' => "Tabela de custo fornecedor:\n- Gel Hard Construtor 15 g - R$ 12,50\n- Top Coat Blindado 10 ml - R$ 9,90",
    ])->assertCreated()->json('data');

    $gelItem = $supplierCostImport['items'][0];
    expect($gelItem['proposed_data']['volume'])->toBe('15 g');
    expect($gelItem['proposed_data']['shipping_weight_grams'])->toBeNull();
    expect((int) $gelItem['proposed_data']['cost_price_cents'])->toBe(1250);
    expect((int) $gelItem['proposed_data']['price_cents'])->toBe(0);
});

test('CENARIO 7 - Idempotencia em repeticoes e controle estrito de permissoes RBAC', function (): void {
    $catalog = createRedesignStaff(RoleSlug::Catalog, 'cat7@misturafeminina.com.br');
    $support = createRedesignStaff(RoleSlug::Support, 'sup7@misturafeminina.com.br');

    $prod = createSimpleCatalogItem('IDEM-01', 'Produto Idempotente', 1000, 10);

    // Support user lacks catalog permissions -> 403
    $this->actingAs($support);
    $this->postJson('/api/v1/admin/products/bulk-rules/commit', [
        'selection' => ['product_ids' => [$prod->id]],
        'rules' => ['price_op' => 'adjust_percent', 'percent' => 10],
        'idempotency_key' => 'forb-1',
    ])->assertForbidden();

    // Retry with same idempotency_key after +10% applied does NOT apply +10% a second time
    $this->actingAs($catalog);
    $this->postJson('/api/v1/admin/products/bulk-rules/commit', [
        'selection' => ['product_ids' => [$prod->id]],
        'rules' => ['price_op' => 'adjust_percent', 'percent' => 10],
        'idempotency_key' => 'cen7-no-double-apply',
    ])->assertOk();

    $replay = $this->postJson('/api/v1/admin/products/bulk-rules/commit', [
        'selection' => ['product_ids' => [$prod->id]],
        'rules' => ['price_op' => 'adjust_percent', 'percent' => 10],
        'idempotency_key' => 'cen7-no-double-apply',
    ])->assertOk()->json('data');

    expect($replay['idempotent_replay'])->toBeTrue();
    expect(Product::query()->find($prod->id)?->price_cents)->toBe(1100);
});

test('exclusao de marca desvincula produtos com seguranca e remove o registro', function (): void {
    $catalog = createRedesignStaff(RoleSlug::Catalog, 'cat_brand_del@misturafeminina.com.br');
    $brand = Brand::query()->create([
        'name' => 'Marca Descartavel Teste',
        'slug' => 'marca-descartavel-teste',
        'is_active' => true,
    ]);

    $prod1 = createSimpleCatalogItem('BRD-DEL-01', 'Produto Marca 1', 1500, 5, $brand);
    $prod2 = createSimpleCatalogItem('BRD-DEL-02', 'Produto Marca 2', 2500, 3, $brand);

    expect(Product::query()->where('brand_id', $brand->id)->count())->toBe(2);

    $this->actingAs($catalog)
        ->deleteJson("/api/v1/admin/brands/{$brand->id}")
        ->assertOk()
        ->assertJsonPath('data.unlinked_products_count', 2);

    expect(Brand::query()->find($brand->id))->toBeNull();
    expect(Product::query()->find($prod1->id)?->brand_id)->toBeNull();
    expect(Product::query()->find($prod2->id)?->brand_id)->toBeNull();
});
