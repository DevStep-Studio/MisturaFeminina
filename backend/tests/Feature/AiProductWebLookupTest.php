<?php

declare(strict_types=1);

use App\Domain\Shared\Enums\RoleSlug;
use App\Models\Brand;
use App\Models\Category;
use App\Models\IntegrationSetting;
use App\Models\MediaAsset;
use App\Models\Product;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
    config()->set('services.openai.api_key', null);
    config()->set('services.google_search.driver', 'serper');
    config()->set('services.google_search.serper_api_key', null);
    config()->set('services.google_search.api_key', null);
    config()->set('services.google_search.engine_id', null);
});

function makeCatalogStaffUser(RoleSlug $roleSlug = RoleSlug::Catalog): User
{
    $user = User::factory()->create([
        'name' => 'Operadora Busca IA',
        'email' => 'busca.ia.'.uniqid().'@misturafeminina.com.br',
        'is_active' => true,
    ]);
    $role = Role::query()->where('slug', $roleSlug->value)->firstOrFail();
    $user->roles()->sync([$role->id]);

    return $user;
}

function generateSamplePngBytes(int $w = 120, int $h = 120): string
{
    $im = imagecreatetruecolor($w, $h);
    $bg = imagecolorallocate($im, 147, 80, 158);
    imagefilledrectangle($im, 0, 0, $w, $h, $bg);
    ob_start();
    imagepng($im);
    $bytes = (string) ob_get_clean();
    imagedestroy($im);

    return $bytes;
}

test('retorna search_unavailable sem inventar dados quando credenciais de busca nao estao configuradas e valida integracao Serper e Google CSE', function (): void {
    $admin = makeCatalogStaffUser(RoleSlug::Admin);

    $resMissing = $this->actingAs($admin)->postJson('/api/v1/admin/ai/catalog/lookup', [
        'query' => 'Cabine Sun 5 48W bivolt',
    ]);

    $resMissing->assertOk()
        ->assertJsonPath('data.state', 'search_unavailable')
        ->assertJsonPath('data.credentials_missing', true)
        ->assertJsonPath('data.draft.name', 'Cabine Sun 5 48W bivolt')
        ->assertJsonPath('data.draft.price_cents', null)
        ->assertJsonPath('data.draft.image_url', null);

    // Configure Serper credentials cleanly via encrypted IntegrationSetting
    $this->actingAs($admin)->putJson('/api/v1/admin/settings/integrations/google_search', [
        'environment' => 'production',
        'is_active' => true,
        'public_config' => ['driver' => 'serper'],
        'credentials' => ['serper_api_key' => 'serper_test_key_123456'],
    ])->assertOk()->assertJsonPath('data.has_credentials', true);

    Http::fake([
        'https://google.serper.dev/search' => Http::response(['organic' => [['title' => 'OK', 'link' => 'https://example.com']]], 200),
    ]);

    $this->actingAs($admin)->postJson('/api/v1/admin/ai/settings/test-search-connection')
        ->assertOk()
        ->assertJsonPath('data.status', 'connected')
        ->assertJsonPath('data.driver', 'serper');

    $settingsPayload = $this->actingAs($admin)->getJson('/api/v1/admin/ai/settings')->assertOk();
    expect($settingsPayload->json('data.search_connection.status'))->toBe('connected')
        ->and($settingsPayload->json('data.search_connection.masked_key'))->toBe('serpe...3456');

    // Also validate legacy Google Custom Search JSON API driver when provisioned
    IntegrationSetting::query()->where('provider', 'google_search')->delete();
    $this->actingAs($admin)->putJson('/api/v1/admin/settings/integrations/google_search', [
        'environment' => 'production',
        'is_active' => true,
        'public_config' => ['driver' => 'google_custom_search', 'engine_id' => 'cx_existing_99'],
        'credentials' => ['api_key' => 'AIzaSyFakeKey9876'],
    ])->assertOk();

    Http::fake([
        'https://www.googleapis.com/customsearch/v1*' => Http::response(['items' => [['link' => 'https://fabricante.com.br/p']]], 200),
    ]);

    $this->actingAs($admin)->postJson('/api/v1/admin/ai/settings/test-search-connection')
        ->assertOk()
        ->assertJsonPath('data.status', 'connected')
        ->assertJsonPath('data.driver', 'google_custom_search');
});

test('busca por nome discrimina modelos com potencias diferentes, extrai fatos reais sem copiar preco e usa cache recente', function (): void {
    $catalogUser = makeCatalogStaffUser(RoleSlug::Catalog);
    config()->set('services.google_search.driver', 'serper');
    config()->set('services.google_search.serper_api_key', 'serper_live_mock_key');

    $sun5Html = <<<'HTML'
<!doctype html>
<html>
<head>
  <title>Cabine LED UV Sun 5 48W Bivolt com Temporizador | Fabricante Oficial</title>
  <meta property="og:image" content="https://cdn.fabricante.com.br/cabine-sun5-48w.png" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "Cabine LED UV Sun 5 48W Bivolt com Temporizador",
    "brand": {"@type": "Brand", "name": "SunUV"},
    "description": "Cabine profissional LED UV de 48W bivolt automática com temporizador de 10s, 30s, 60s e 99s.",
    "image": ["https://cdn.fabricante.com.br/cabine-sun5-48w.png"],
    "gtin13": "7891234560012",
    "offers": {"@type": "Offer", "price": "159.90"}
  }
  </script>
</head>
<body>Cabine Sun 5 48W R$ 159,90</body>
</html>
HTML;

    Http::fake([
        'https://google.serper.dev/search' => Http::response([
            'organic' => [
                [
                    'title' => 'Cabine Sun 5 48W Bivolt Temporizador Digital — SunUV',
                    'link' => 'https://fabricante.com.br/cabine-sun-5-48w',
                    'snippet' => 'Cabine LED/UV Sun 5 48W bivolt com sensor e temporizador de 10s/30s/60s por apenas R$ 159,90.',
                    'position' => 1,
                ],
                [
                    'title' => 'Cabine Sun 8 Pro 268W Alta Potência Profissional',
                    'link' => 'https://outro-site.com.br/cabine-sun-8-pro-268w',
                    'snippet' => 'Cabine Sun 8 Pro 268W para secagem rápida.',
                    'position' => 2,
                ],
            ],
        ], 200),
        'https://google.serper.dev/images' => Http::response([
            'images' => [
                [
                    'title' => 'Cabine Sun 5 48W Bivolt Branca',
                    'imageUrl' => 'https://cdn.fabricante.com.br/cabine-sun5-48w.png',
                    'thumbnailUrl' => 'https://cdn.fabricante.com.br/thumb-sun5.png',
                    'link' => 'https://fabricante.com.br/cabine-sun-5-48w',
                    'imageWidth' => 800,
                    'imageHeight' => 800,
                ],
                [
                    'title' => 'Cabine Sun 8 Pro 268W',
                    'imageUrl' => 'https://outro-site.com.br/sun8-268w.png',
                    'thumbnailUrl' => 'https://outro-site.com.br/sun8-thumb.png',
                    'link' => 'https://outro-site.com.br/cabine-sun-8-pro-268w',
                    'imageWidth' => 800,
                    'imageHeight' => 800,
                ],
            ],
        ], 200),
        'https://fabricante.com.br/cabine-sun-5-48w' => Http::response($sun5Html, 200, ['Content-Type' => 'text/html']),
    ]);

    $first = $this->actingAs($catalogUser)->postJson('/api/v1/admin/ai/catalog/lookup', [
        'query' => 'Cabine Sun 5 48W bivolt com temporizador',
    ]);

    $first->assertOk()
        ->assertJsonPath('data.state', 'draft_ready')
        ->assertJsonPath('data.cached', false)
        ->assertJsonPath('data.draft.power_watts', 48)
        ->assertJsonPath('data.draft.gtin', '7891234560012')
        ->assertJsonPath('data.draft.price_cents', null)
        ->assertJsonPath('data.draft.cost_cents', null)
        ->assertJsonPath('data.draft.stock_qty', null)
        ->assertJsonPath('data.source.url', 'https://fabricante.com.br/cabine-sun-5-48w');

    expect((string) $first->json('data.draft.description'))
        ->not->toContain('159,90')
        ->not->toContain('Sun 8 Pro')
        ->toContain('48W');

    // Sun 8 Pro 268W image should NOT bleed into Sun 5 image candidates
    $imgUrls = array_column($first->json('data.image_candidates') ?? [], 'image_url');
    expect($imgUrls)->toContain('https://cdn.fabricante.com.br/cabine-sun5-48w.png')
        ->not->toContain('https://outro-site.com.br/sun8-268w.png');

    // Repeat identical lookup hits cache without firing extra Serper calls
    $second = $this->actingAs($catalogUser)->postJson('/api/v1/admin/ai/catalog/lookup', [
        'query' => 'Cabine Sun 5 48W bivolt com temporizador',
    ]);
    $second->assertOk()->assertJsonPath('data.cached', true);
});

test('sinaliza duvida em pagina de colecao para tonalidade especifica e oferece escolha em termo generico', function (): void {
    $catalogUser = makeCatalogStaffUser(RoleSlug::Catalog);
    config()->set('services.google_search.driver', 'serper');
    config()->set('services.google_search.serper_api_key', 'serper_live_mock_key');

    Http::fake([
        'https://google.serper.dev/search' => Http::sequence()
            ->push([
                'organic' => [
                    [
                        'title' => 'Coleção Esmaltes em Gel Rosé 15 ml — Kit 10 Cores Sortidas',
                        'link' => 'https://marca-esmalte.com.br/colecao-10-cores',
                        'snippet' => 'Cartela completa de esmaltes em gel 15 ml com diversas tonalidades.',
                        'position' => 1,
                    ],
                ],
            ], 200)
            ->push([
                'organic' => [
                    [
                        'title' => 'Top Coat em Gel 15 ml — D&Z Profissional',
                        'link' => 'https://dez.com.br/top-coat-15ml',
                        'snippet' => 'Finalizador em gel UV 15 ml.',
                        'position' => 1,
                    ],
                    [
                        'title' => 'Top Coat 15 ml Selante — Bella Gel',
                        'link' => 'https://bellagel.com.br/top-coat-15ml',
                        'snippet' => 'Top coat sem goma 15 ml para acabamento.',
                        'position' => 2,
                    ],
                ],
            ], 200),
        'https://google.serper.dev/images' => Http::sequence()
            ->push([
                'images' => [
                    [
                        'title' => 'Coleção Esmaltes em Gel 10 Cores Sortidas 15ml',
                        'imageUrl' => 'https://marca-esmalte.com.br/img/colecao.png',
                        'thumbnailUrl' => 'https://marca-esmalte.com.br/img/colecao-thumb.png',
                        'link' => 'https://marca-esmalte.com.br/colecao-10-cores',
                    ],
                ],
            ], 200)
            ->push([
                'images' => [
                    [
                        'title' => 'Top Coat D&Z 15 ml',
                        'imageUrl' => 'https://dez.com.br/img/topcoat.png',
                        'thumbnailUrl' => 'https://dez.com.br/img/topcoat-thumb.png',
                        'link' => 'https://dez.com.br/top-coat-15ml',
                    ],
                ],
            ], 200),
        'https://marca-esmalte.com.br/colecao-10-cores' => Http::response('<html><title>Coleção 10 Cores 15ml</title></html>', 200),
        'https://dez.com.br/top-coat-15ml' => Http::response('<html><title>Top Coat 15 ml D&Z</title></html>', 200),
    ]);

    // 1. Shade requested ("Rosé"), but source is a generic 10-shade collection -> image flagged for review
    $collectionRes = $this->actingAs($catalogUser)->postJson('/api/v1/admin/ai/catalog/lookup', [
        'query' => 'Esmalte em Gel Rosé 15 ml',
    ]);
    $collectionRes->assertOk()
        ->assertJsonPath('data.state', 'draft_ready')
        ->assertJsonPath('data.image_status', 'uncertain_collection')
        ->assertJsonPath('data.requires_image_review', true);

    // 2. Generic product without brand ("top coat 15 ml") -> presents multiple candidates for 1-click choice
    $genericRes = $this->actingAs($catalogUser)->postJson('/api/v1/admin/ai/catalog/lookup', [
        'query' => 'top coat 15 ml',
    ]);
    $genericRes->assertOk()
        ->assertJsonPath('data.state', 'multiple_candidates');
    expect(count($genericRes->json('data.candidates')))->toBe(2);
});

test('importa imagem real para storage da loja com miniatura, bloqueia HTML/403/SSRF e protege contra duplicidade e idempotencia', function (): void {
    Storage::fake('public');
    $catalogUser = makeCatalogStaffUser(RoleSlug::Catalog);

    $validPng = generateSamplePngBytes(200, 200);

    Http::fake([
        'https://cdn.fabricante.com.br/produto.png' => Http::response($validPng, 200, ['Content-Type' => 'image/png']),
        'https://cdn.fabricante.com.br/bloqueado.png' => Http::response('Forbidden', 403),
        'https://cdn.fabricante.com.br/falso.png' => Http::response('<html><body>Ops</body></html>', 200, ['Content-Type' => 'image/png']),
        'https://cdn.fabricante.com.br/redireciona-ssrf' => Http::response('', 302, ['Location' => 'http://127.0.0.1:8000/interno.png']),
    ]);

    // 1. Real image downloaded & stored locally under /storage/catalog/... with thumb WebP
    $imported = $this->actingAs($catalogUser)->postJson('/api/v1/admin/ai/catalog/import-image', [
        'url' => 'https://cdn.fabricante.com.br/produto.png',
        'title' => 'Cabine Sun 5 48W',
    ]);
    $imported->assertCreated();
    $savedPath = (string) $imported->json('data.path');
    $thumbPath = (string) $imported->json('data.thumb_path');
    expect($savedPath)->toStartWith('/storage/catalog/')
        ->and(MediaAsset::query()->where('path', $savedPath)->exists())->toBeTrue();
    Storage::disk('public')->assertExists(str_replace('/storage/', '', $savedPath));
    if ($thumbPath !== '') {
        Storage::disk('public')->assertExists(str_replace('/storage/', '', $thumbPath));
    }

    // 2. Origin 403 block, fake HTML content, and SSRF redirect to 127.0.0.1 must fail with 422
    $this->actingAs($catalogUser)->postJson('/api/v1/admin/ai/catalog/import-image', [
        'url' => 'https://cdn.fabricante.com.br/bloqueado.png',
    ])->assertStatus(422);

    $this->actingAs($catalogUser)->postJson('/api/v1/admin/ai/catalog/import-image', [
        'url' => 'https://cdn.fabricante.com.br/falso.png',
    ])->assertStatus(422);

    $this->actingAs($catalogUser)->postJson('/api/v1/admin/ai/catalog/import-image', [
        'url' => 'https://cdn.fabricante.com.br/redireciona-ssrf',
    ])->assertStatus(422);

    // 3. Manual upload route under ai.catalog works cleanly and produces local storage asset
    $tmpUpload = UploadedFile::fake()->image('minha-foto.jpg', 180, 180);
    $this->actingAs($catalogUser)->post('/api/v1/admin/ai/catalog/upload-image', [
        'file' => $tmpUpload,
        'title' => 'Foto Manual',
    ])->assertCreated();

    // 4. Local SKU match (seeded JK-DST-001) + check-duplicates + idempotent save protection
    $brand = Brand::query()->first();
    $cat = Category::query()->first();

    $idemKey = 'test-idem-key-'.uniqid();
    $payload = [
        'name' => 'Cabine LED Compact 36W Estúdio',
        'sku' => 'MF-AGENT-001',
        'gtin' => '7899990000111',
        'brand_id' => $brand?->id,
        'category_ids' => $cat ? [$cat->id] : [],
        'power_watts' => 36,
        'price_cents' => 14990,
        'cost_cents' => 6800,
        'stock_qty' => 8,
        'images' => [['path' => $savedPath, 'alt_text' => 'Cabine Compact 36W', 'is_primary' => true]],
    ];

    $save1 = $this->actingAs($catalogUser)
        ->withHeader('X-Idempotency-Key', $idemKey)
        ->postJson('/api/v1/admin/products', $payload);
    $save1->assertCreated();
    $createdId = (int) $save1->json('data.id');

    $save2 = $this->actingAs($catalogUser)
        ->withHeader('X-Idempotency-Key', $idemKey)
        ->postJson('/api/v1/admin/products', $payload);
    $save2->assertOk()->assertJsonPath('idempotent_replay', true);
    expect(Product::query()->where('sku', 'MF-AGENT-001')->count())->toBe(1);

    // Pre-save duplicate check flags both SKU and GTIN cleanly
    $this->actingAs($catalogUser)->postJson('/api/v1/admin/ai/catalog/check-duplicates', [
        'sku' => 'MF-AGENT-001',
        'gtin' => '7899990000111',
    ])->assertOk()
        ->assertJsonPath('data.has_exact_conflict', true)
        ->assertJsonPath('data.exact_conflicts.0.id', $createdId);

    // Lookup searching seeded internal SKU JK-DST-001 returns local duplicate without calling external Google
    $seededJk = Product::query()->where('sku', 'JK-DST-001')->firstOrFail();
    $dupLookup = $this->actingAs($catalogUser)->postJson('/api/v1/admin/ai/catalog/lookup', [
        'query' => 'JK-DST-001',
        'internal_sku' => 'JK-DST-001',
    ]);
    $dupLookup->assertOk()
        ->assertJsonPath('data.state', 'duplicate_found')
        ->assertJsonPath('data.local_matches.0.id', $seededJk->id);
});
