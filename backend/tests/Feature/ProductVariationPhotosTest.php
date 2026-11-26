<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Shared\Enums\RoleSlug;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
    Storage::fake('public');
});

function makeVariationAdminUser(): User
{
    $user = User::factory()->create([
        'name' => 'Admin Variações',
        'email' => 'admin.var.'.uniqid().'@misturafeminina.com.br',
        'is_active' => true,
    ]);
    $role = Role::query()->where('slug', RoleSlug::Admin->value)->firstOrFail();
    $user->roles()->sync([$role->id]);

    return $user;
}

test('media upload accepts PNG, JPG, WebP for catalog managers and rejects invalid types', function (): void {
    $catalogUser = makeVariationAdminUser();

    // 1. Valid PNG upload
    $pngFile = UploadedFile::fake()->image('variant-foto.png', 300, 300);
    $responsePng = $this->actingAs($catalogUser)
        ->postJson('/api/v1/admin/media/upload', [
            'file' => $pngFile,
            'folder' => 'products',
        ]);

    $responsePng->assertCreated();
    $pngPath = $responsePng->json('data.path');
    expect($pngPath)->toBeString()->toStartWith('/storage/products/');

    // 2. Valid JPG upload
    $jpgFile = UploadedFile::fake()->image('variant-foto.jpg', 300, 300);
    $responseJpg = $this->actingAs($catalogUser)
        ->postJson('/api/v1/admin/media/upload', [
            'file' => $jpgFile,
            'folder' => 'products',
        ]);

    $responseJpg->assertCreated();
    expect($responseJpg->json('data.path'))->toBeString()->toStartWith('/storage/products/');

    // 3. Valid WebP upload (generated with real GD image if available)
    if (function_exists('imagewebp')) {
        $tempWebp = tempnam(sys_get_temp_dir(), 'test_webp_');
        $img = imagecreatetruecolor(100, 100);
        imagewebp($img, $tempWebp);
        imagedestroy($img);

        $realWebpFile = new UploadedFile($tempWebp, 'variant-foto.webp', 'image/webp', null, true);
        $responseWebp = $this->actingAs($catalogUser)
            ->postJson('/api/v1/admin/media/upload', [
                'file' => $realWebpFile,
                'folder' => 'products',
            ]);

        $responseWebp->assertCreated();
        expect($responseWebp->json('data.path'))->toBeString()->toStartWith('/storage/products/');
        @unlink($tempWebp);
    }

    // 4. Invalid PDF file rejected with clear error message
    $invalidFile = UploadedFile::fake()->create('documento.pdf', 50, 'application/pdf');
    $responseInvalid = $this->actingAs($catalogUser)
        ->postJson('/api/v1/admin/media/upload', [
            'file' => $invalidFile,
            'folder' => 'products',
        ]);

    $responseInvalid->assertUnprocessable();
    $responseInvalid->assertJsonValidationErrors(['file']);
});

test('persists custom variation photos and handles fallback to primary image correctly', function (): void {
    $admin = makeVariationAdminUser();

    $brand = Brand::query()->create(['name' => 'Any Lovy', 'slug' => 'any-lovy-test', 'is_active' => true]);
    $cat = Category::query()->create(['name' => 'Géis', 'slug' => 'geis-test', 'is_active' => true]);

    $productPayload = [
        'name' => 'Gel Construtor Any Lovy Teste',
        'slug' => 'gel-construtor-any-lovy-teste',
        'sku' => 'GEL-ANY-TEST',
        'brand_id' => $brand->id,
        'primary_category_id' => $cat->id,
        'category_ids' => [$cat->id],
        'price_cents' => 4990,
        'weight_grams' => 100,
        'is_active' => true,
        'has_variants' => true,
        'product_type' => 'variable',
        'images' => [
            [
                'path' => '/storage/products/gel-principal.webp',
                'alt_text' => 'Gel Principal',
                'is_primary' => true,
            ],
        ],
        'variation_attributes' => [
            [
                'name' => 'Cor',
                'slug' => 'cor',
                'display_type' => 'color_swatch',
                'sort_order' => 1,
                'values' => [
                    ['value' => 'Natural', 'slug' => 'natural', 'color_hex' => '#e8c5b0'],
                    ['value' => 'Cover Nude', 'slug' => 'cover-nude', 'color_hex' => '#d49b7e'],
                    ['value' => 'Base', 'slug' => 'base', 'color_hex' => '#ffffff'],
                ],
            ],
        ],
        'variants' => [
            [
                'name' => 'Natural',
                'sku' => 'GEL-ANY-TEST-NAT',
                'price_cents' => 4990,
                'inherits_price' => true,
                'stock_qty' => 10,
                'image_path' => '/storage/products/gel-natural.webp',
                'inherits_image' => false,
                'is_default' => true,
                'is_active' => true,
                'option_values' => [
                    ['attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Natural', 'value_slug' => 'natural'],
                ],
            ],
            [
                'name' => 'Cover Nude',
                'sku' => 'GEL-ANY-TEST-COV',
                'price_cents' => 4990,
                'inherits_price' => true,
                'stock_qty' => 8,
                'image_path' => '/storage/products/gel-cover-nude.png',
                'inherits_image' => false,
                'is_default' => false,
                'is_active' => true,
                'option_values' => [
                    ['attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Cover Nude', 'value_slug' => 'cover-nude'],
                ],
            ],
            [
                'name' => 'Base',
                'sku' => 'GEL-ANY-TEST-BAS',
                'price_cents' => 4990,
                'inherits_price' => true,
                'stock_qty' => 5,
                'image_path' => null,
                'inherits_image' => true, // Herda a foto principal
                'is_default' => false,
                'is_active' => true,
                'option_values' => [
                    ['attribute_slug' => 'cor', 'attribute_name' => 'Cor', 'value' => 'Base', 'value_slug' => 'base'],
                ],
            ],
        ],
    ];

    // 1. Cadastra o produto no admin
    $createRes = $this->actingAs($admin)->postJson('/api/v1/admin/products', $productPayload);
    $createRes->assertCreated();
    $productId = (int) $createRes->json('data.id');

    // 2. Consulta no admin showProduct
    $showAdminRes = $this->actingAs($admin)->getJson("/api/v1/admin/products/{$productId}");
    $showAdminRes->assertOk();
    $adminVariants = collect($showAdminRes->json('data.variants'))->keyBy('name');

    expect($adminVariants['Natural']['image_path'])->toBe('/storage/products/gel-natural.webp');
    expect($adminVariants['Natural']['inherits_image'])->toBeFalsy();

    expect($adminVariants['Cover Nude']['image_path'])->toBe('/storage/products/gel-cover-nude.png');
    expect($adminVariants['Cover Nude']['inherits_image'])->toBeFalsy();

    expect($adminVariants['Base']['image_path'])->toBeNull();
    expect($adminVariants['Base']['inherits_image'])->toBeTruthy();

    // 3. Consulta na vitrine pública (Storefront API)
    $productSlug = (string) $createRes->json('data.slug');
    $storefrontRes = $this->getJson("/api/v1/catalog/products/{$productSlug}");
    $storefrontRes->assertOk();
    $sfVariants = collect($storefrontRes->json('data.variants'))->keyBy('name');

    expect($sfVariants['Natural']['image_path'])->toBe('/storage/products/gel-natural.webp');
    expect($sfVariants['Natural']['inherits_image'])->toBeFalse();

    expect($sfVariants['Cover Nude']['image_path'])->toBe('/storage/products/gel-cover-nude.png');
    expect($sfVariants['Cover Nude']['inherits_image'])->toBeFalse();

    expect($sfVariants['Base']['image_path'])->toBeNull();
    expect($sfVariants['Base']['inherits_image'])->toBeTrue();

    // 4. Atualiza o produto removendo a foto de "Natural" para voltar a herdar a principal
    $updatedPayload = $productPayload;
    $updatedPayload['variants'][0]['id'] = (int) $adminVariants['Natural']['id'];
    $updatedPayload['variants'][0]['image_path'] = null;
    $updatedPayload['variants'][0]['inherits_image'] = true;
    $updatedPayload['variants'][1]['id'] = (int) $adminVariants['Cover Nude']['id'];
    $updatedPayload['variants'][2]['id'] = (int) $adminVariants['Base']['id'];

    $updateRes = $this->actingAs($admin)->putJson("/api/v1/admin/products/{$productId}", $updatedPayload);
    $updateRes->assertOk();

    $reloadedRes = $this->actingAs($admin)->getJson("/api/v1/admin/products/{$productId}");
    $reloadedVariants = collect($reloadedRes->json('data.variants'))->keyBy('name');
    expect($reloadedVariants['Natural']['image_path'])->toBeNull();
    expect($reloadedVariants['Natural']['inherits_image'])->toBeTruthy();
});
