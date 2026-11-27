<?php

declare(strict_types=1);

use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
});

test('robots.txt returns valid directives and points to sitemap', function (): void {
    $response = $this->get('/robots.txt');

    $response->assertOk();
    $response->assertHeader('Content-Type', 'text/plain; charset=UTF-8');
    expect($response->getContent())
        ->toContain('User-agent: *')
        ->toContain('Allow: /')
        ->toContain('Allow: /*.avif$')
        ->toContain('Disallow: /admin/')
        ->toContain('Disallow: /checkout')
        ->toContain('Disallow: /pedido/')
        ->toContain('Disallow: /*?*brand=')
        ->toContain('Disallow: /*?*category=')
        ->toContain('Sitemap: ');
});

test('sitemap.xml generates valid xml with categories and products', function (): void {
    $response = $this->get('/sitemap.xml');

    $response->assertOk();
    $response->assertHeader('Content-Type', 'application/xml; charset=UTF-8');
    expect($response->getContent())
        ->toContain('<?xml version="1.0" encoding="UTF-8"?>')
        ->toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
        ->toContain('/contato')
        ->toContain('/categoria/')
        ->toContain('/produto/');
});

test('llms.txt provides structured markdown information about the store', function (): void {
    $response = $this->get('/llms.txt');

    $response->assertOk();
    $response->assertHeader('Content-Type', 'text/markdown; charset=UTF-8');
    expect($response->getContent())
        ->toContain('# Mistura Feminina Cosméticos')
        ->toContain('## Catálogo e Seções Principais')
        ->toContain('## Categorias em Destaque')
        ->toContain('## Políticas Comerciais e Atendimento ao Cliente')
        ->toContain('/categoria/unhas-e-esmalteria');
});

test('merchant-feed.xml returns valid Google Merchant Center RSS feed with real products', function (): void {
    $response = $this->get('/merchant-feed.xml');

    $response->assertOk();
    $response->assertHeader('Content-Type', 'application/xml; charset=UTF-8');
    expect($response->getContent())
        ->toContain('<?xml version="1.0" encoding="UTF-8"?>')
        ->toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">')
        ->toContain('<g:price>')
        ->toContain(' BRL</g:price>')
        ->toContain('<g:availability>');
});

test('merchant feed handles multi-variant products with item_group_id and excludes inactive or zero-priced items', function (): void {
    $brand = \App\Models\Brand::first();
    $category = \App\Models\Category::first();

    // 1. Produto variável ativo com 2 variações de volume
    $variableProduct = \App\Models\Product::create([
        'name' => 'Removedor de Teste Stork',
        'slug' => 'removedor-teste-stork',
        'sku' => 'TEST-REM-001',
        'price_cents' => 500,
        'cost_cents' => 200,
        'weight_grams' => 200,
        'product_type' => \App\Domain\Shared\Enums\ProductType::Variable,
        'has_variants' => true,
        'is_active' => true,
        'brand_id' => $brand?->id,
    ]);
    $variableProduct->categories()->attach($category?->id);
    $variableProduct->images()->create([
        'path' => '/products/removedor-principal.webp',
        'is_primary' => true,
    ]);

    $var1 = $variableProduct->variants()->create([
        'sku' => 'TEST-REM-100ML',
        'name' => '100 ml',
        'option_values' => [['attribute_name' => 'Volume', 'attribute_slug' => 'volume', 'value' => '100 ml', 'value_slug' => '100-ml']],
        'price_cents' => 500,
        'stock_qty' => 15,
        'is_active' => true,
        'is_default' => true,
    ]);
    $var2 = $variableProduct->variants()->create([
        'sku' => 'TEST-REM-500ML',
        'name' => '500 ml',
        'option_values' => [['attribute_name' => 'Volume', 'attribute_slug' => 'volume', 'value' => '500 ml', 'value_slug' => '500-ml']],
        'price_cents' => 1500,
        'stock_qty' => 5,
        'is_active' => true,
        'is_default' => false,
    ]);

    // 2. Produto inativo (como os antigos cadastros separados ou rascunhos)
    $inactiveProduct = \App\Models\Product::create([
        'name' => 'Removedor de Teste Stork 500 ml Consolidado',
        'slug' => 'removedor-teste-stork-500-ml-consolidado',
        'sku' => 'TEST-REM-INACTIVE',
        'price_cents' => 1500,
        'cost_cents' => 500,
        'weight_grams' => 500,
        'product_type' => \App\Domain\Shared\Enums\ProductType::Simple,
        'has_variants' => false,
        'is_active' => false,
    ]);

    // 3. Produto ativo mas com preço zerado (como IDs 215 a 218)
    $zeroPriceProduct = \App\Models\Product::create([
        'name' => 'Produto Teste Sem Preco',
        'slug' => 'produto-teste-sem-preco',
        'sku' => 'TEST-ZERO-PRICE',
        'price_cents' => 0,
        'cost_cents' => 0,
        'weight_grams' => 100,
        'product_type' => \App\Domain\Shared\Enums\ProductType::Simple,
        'has_variants' => false,
        'is_active' => true,
    ]);

    // Limpa cache para forçar geração
    app(\App\Domain\Marketing\Services\GoogleMerchantFeedService::class)->clearCache();

    $response = $this->get('/merchant-feed.xml');
    $response->assertOk();
    $content = $response->getContent();

    // Deve conter as variantes com item_group_id e size
    expect($content)
        ->toContain('<g:id>TEST-REM-100ML</g:id>')
        ->toContain('<g:id>TEST-REM-500ML</g:id>')
        ->toContain('<g:item_group_id>TEST-REM-001</g:item_group_id>')
        ->toContain('<g:size>100 ml</g:size>')
        ->toContain('<g:size>500 ml</g:size>')
        ->toContain('/produto/removedor-teste-stork?variant='.$var1->id)
        ->toContain('/produto/removedor-teste-stork?variant='.$var2->id)
        ->toContain('5.00 BRL')
        ->toContain('15.00 BRL')
        // NÃO deve conter o produto inativo
        ->not->toContain('TEST-REM-INACTIVE')
        // NÃO deve conter o produto com preço zero
        ->not->toContain('TEST-ZERO-PRICE');
});
