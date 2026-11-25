<?php

declare(strict_types=1);

use App\Domain\Shared\Enums\ProductType;
use App\Domain\Shared\Enums\RoleSlug;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Database\Seeders\OfficialCategoriesSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
});

function createCategoryStaff(string $email = 'cat-admin@misturafeminina.com.br'): User
{
    $user = User::factory()->create([
        'name' => 'Catalog Admin',
        'email' => $email,
        'is_active' => true,
    ]);
    $role = Role::query()->where('slug', RoleSlug::Catalog->value)->firstOrFail();
    $user->roles()->sync([$role->id]);

    return $user;
}

function createRealXlsxTempFile(array $rows): string
{
    $tmp = tempnam(sys_get_temp_dir(), 'mf-xlsx-').'.xlsx';
    $zip = new ZipArchive;
    $zip->open($tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE);

    $sharedStrings = [];
    $sharedIndex = [];
    $registerString = static function (string $value) use (&$sharedStrings, &$sharedIndex): int {
        if (! array_key_exists($value, $sharedIndex)) {
            $sharedIndex[$value] = count($sharedStrings);
            $sharedStrings[] = $value;
        }

        return $sharedIndex[$value];
    };

    $sheetRowsXml = '';
    foreach ($rows as $rIdx => $cols) {
        $rowNum = $rIdx + 1;
        $sheetRowsXml .= "<row r=\"{$rowNum}\">";
        foreach (array_values($cols) as $cIdx => $val) {
            $colLetter = chr(ord('A') + $cIdx);
            $cellRef = "{$colLetter}{$rowNum}";
            if (is_int($val) || is_float($val)) {
                $sheetRowsXml .= "<c r=\"{$cellRef}\"><v>{$val}</v></c>";
            } else {
                $sIdx = $registerString((string) $val);
                $sheetRowsXml .= "<c r=\"{$cellRef}\" t=\"s\"><v>{$sIdx}</v></c>";
            }
        }
        $sheetRowsXml .= '</row>';
    }

    $ssXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="'.count($sharedStrings).'" uniqueCount="'.count($sharedStrings).'">';
    foreach ($sharedStrings as $str) {
        $escaped = htmlspecialchars($str, ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $ssXml .= "<si><t>{$escaped}</t></si>";
    }
    $ssXml .= '</sst>';

    $zip->addFromString('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        .'<Default Extension="xml" ContentType="application/xml"/>'
        .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        .'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        .'<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
        .'</Types>');

    $zip->addFromString('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        .'</Relationships>');

    $zip->addFromString('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        .'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
        .'</Relationships>');

    $zip->addFromString('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        .'<sheets><sheet name="Produtos" sheetId="1" r:id="rId1"/></sheets>'
        .'</workbook>');

    $zip->addFromString('xl/sharedStrings.xml', $ssXml);
    $zip->addFromString('xl/worksheets/sheet1.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        .'<sheetData>'.$sheetRowsXml.'</sheetData>'
        .'</worksheet>');

    $zip->close();

    return $tmp;
}

test('seeder oficial cadastra todas as 101 categorias em 3 niveis respeitando ordem da Jack Cosmeticos e preservando edicoes admin na reexecucao', function (): void {
    Category::query()->delete();

    $this->seed(OfficialCategoriesSeeder::class);

    expect(Category::query()->count())->toBe(101);

    $roots = Category::query()->whereNull('parent_id')->orderBy('sort_order')->pluck('name')->all();
    expect($roots)->toBe([
        'Acessórios',
        'Alongamento Unhas',
        'Cuidados Unhas',
        'Decoração',
        'Esmalte',
        'Esmalte em Gel',
        'Kits',
        'Maquinários',
        'Cílios e Sobrancelhas',
        'Depilação',
        'Descartáveis',
        'Higiene e Esterilização',
    ]);

    $alongamento = Category::query()->whereNull('parent_id')->where('name', 'Alongamento Unhas')->firstOrFail();
    $alongamentoChildren = Category::query()->where('parent_id', $alongamento->id)->orderBy('sort_order')->pluck('name')->all();
    expect($alongamentoChildren)->toContain('Magic Remover', 'Soft Gel', 'Base Coat');
    expect(array_slice($alongamentoChildren, -3))->toBe([
        'Magic Remover',
        'Soft Gel',
        'Base Coat',
    ]);

    $acessorios = Category::query()->whereNull('parent_id')->where('name', 'Acessórios')->firstOrFail();
    $brocas = Category::query()->where('parent_id', $acessorios->id)->where('name', 'Brocas')->firstOrFail();
    $brocaChildren = Category::query()->where('parent_id', $brocas->id)->orderBy('sort_order')->pluck('name')->all();
    expect($brocaChildren)->toBe([
        'Broca de Cerâmica',
        'Brocas Diamantadas',
        'Brocas Tungstênio',
        'Refil para lixadeiras',
        'Broca de Limpeza',
    ]);

    $cuidadosCuticulas = Category::query()->where('name', 'Cuidados Unhas e Cutículas')->firstOrFail();
    expect(Category::query()->where('parent_id', $cuidadosCuticulas->id)->pluck('name')->all())->toBe([
        'Óleo para Cutículas',
    ]);

    // Shared leaf names under different parents exist cleanly without colliding
    $kits = Category::query()->whereNull('parent_id')->where('name', 'Kits')->firstOrFail();
    $kitsEsmalte = Category::query()->where('parent_id', $kits->id)->where('name', 'Esmalte')->firstOrFail();
    $rootEsmalte = Category::query()->whereNull('parent_id')->where('name', 'Esmalte')->firstOrFail();
    expect($kitsEsmalte->id)->not->toBe($rootEsmalte->id);

    // Customize a category like an admin and re-run seeder via artisan command
    $brocas->update([
        'description' => 'Descrição customizada pelo admin',
        'seo_title' => 'Brocas Profissionais | Mistura Feminina',
    ]);

    $this->artisan('catalog:seed-categories')->assertExitCode(0);

    expect(Category::query()->count())->toBe(101);
    expect($brocas->fresh()->description)->toBe('Descrição customizada pelo admin');
    expect($brocas->fresh()->seo_title)->toBe('Brocas Profissionais | Mistura Feminina');

    // Admin endpoint triggers backup + idempotent sync without duplicating
    $staff = createCategoryStaff('seed-staff@misturafeminina.com.br');
    $this->actingAs($staff);
    $syncRes = $this->postJson('/api/v1/admin/categories/seed-official')
        ->assertOk()
        ->json('data');
    expect($syncRes['created'])->toBe(0);
    expect($syncRes['reused'])->toBe(101);
    expect($syncRes['backup_output'])->toContain('Backup criado em:');
});

test('seeder oficial reconcilia categorias divergentes de producao corrigindo slugs, parent_id e redirecionamentos 301 sem perder IDs ou produtos vinculados', function (): void {
    Category::query()->delete();

    $acessoriosLegacy = Category::query()->create([
        'parent_id' => null,
        'name' => 'Acessórios',
        'slug' => 'unhas-e-esmalteria',
        'sort_order' => 1,
        'show_in_menu' => true,
        'is_active' => true,
    ]);
    $alicatesLegacy = Category::query()->create([
        'parent_id' => $acessoriosLegacy->id,
        'name' => 'Alicates e Cortadores',
        'slug' => 'esmaltes-em-gel',
        'sort_order' => 1,
        'show_in_menu' => true,
        'is_active' => true,
    ]);
    $topCoatMisplaced = Category::query()->create([
        'parent_id' => $acessoriosLegacy->id,
        'name' => 'Top Coat',
        'slug' => 'top-coat',
        'sort_order' => 5,
        'show_in_menu' => true,
        'is_active' => true,
    ]);
    $kitsMisplaced = Category::query()->create([
        'parent_id' => $acessoriosLegacy->id,
        'name' => 'Kits',
        'slug' => 'kits',
        'sort_order' => 6,
        'show_in_menu' => true,
        'is_active' => true,
    ]);
    $gelMisplaced = Category::query()->create([
        'parent_id' => $acessoriosLegacy->id,
        'name' => 'Gel',
        'slug' => 'gel',
        'sort_order' => 7,
        'show_in_menu' => true,
        'is_active' => true,
    ]);
    $maquiagemEmpty = Category::query()->create([
        'parent_id' => null,
        'name' => 'Maquiagem',
        'slug' => 'maquiagem',
        'sort_order' => 2,
        'show_in_menu' => true,
        'is_active' => true,
    ]);
    $acessoriosProLegacy = Category::query()->create([
        'parent_id' => null,
        'name' => 'Acessórios Profissionais',
        'slug' => 'acessorios-pro',
        'sort_order' => 6,
        'show_in_menu' => true,
        'is_active' => true,
    ]);
    $brocasMisplaced = Category::query()->create([
        'parent_id' => $acessoriosProLegacy->id,
        'name' => 'Brocas',
        'slug' => 'brocas',
        'sort_order' => 4,
        'show_in_menu' => true,
        'is_active' => true,
    ]);
    $cabinesLegacy = Category::query()->create([
        'parent_id' => $acessoriosProLegacy->id,
        'name' => 'Cabines',
        'slug' => 'cabines',
        'sort_order' => 5,
        'show_in_menu' => true,
        'is_active' => true,
    ]);

    $prodGel = Product::query()->create([
        'name' => 'Gel Construtor Nude',
        'slug' => 'gel-construtor-nude-rec',
        'sku' => 'REC-GEL-01',
        'product_type' => ProductType::Simple,
        'price_cents' => 3990,
        'weight_grams' => 80,
        'is_active' => false,
    ]);
    $prodGel->categories()->sync([
        $acessoriosLegacy->id => ['is_primary' => false],
        $alicatesLegacy->id => ['is_primary' => false],
        $gelMisplaced->id => ['is_primary' => true],
    ]);

    $stats = (new OfficialCategoriesSeeder)->seedOfficialCategories();
    expect($stats['total_official'])->toBe(101);
    expect($stats['reused'])->toBe(8);
    expect($stats['created'])->toBe(93);

    // IDs and product links preserved
    expect($acessoriosLegacy->fresh()->slug)->toBe('acessorios');
    expect($alicatesLegacy->fresh()->slug)->toBe('alicates-e-cortadores');
    expect($brocasMisplaced->fresh()->parent_id)->toBe($acessoriosLegacy->id);
    expect(Category::query()->where('parent_id', $brocasMisplaced->id)->count())->toBe(5);

    $alongamento = Category::query()->whereNull('parent_id')->where('slug', 'alongamento-unhas')->firstOrFail();
    expect($gelMisplaced->fresh()->parent_id)->toBe($alongamento->id);
    expect($topCoatMisplaced->fresh()->parent_id)->toBe($alongamento->id);
    expect($kitsMisplaced->fresh()->parent_id)->toBeNull();

    expect($acessoriosProLegacy->fresh()->name)->toBe('Maquinários');
    expect($acessoriosProLegacy->fresh()->slug)->toBe('maquinarios');
    expect($cabinesLegacy->fresh()->name)->toBe('Cabines e Estufas');
    expect($cabinesLegacy->fresh()->slug)->toBe('cabines-e-estufas');
    expect($cabinesLegacy->fresh()->parent_id)->toBe($acessoriosProLegacy->id);

    // Freed slug esmalte-em-gel assigned cleanly to official Esmalte em Gel
    $esmalteEmGel = Category::query()->whereNull('parent_id')->where('name', 'Esmalte em Gel')->firstOrFail();
    expect($esmalteEmGel->slug)->toBe('esmalte-em-gel');

    // Product links intact
    expect($prodGel->fresh('categories')->categories->pluck('id')->all())
        ->toContain($acessoriosLegacy->id, $alicatesLegacy->id, $gelMisplaced->id);

    // 301 SlugRedirect works for old divergent URLs
    $this->getJson('/api/v1/catalog/categories/unhas-e-esmalteria')
        ->assertStatus(301)
        ->assertJsonPath('redirect_to', '/categoria/acessorios');

    // Unused empty demo category deactivated without deleting ID
    expect($maquiagemEmpty->fresh())->not->toBeNull();
    expect($maquiagemEmpty->fresh()->is_active)->toBeFalse();

    // Second run creates zero duplicates
    $second = (new OfficialCategoriesSeeder)->seedOfficialCategories();
    expect($second['created'])->toBe(0);
    expect($second['reused'])->toBe(101);
});

test('admin CRUD protege contra duplicata no mesmo nivel, ciclos hierarquicos e exclusao com transferencia segura', function (): void {
    $staff = createCategoryStaff();
    $this->actingAs($staff);

    // Create 3-level hierarchy
    $root = $this->postJson('/api/v1/admin/categories', [
        'name' => 'Departamento Teste',
        'is_active' => true,
        'show_in_menu' => true,
    ])->assertCreated()->json('data');

    $child = $this->postJson('/api/v1/admin/categories', [
        'name' => 'Sub Teste',
        'parent_id' => $root['id'],
    ])->assertCreated()->json('data');

    $grandChild = $this->postJson('/api/v1/admin/categories', [
        'name' => 'Nivel Tres Teste',
        'parent_id' => $child['id'],
    ])->assertCreated()->json('data');

    // Prevent sibling duplicate (case & accent insensitive)
    $this->postJson('/api/v1/admin/categories', [
        'name' => 'nível três teste',
        'parent_id' => $child['id'],
    ])->assertStatus(422);

    // Prevent circular reference (moving root under its grandchild)
    $this->putJson("/api/v1/admin/categories/{$root['id']}", [
        'name' => 'Departamento Teste',
        'parent_id' => $grandChild['id'],
    ])->assertStatus(422);

    // Link a product to grandchild & verify dependencies block raw delete
    $product = Product::query()->create([
        'name' => 'Produto Broca Teste',
        'slug' => 'produto-broca-teste',
        'sku' => 'CAT-TEST-01',
        'product_type' => ProductType::Simple,
        'price_cents' => 2990,
        'weight_grams' => 100,
        'is_active' => true,
    ]);
    $product->categories()->sync([$grandChild['id'] => ['is_primary' => true]]);

    $deps = $this->getJson("/api/v1/admin/categories/{$grandChild['id']}/dependencies")
        ->assertOk()
        ->json('data');
    expect($deps['direct_products_count'])->toBe(1);
    expect($deps['can_delete_directly'])->toBeFalse();

    $this->deleteJson("/api/v1/admin/categories/{$grandChild['id']}", [
        'strategy' => 'block',
    ])->assertStatus(422);

    // Transfer product to root when deleting grandchild
    $this->deleteJson("/api/v1/admin/categories/{$grandChild['id']}", [
        'strategy' => 'transfer',
        'transfer_category_id' => $root['id'],
    ])->assertOk();

    expect(Category::query()->find($grandChild['id']))->toBeNull();
    expect($product->fresh('categories')->categories->pluck('id')->all())->toContain($root['id']);
});

test('vitrine inclui produtos de categorias filhas e netas sem duplicar, retorna ancestors no breadcrumb e respeita inativas e sitemap', function (): void {
    Category::query()->delete();
    $this->seed(OfficialCategoriesSeeder::class);

    $acessorios = Category::query()->whereNull('parent_id')->where('name', 'Acessórios')->firstOrFail();
    $brocas = Category::query()->where('parent_id', $acessorios->id)->where('name', 'Brocas')->firstOrFail();
    $diamantadas = Category::query()->where('parent_id', $brocas->id)->where('name', 'Brocas Diamantadas')->firstOrFail();
    $ceramica = Category::query()->where('parent_id', $brocas->id)->where('name', 'Broca de Cerâmica')->firstOrFail();
    $inativa = Category::query()->whereNull('parent_id')->where('name', 'Depilação')->firstOrFail();
    $inativa->update(['is_active' => false]);

    $prodLevel3 = Product::query()->create([
        'name' => 'Broca Diamantada Fina PM718',
        'slug' => 'broca-diamantada-pm718',
        'sku' => 'BRC-718',
        'product_type' => ProductType::Simple,
        'price_cents' => 1890,
        'weight_grams' => 50,
        'is_active' => true,
    ]);
    ProductVariant::query()->create([
        'product_id' => $prodLevel3->id,
        'sku' => 'BRC-718',
        'name' => 'Padrão',
        'price_cents' => 1890,
        'stock_qty' => 12,
        'reserved_qty' => 0,
        'is_default' => true,
        'is_active' => true,
    ]);
    // Link both grandchild and child to confirm zero duplicate listing on parent
    $prodLevel3->categories()->sync([
        $diamantadas->id => ['is_primary' => true],
        $brocas->id => ['is_primary' => false],
    ]);

    $prodLevel2 = Product::query()->create([
        'name' => 'Broca Cerâmica Cilíndrica',
        'slug' => 'broca-ceramica-cilindrica',
        'sku' => 'BRC-CER-01',
        'product_type' => ProductType::Simple,
        'price_cents' => 3490,
        'weight_grams' => 60,
        'is_active' => true,
    ]);
    $prodLevel2->categories()->sync([$ceramica->id => ['is_primary' => true]]);

    $parentListing = $this->getJson("/api/v1/catalog/categories/{$acessorios->slug}")
        ->assertOk()
        ->json('data');

    $listedIds = array_column($parentListing['products'], 'id');
    expect($listedIds)->toContain($prodLevel3->id, $prodLevel2->id);
    expect(count(array_keys($listedIds, $prodLevel3->id)))->toBe(1);

    // Grandchild page returns complete 3-level ancestors array
    $grandListing = $this->getJson("/api/v1/catalog/categories/{$diamantadas->slug}")
        ->assertOk()
        ->json('data.category');
    expect(array_column($grandListing['ancestors'], 'name'))->toBe([
        'Acessórios',
        'Brocas',
        'Brocas Diamantadas',
    ]);

    // Product detail exposes category_ancestors
    $detail = $this->getJson("/api/v1/catalog/products/{$prodLevel3->slug}")
        ->assertOk()
        ->json('data');
    expect(array_column($detail['category_ancestors'], 'name'))->toBe([
        'Acessórios',
        'Brocas',
        'Brocas Diamantadas',
    ]);

    // Bootstrap & Sitemap exclude inactive category
    $bootstrap = $this->getJson('/api/v1/storefront/bootstrap')->assertOk()->json('data');
    expect(array_column($bootstrap['menu_categories'], 'name'))->not->toContain('Depilação');

    $sitemap = $this->get('/sitemap.xml')->assertOk()->getContent();
    expect($sitemap)->toContain("/categoria/{$diamantadas->slug}");
    expect($sitemap)->not->toContain("/categoria/{$inativa->slug}");
});

test('importacao de planilha xlsx e csv resolve caminhos hierarquicos, normaliza acentos, sugere correspondencias e preserva custo nulo', function (): void {
    Category::query()->delete();
    $this->seed(OfficialCategoriesSeeder::class);

    $staff = createCategoryStaff('imp-admin@misturafeminina.com.br');
    $this->actingAs($staff);

    $xlsxPath = createRealXlsxTempFile([
        ['Nome', 'Valor', 'Categoria', 'SKU'],
        ['Broca Diamantada Flame Gold', '24,90', 'acessorios > brocas > brocas diamantadas', 'IMP-XLSX-01'],
        ['Produto Categoria Inexistente', '15,00', 'Broca Inexistente', 'IMP-XLSX-02'],
    ]);

    try {
        $dryRun = $this->post('/api/v1/admin/catalog/import-csv', [
            'file' => new UploadedFile($xlsxPath, 'produtos.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true),
            'dry_run' => true,
        ])->assertOk()->json('data');

        expect($dryRun['dry_run'])->toBeTrue();
        expect($dryRun['preview'][0]['category_status'])->toBe('matched');
        expect($dryRun['preview'][0]['matched_categories'])->toBe(['Acessórios > Brocas > Brocas Diamantadas']);
        expect($dryRun['preview'][1]['category_status'])->toBe('unmatched');
        expect(count($dryRun['errors']))->toBeGreaterThan(0);

        // Confirm valid CSV commit works with hierarchical path and NEVER copies sale price to cost_cents
        $diamantadas = Category::query()->where('name', 'Brocas Diamantadas')->firstOrFail();
        $csv = "Nome;Valor;Categoria;SKU\nBroca Flame Validada;29,90;Acessórios > Brocas > Brocas Diamantadas;IMP-CSV-01\n";
        $commit = $this->postJson('/api/v1/admin/catalog/import-csv', [
            'csv_content' => $csv,
            'dry_run' => false,
        ])->assertOk()->json('data');

        expect($commit['created'])->toBe(1);
        $imported = Product::query()->where('sku', 'IMP-CSV-01')->firstOrFail();
        expect($imported->price_cents)->toBe(2990);
        expect($imported->cost_cents)->toBeNull();
        expect($imported->categories()->pluck('categories.id')->all())->toContain($diamantadas->id);

        // Confirm no duplicate categories were auto-created during import
        expect(Category::query()->count())->toBe(101);
    } finally {
        @unlink($xlsxPath);
    }
});
