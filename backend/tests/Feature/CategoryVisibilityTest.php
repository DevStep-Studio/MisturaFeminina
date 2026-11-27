<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Catalog\Services\CategoryHierarchyService;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\User;
use App\Domain\Security\Services\RbacSeederService;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    app(RbacSeederService::class)->syncRolesAndPermissions();
    app(CategoryHierarchyService::class)->clearCaches();
});

test('public menu and directory prune empty categories and subcategories', function (): void {
    $parentWithProducts = Category::query()->create([
        'name' => 'Unhas',
        'slug' => 'unhas',
        'is_active' => true,
        'show_in_menu' => true,
        'sort_order' => 1,
    ]);

    $childWithProduct = Category::query()->create([
        'parent_id' => $parentWithProducts->id,
        'name' => 'Esmaltes',
        'slug' => 'esmaltes',
        'is_active' => true,
        'show_in_menu' => true,
        'sort_order' => 1,
    ]);

    $childEmpty = Category::query()->create([
        'parent_id' => $parentWithProducts->id,
        'name' => 'Acessórios Infantis',
        'slug' => 'acessorios-infantis',
        'is_active' => true,
        'show_in_menu' => true,
        'sort_order' => 2,
    ]);

    $emptyParent = Category::query()->create([
        'name' => 'Cílios e Lash',
        'slug' => 'cilios-e-lash',
        'is_active' => true,
        'show_in_menu' => true,
        'sort_order' => 2,
    ]);

    $emptyChild = Category::query()->create([
        'parent_id' => $emptyParent->id,
        'name' => 'Lash Lifting',
        'slug' => 'lash-lifting-vazio',
        'is_active' => true,
        'show_in_menu' => true,
        'sort_order' => 1,
    ]);

    $brand = Brand::query()->create(['name' => 'Marca Teste', 'slug' => 'marca-teste', 'is_active' => true]);
    $product = Product::query()->create([
        'brand_id' => $brand->id,
        'name' => 'Esmalte em Gel Rosa',
        'slug' => 'esmalte-gel-rosa',
        'sku' => 'TEST-ESM-01',
        'price_cents' => 2500,
        'is_active' => true,
    ]);
    ProductVariant::query()->create([
        'product_id' => $product->id,
        'sku' => 'TEST-ESM-01-V1',
        'name' => 'Rosa',
        'price_cents' => 2500,
        'stock_qty' => 10,
        'is_active' => true,
        'is_default' => true,
    ]);
    $product->categories()->sync([$parentWithProducts->id, $childWithProduct->id]);

    app(CategoryHierarchyService::class)->clearCaches();

    // 1. Storefront bootstrap menu
    $bootstrap = $this->getJson('/api/v1/storefront/bootstrap')->assertOk()->json('data');
    $menuSlugs = array_column($bootstrap['menu_categories'], 'slug');

    expect($menuSlugs)->toContain('unhas')
        ->and($menuSlugs)->not->toContain('cilios-e-lash');

    $unhasMenuNode = collect($bootstrap['menu_categories'])->firstWhere('slug', 'unhas');
    $subSlugs = array_column($unhasMenuNode['children'], 'slug');
    expect($subSlugs)->toContain('esmaltes')
        ->and($subSlugs)->not->toContain('acessorios-infantis');

    // 2. Public categories directory
    $directory = $this->getJson('/api/v1/catalog/categories')->assertOk()->json('data');
    $dirSlugs = array_column($directory, 'slug');
    expect($dirSlugs)->toContain('unhas')
        ->and($dirSlugs)->not->toContain('cilios-e-lash');

    $unhasDirNode = collect($directory)->firstWhere('slug', 'unhas');
    $dirSubSlugs = array_column($unhasDirNode['children'], 'slug');
    expect($dirSubSlugs)->toContain('esmaltes')
        ->and($dirSubSlugs)->not->toContain('acessorios-infantis');

    // 3. Category show page lists only active subcategories with products
    $catShow = $this->getJson('/api/v1/catalog/categories/unhas')->assertOk()->json('data.category');
    $showSubSlugs = array_column($catShow['children'], 'slug');
    expect($showSubSlugs)->toContain('esmaltes')
        ->and($showSubSlugs)->not->toContain('acessorios-infantis');
});

test('parent category without direct products appears if it has subcategory with products', function (): void {
    $parent = Category::query()->create([
        'name' => 'Maquinários',
        'slug' => 'maquinarios',
        'is_active' => true,
        'show_in_menu' => true,
        'sort_order' => 1,
    ]);

    $child = Category::query()->create([
        'parent_id' => $parent->id,
        'name' => 'Cabines UV',
        'slug' => 'cabines-uv',
        'is_active' => true,
        'show_in_menu' => true,
        'sort_order' => 1,
    ]);

    $brand = Brand::query()->create(['name' => 'Marca Sun', 'slug' => 'marca-sun', 'is_active' => true]);
    $product = Product::query()->create([
        'brand_id' => $brand->id,
        'name' => 'Cabine Sun One 48W',
        'slug' => 'cabine-sun-one-48w',
        'sku' => 'TEST-CAB-01',
        'price_cents' => 8900,
        'is_active' => true,
    ]);
    ProductVariant::query()->create([
        'product_id' => $product->id,
        'sku' => 'TEST-CAB-01-V1',
        'name' => 'Padrão',
        'price_cents' => 8900,
        'stock_qty' => 5,
        'is_active' => true,
        'is_default' => true,
    ]);
    // Attached ONLY to child category, NOT to parent
    $product->categories()->sync([$child->id]);

    app(CategoryHierarchyService::class)->clearCaches();

    $bootstrap = $this->getJson('/api/v1/storefront/bootstrap')->assertOk()->json('data');
    $menuSlugs = array_column($bootstrap['menu_categories'], 'slug');
    expect($menuSlugs)->toContain('maquinarios');

    $node = collect($bootstrap['menu_categories'])->firstWhere('slug', 'maquinarios');
    expect($node['children'])->toHaveCount(1)
        ->and($node['children'][0]['slug'])->toBe('cabines-uv');
});

test('category with direct products and no subcategories appears with empty children list', function (): void {
    $cat = Category::query()->create([
        'name' => 'Promoções Relâmpago',
        'slug' => 'promocoes-relampago',
        'is_active' => true,
        'show_in_menu' => true,
        'sort_order' => 1,
    ]);

    $brand = Brand::query()->create(['name' => 'Marca Gen', 'slug' => 'marca-gen', 'is_active' => true]);
    $product = Product::query()->create([
        'brand_id' => $brand->id,
        'name' => 'Lixa Especial',
        'slug' => 'lixa-especial',
        'sku' => 'TEST-LIX-01',
        'price_cents' => 500,
        'is_active' => true,
    ]);
    ProductVariant::query()->create([
        'product_id' => $product->id,
        'sku' => 'TEST-LIX-01-V1',
        'name' => 'Unidade',
        'price_cents' => 500,
        'stock_qty' => 10,
        'is_active' => true,
        'is_default' => true,
    ]);
    $product->categories()->sync([$cat->id]);

    app(CategoryHierarchyService::class)->clearCaches();

    $bootstrap = $this->getJson('/api/v1/storefront/bootstrap')->assertOk()->json('data');
    $node = collect($bootstrap['menu_categories'])->firstWhere('slug', 'promocoes-relampago');
    expect($node)->not->toBeNull()
        ->and($node['children'])->toBe([]);
});

test('automatically reflects product creation and deactivation without manual intervention', function (): void {
    $cat = Category::query()->create([
        'name' => 'Linha Facial',
        'slug' => 'linha-facial',
        'is_active' => true,
        'show_in_menu' => true,
        'sort_order' => 1,
    ]);

    // Initial state: empty category is hidden
    $bootstrap1 = $this->getJson('/api/v1/storefront/bootstrap')->assertOk()->json('data');
    expect(array_column($bootstrap1['menu_categories'], 'slug'))->not->toContain('linha-facial');

    // Action 1: Add product to category
    $brand = Brand::query()->create(['name' => 'Marca Face', 'slug' => 'marca-face', 'is_active' => true]);
    $product = Product::query()->create([
        'brand_id' => $brand->id,
        'name' => 'Sérum Facial',
        'slug' => 'serum-facial',
        'sku' => 'TEST-FAC-01',
        'price_cents' => 4500,
        'is_active' => true,
    ]);
    ProductVariant::query()->create([
        'product_id' => $product->id,
        'sku' => 'TEST-FAC-01-V1',
        'name' => '30ml',
        'price_cents' => 4500,
        'stock_qty' => 8,
        'is_active' => true,
        'is_default' => true,
    ]);
    $product->categories()->sync([$cat->id]);

    // Automatically appears
    $bootstrap2 = $this->getJson('/api/v1/storefront/bootstrap')->assertOk()->json('data');
    expect(array_column($bootstrap2['menu_categories'], 'slug'))->toContain('linha-facial');

    // Action 2: Deactivate product
    $product->update(['is_active' => false]);

    // Automatically disappears
    $bootstrap3 = $this->getJson('/api/v1/storefront/bootstrap')->assertOk()->json('data');
    expect(array_column($bootstrap3['menu_categories'], 'slug'))->not->toContain('linha-facial');

    // Action 3: Reactivate product
    $product->update(['is_active' => true]);

    // Automatically reappears
    $bootstrap4 = $this->getJson('/api/v1/storefront/bootstrap')->assertOk()->json('data');
    expect(array_column($bootstrap4['menu_categories'], 'slug'))->toContain('linha-facial');

    // Action 4: Delete product (soft delete)
    $product->delete();

    // Automatically disappears
    $bootstrap5 = $this->getJson('/api/v1/storefront/bootstrap')->assertOk()->json('data');
    expect(array_column($bootstrap5['menu_categories'], 'slug'))->not->toContain('linha-facial');
});

test('manually deactivated category remains hidden even if it has active products', function (): void {
    $cat = Category::query()->create([
        'name' => 'Desativada Manualmente',
        'slug' => 'desativada-manualmente',
        'is_active' => false,
        'show_in_menu' => true,
        'sort_order' => 1,
    ]);

    $brand = Brand::query()->create(['name' => 'Marca X', 'slug' => 'marca-x', 'is_active' => true]);
    $product = Product::query()->create([
        'brand_id' => $brand->id,
        'name' => 'Produto Ativo',
        'slug' => 'produto-ativo',
        'sku' => 'TEST-ACT-01',
        'price_cents' => 1000,
        'is_active' => true,
    ]);
    $product->categories()->sync([$cat->id]);

    app(CategoryHierarchyService::class)->clearCaches();

    $bootstrap = $this->getJson('/api/v1/storefront/bootstrap')->assertOk()->json('data');
    expect(array_column($bootstrap['menu_categories'], 'slug'))->not->toContain('desativada-manualmente');

    $directory = $this->getJson('/api/v1/catalog/categories')->assertOk()->json('data');
    expect(array_column($directory, 'slug'))->not->toContain('desativada-manualmente');
});

test('out of stock product with is_active true keeps category visible following store rule', function (): void {
    $cat = Category::query()->create([
        'name' => 'Linha Sem Estoque',
        'slug' => 'linha-sem-estoque',
        'is_active' => true,
        'show_in_menu' => true,
        'sort_order' => 1,
    ]);

    $brand = Brand::query()->create(['name' => 'Marca OOS', 'slug' => 'marca-oos', 'is_active' => true]);
    $product = Product::query()->create([
        'brand_id' => $brand->id,
        'name' => 'Esmalte Esgotado',
        'slug' => 'esmalte-esgotado',
        'sku' => 'TEST-OOS-01',
        'price_cents' => 1500,
        'is_active' => true,
    ]);
    ProductVariant::query()->create([
        'product_id' => $product->id,
        'sku' => 'TEST-OOS-01-V1',
        'name' => 'Unidade',
        'price_cents' => 1500,
        'stock_qty' => 0,
        'reserved_qty' => 0,
        'is_active' => true,
        'is_default' => true,
    ]);
    $product->categories()->sync([$cat->id]);

    app(CategoryHierarchyService::class)->clearCaches();

    $bootstrap = $this->getJson('/api/v1/storefront/bootstrap')->assertOk()->json('data');
    expect(array_column($bootstrap['menu_categories'], 'slug'))->toContain('linha-sem-estoque');
});

test('admin category listing preserves all categories including empty ones', function (): void {
    $cat1 = Category::query()->create([
        'name' => 'Admin Vazia 1',
        'slug' => 'admin-vazia-1',
        'is_active' => true,
        'show_in_menu' => true,
    ]);
    $cat2 = Category::query()->create([
        'name' => 'Admin Vazia 2',
        'slug' => 'admin-vazia-2',
        'is_active' => false,
        'show_in_menu' => false,
    ]);

    $role = Role::query()->where('slug', 'superadmin')->firstOrFail();
    $adminUser = User::query()->create([
        'name' => 'Admin Teste',
        'email' => 'admin-cat-test@mistura.local',
        'password' => 'secret123',
        'is_active' => true,
    ]);
    $adminUser->roles()->sync([$role->id]);

    $res = $this->actingAs($adminUser)->getJson('/api/v1/admin/categories')->assertOk()->json('data');
    $slugs = array_column($res, 'slug');

    expect($slugs)->toContain('admin-vazia-1')
        ->and($slugs)->toContain('admin-vazia-2');

    $node1 = collect($res)->firstWhere('slug', 'admin-vazia-1');
    expect($node1['direct_products_count'])->toBe(0)
        ->and($node1['subtree_products_count'])->toBe(0);
});

test('empty category direct URL remains accessible returning 200 with empty products', function (): void {
    $emptyCat = Category::query()->create([
        'name' => 'Categoria Direta Vazia',
        'slug' => 'categoria-direta-vazia',
        'is_active' => true,
        'show_in_menu' => true,
    ]);

    $res = $this->getJson('/api/v1/catalog/categories/categoria-direta-vazia')
        ->assertOk()
        ->json('data');

    expect($res['category']['slug'])->toBe('categoria-direta-vazia')
        ->and($res['category']['children'])->toBe([])
        ->and($res['products'])->toBe([]);
});
