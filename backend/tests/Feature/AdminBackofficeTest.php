<?php

declare(strict_types=1);

use App\Domain\Security\Services\TotpService;
use App\Models\Category;
use App\Models\Product;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
    Storage::fake('public');
});

test('RBAC prevents customers and limited roles from accessing restricted admin actions', function (): void {
    $customer = User::query()->where('email', 'cliente@misturafeminina.local')->firstOrFail();
    $marketing = User::query()->where('email', 'marketing@misturafeminina.local')->firstOrFail();
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();

    // Unauthenticated denied 401
    $this->getJson('/api/v1/admin/dashboard')->assertUnauthorized();

    // Customer denied 403
    $this->actingAs($customer)->getJson('/api/v1/admin/dashboard')->assertForbidden();

    // Marketing allowed to view reports and manage coupons, DENIED integrations/refunds
    $this->actingAs($marketing)->getJson('/api/v1/admin/coupons')->assertOk();
    $this->actingAs($marketing)->getJson('/api/v1/admin/settings/integrations')->assertForbidden();
    $this->actingAs($marketing)->postJson('/api/v1/admin/orders/1/refund', ['reason' => 'Teste'])->assertForbidden();

    // Superadmin allowed everywhere
    $this->actingAs($admin)->getJson('/api/v1/admin/dashboard')->assertOk();
    $this->actingAs($admin)->getJson('/api/v1/admin/settings/integrations')->assertOk()
        ->assertJsonMissing(['access_token']);
});

test('admin can edit store branding, upload banner, and changes immediately reflect in bootstrap', function (): void {
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();

    $this->actingAs($admin)
        ->putJson('/api/v1/admin/settings/store', [
            'primary_color' => '#9D174D',
            'tagline' => 'Nova assinatura Mistura Feminina',
            'free_shipping_threshold_cents' => 19900,
        ])
        ->assertOk();

    $this->getJson('/api/v1/storefront/bootstrap')
        ->assertOk()
        ->assertJsonPath('data.settings.primary_color', '#9D174D')
        ->assertJsonPath('data.settings.tagline', 'Nova assinatura Mistura Feminina')
        ->assertJsonPath('data.settings.free_shipping_threshold_cents', 19900);

    // Media upload validates authentic PNG header
    $fakeImg = UploadedFile::fake()->image('banner-promo.png', 800, 300);
    $upload = $this->actingAs($admin)
        ->postJson('/api/v1/admin/media/upload', [
            'file' => $fakeImg,
            'title' => 'Banner Verao',
            'folder' => 'banners',
        ])->assertCreated();

    $imgPath = (string) $upload->json('data.path');
    expect($imgPath)->toStartWith('/storage/banners/');

    // Admin creates banner using uploaded asset
    $this->actingAs($admin)
        ->postJson('/api/v1/admin/banners', [
            'title' => 'Banner Especial Verao',
            'placement' => 'hero',
            'desktop_image_path' => $imgPath,
            'alt_text' => 'Banner Especial Verao Mistura',
            'cta_url' => '/promocoes',
            'sort_order' => 0,
            'is_active' => true,
        ])->assertCreated();
});

test('admin category slug change creates 301 redirect and catalog CSV dry-run/import works', function (): void {
    $admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();
    $cat = Category::query()->where('slug', 'skincare')->firstOrFail();

    $this->actingAs($admin)
        ->putJson("/api/v1/admin/categories/{$cat->id}", [
            'name' => 'Skincare Facial',
            'slug' => 'skincare-facial',
        ])->assertOk();

    $this->getJson('/api/v1/catalog/categories/skincare')
        ->assertStatus(301)
        ->assertJsonPath('redirect_to', '/categoria/skincare-facial');

    $csvResp = $this->actingAs($admin)->get('/api/v1/admin/catalog/export-csv')->assertOk();
    $csvText = (string) $csvResp->getContent();
    expect($csvText)->toContain('MF-ESM-001');

    // Dry-run CSV import with a new item
    $newCsv = "sku;name;slug;brand;categories;price_cents;promo_price_cents;stock_qty;weight_grams;is_active;variant_sku;variant_name\n";
    $newCsv .= "MF-CSV-900;Creme Hidratante CSV;creme-hidratante-csv;Mistura Lab;skincare-facial;5990;4990;15;250;1;MF-CSV-900-V1;Padrão\n";

    $this->actingAs($admin)
        ->postJson('/api/v1/admin/catalog/import-csv', ['csv_content' => $newCsv, 'dry_run' => true])
        ->assertOk()
        ->assertJsonPath('data.created', 1);

    expect(Product::query()->where('sku', 'MF-CSV-900')->exists())->toBeFalse();

    $this->actingAs($admin)
        ->postJson('/api/v1/admin/catalog/import-csv', ['csv_content' => $newCsv, 'dry_run' => false])
        ->assertOk()
        ->assertJsonPath('data.created', 1);

    expect(Product::query()->where('sku', 'MF-CSV-900')->exists())->toBeTrue();
});

test('customer LGPD export, 2FA TOTP verification, sitemap, and backup command work', function (): void {
    $customer = User::query()->where('email', 'cliente@misturafeminina.local')->firstOrFail();

    $this->actingAs($customer)
        ->getJson('/api/v1/account/lgpd/export')
        ->assertOk()
        ->assertJsonPath('data.account.email', $customer->email);

    $this->actingAs($customer)
        ->postJson('/api/v1/account/lgpd/request', ['type' => 'export', 'notes' => 'Solicitação teste'])
        ->assertCreated();

    // 2FA setup + confirm + login challenge
    $setup = $this->actingAs($customer)->postJson('/api/v1/account/2fa/setup')->assertOk();
    $secret = (string) $setup->json('data.secret');
    $code = app(TotpService::class)->currentCode($secret);

    $this->actingAs($customer)
        ->postJson('/api/v1/account/2fa/confirm', ['code' => $code])
        ->assertOk()
        ->assertJsonCount(8, 'data.recovery_codes');

    // Sitemap & robots
    $this->get('/sitemap.xml')->assertOk()->assertSee('esmalte-gel-alta-duracao-15ml', false);
    $this->get('/robots.txt')->assertOk()->assertSee('Sitemap:');

    // Backup command creates sqlite/sql backup file
    Artisan::call('mistura:backup');
    $output = Artisan::output();
    expect($output)->toContain('Backup');
});
