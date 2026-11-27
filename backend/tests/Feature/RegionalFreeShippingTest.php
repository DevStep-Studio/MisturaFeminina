<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Cart\Services\CartService;
use App\Domain\Shipping\Services\RegionalFreeShippingService;
use App\Domain\Shipping\Services\ShippingQuoteService;
use App\Models\Cart;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\ShippingRule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    ShippingRule::query()->updateOrCreate(
        ['code' => 'PAC-BRASIL'],
        [
            'name' => 'Entrega Econômica Nacional',
            'carrier' => 'Correios / Transportadora',
            'mode' => 'table',
            'base_price_cents' => 1890,
            'price_per_kg_cents' => 450,
            'estimated_days' => 6,
            'extra_prep_days' => 1,
            'free_shipping_above_cents' => null,
            'is_active' => true,
        ]
    );

    ShippingRule::query()->updateOrCreate(
        ['code' => 'SEDEX-EXPRESSO'],
        [
            'name' => 'Entrega Expressa',
            'carrier' => 'Correios Expresso',
            'mode' => 'table',
            'base_price_cents' => 3190,
            'price_per_kg_cents' => 750,
            'estimated_days' => 2,
            'extra_prep_days' => 1,
            'free_shipping_above_cents' => null,
            'is_active' => true,
        ]
    );

    ShippingRule::query()->updateOrCreate(
        ['code' => 'RETIRADA-LOJA'],
        [
            'name' => 'Retirada no Balcão (Agendar)',
            'carrier' => 'Mistura Feminina',
            'mode' => 'pickup',
            'base_price_cents' => 0,
            'price_per_kg_cents' => 0,
            'estimated_days' => 1,
            'extra_prep_days' => 0,
            'free_shipping_above_cents' => null,
            'is_active' => true,
        ]
    );
});

test('infere corretamente UFs de todos os blocos regionais do Brasil', function (): void {
    /** @var RegionalFreeShippingService $service */
    $service = app(RegionalFreeShippingService::class);

    // RJ
    expect($service->inferUfFromCep('20010-000'))->toBe('RJ');
    expect($service->inferUfFromCep('28999999'))->toBe('RJ');

    // Sudeste
    expect($service->inferUfFromCep('01310-100'))->toBe('SP');
    expect($service->inferUfFromCep('30130-100'))->toBe('MG');
    expect($service->inferUfFromCep('29010-000'))->toBe('ES');

    // Sul e Centro-Oeste
    expect($service->inferUfFromCep('80010-000'))->toBe('PR');
    expect($service->inferUfFromCep('88010-000'))->toBe('SC');
    expect($service->inferUfFromCep('90010-000'))->toBe('RS');
    expect($service->inferUfFromCep('74010-000'))->toBe('GO');
    expect($service->inferUfFromCep('78010-000'))->toBe('MT');
    expect($service->inferUfFromCep('79010-000'))->toBe('MS');
    expect($service->inferUfFromCep('70040-010'))->toBe('DF');

    // Norte e Nordeste
    expect($service->inferUfFromCep('40010-000'))->toBe('BA');
    expect($service->inferUfFromCep('50010-000'))->toBe('PE');
    expect($service->inferUfFromCep('60010-000'))->toBe('CE');
    expect($service->inferUfFromCep('69010-000'))->toBe('AM');
    expect($service->inferUfFromCep('66010-000'))->toBe('PA');
    expect($service->inferUfFromCep('68900-000'))->toBe('AP');
    expect($service->inferUfFromCep('69300-000'))->toBe('RR');
    expect($service->inferUfFromCep('69900-000'))->toBe('AC');
    expect($service->inferUfFromCep('76800-000'))->toBe('RO');

    // CEP inválido
    expect($service->inferUfFromCep('1234'))->toBeNull();
});

test('valida os limites estritos de frete grátis por região (RJ, Sudeste, Sul/CO, Norte/NE)', function (): void {
    /** @var RegionalFreeShippingService $service */
    $service = app(RegionalFreeShippingService::class);

    // 1. RJ: R$ 149,99 (14999) não atinge; R$ 150,00 (15000) atinge
    $rjBelow = $service->evaluate('20010000', 14999);
    expect($rjBelow['uf'])->toBe('RJ');
    expect($rjBelow['region_id'])->toBe('rj');
    expect($rjBelow['is_unlocked'])->toBeFalse();
    expect($rjBelow['remaining_cents'])->toBe(1);
    expect($rjBelow['message'])->toContain('Faltam R$ 0,01');

    $rjEqual = $service->evaluate('20010000', 15000);
    expect($rjEqual['is_unlocked'])->toBeTrue();
    expect($rjEqual['remaining_cents'])->toBe(0);
    expect($rjEqual['message'])->toContain('Você ganhou frete grátis para o RJ');

    // 2. Sudeste (SP): R$ 299,89 (29989) não atinge; R$ 299,90 (29990) atinge
    $spBelow = $service->evaluate('01310100', 29989);
    expect($spBelow['uf'])->toBe('SP');
    expect($spBelow['region_id'])->toBe('sudeste');
    expect($spBelow['is_unlocked'])->toBeFalse();
    expect($spBelow['remaining_cents'])->toBe(1);

    $spEqual = $service->evaluate('01310100', 29990);
    expect($spEqual['is_unlocked'])->toBeTrue();
    expect($spEqual['remaining_cents'])->toBe(0);
    expect($spEqual['message'])->toContain('Você ganhou frete grátis para o SP');

    // 3. Sul e Centro-Oeste (PR): R$ 499,89 (49989) não atinge; R$ 499,90 (49990) atinge
    $prBelow = $service->evaluate('80010000', 49989);
    expect($prBelow['uf'])->toBe('PR');
    expect($prBelow['region_id'])->toBe('sul_centro_oeste');
    expect($prBelow['is_unlocked'])->toBeFalse();
    expect($prBelow['remaining_cents'])->toBe(1);

    $prEqual = $service->evaluate('80010000', 49990);
    expect($prEqual['is_unlocked'])->toBeTrue();
    expect($prEqual['remaining_cents'])->toBe(0);
    expect($prEqual['message'])->toContain('Você ganhou frete grátis para o PR');

    // 4. Norte e Nordeste (BA): R$ 799,89 (79989) não atinge; R$ 799,90 (79990) atinge
    $baBelow = $service->evaluate('40010000', 79989);
    expect($baBelow['uf'])->toBe('BA');
    expect($baBelow['region_id'])->toBe('norte_nordeste');
    expect($baBelow['is_unlocked'])->toBeFalse();
    expect($baBelow['remaining_cents'])->toBe(1);

    $baEqual = $service->evaluate('40010000', 79990);
    expect($baEqual['is_unlocked'])->toBeTrue();
    expect($baEqual['remaining_cents'])->toBe(0);
    expect($baEqual['message'])->toContain('Você ganhou frete grátis para o BA');
});

test('RJ possui regra própria e não herda a regra geral do Sudeste', function (): void {
    /** @var RegionalFreeShippingService $service */
    $service = app(RegionalFreeShippingService::class);

    // RJ com R$ 160,00: liberado pelo limite de R$ 150,00
    $rjEval = $service->evaluate('20010000', 16000);
    expect($rjEval['region_id'])->toBe('rj');
    expect($rjEval['is_unlocked'])->toBeTrue();

    // SP com R$ 160,00: NÃO liberado, pois o Sudeste exige R$ 299,90
    $spEval = $service->evaluate('01310100', 16000);
    expect($spEval['region_id'])->toBe('sudeste');
    expect($spEval['is_unlocked'])->toBeFalse();
    expect($spEval['remaining_cents'])->toBe(13990);
});

test('cotação de frete aplica gratuidade à modalidade econômica e mantém Sedex calculado', function (): void {
    /** @var ShippingQuoteService $shipping */
    $shipping = app(ShippingQuoteService::class);

    $items = [
        [
            'id' => 'TEST-001',
            'width' => 10,
            'height' => 10,
            'length' => 10,
            'weight_grams' => 200,
            'insurance_cents' => 15000,
            'quantity' => 1,
        ],
    ];

    // RJ com R$ 150,00 -> atinge frete grátis
    $quoteRj = $shipping->quoteForItems('20010000', $items, 15000);
    expect($quoteRj['regional_free_shipping']['is_unlocked'])->toBeTrue();

    $pac = collect($quoteRj['options'])->firstWhere('service_code', 'PAC-BRASIL');
    $sedex = collect($quoteRj['options'])->firstWhere('service_code', 'SEDEX-EXPRESSO');

    expect($pac)->not->toBeNull();
    expect($pac['price_cents'])->toBe(0);
    expect($pac['is_free_shipping'])->toBeTrue();

    // Sedex permanece calculado com seu preço normal (> 0) e prazo preservado
    expect($sedex)->not->toBeNull();
    expect($sedex['price_cents'])->toBeGreaterThan(0);
    expect($sedex['is_free_shipping'])->toBeFalse();
    expect($sedex['estimated_days'])->toBeGreaterThan(0);
});

test('cotação de frete mantém cobrança normal quando abaixo do mínimo da região', function (): void {
    /** @var ShippingQuoteService $shipping */
    $shipping = app(ShippingQuoteService::class);

    $items = [
        [
            'id' => 'TEST-001',
            'width' => 10,
            'height' => 10,
            'length' => 10,
            'weight_grams' => 200,
            'insurance_cents' => 10000,
            'quantity' => 1,
        ],
    ];

    // RJ com R$ 100,00 (abaixo de R$ 150,00)
    $quoteRj = $shipping->quoteForItems('20010000', $items, 10000);
    expect($quoteRj['regional_free_shipping']['is_unlocked'])->toBeFalse();

    $pac = collect($quoteRj['options'])->firstWhere('service_code', 'PAC-BRASIL');
    expect($pac)->not->toBeNull();
    expect($pac['price_cents'])->toBeGreaterThan(0);
    expect($pac['is_free_shipping'])->toBeFalse();
});


test('recalcula a regra e elegibilidade de frete quando o CEP do carrinho muda', function (): void {
    /** @var CartService $cartService */
    $cartService = app(CartService::class);
    /** @var ShippingQuoteService $shipping */
    $shipping = app(ShippingQuoteService::class);

    $product = Product::query()->create([
        'name' => 'Esmalte Teste',
        'slug' => 'esmalte-teste',
        'sku' => 'TEST-ESM-01',
        'product_type' => 'simple',
        'price_cents' => 20000, // R$ 200,00
        'is_active' => true,
    ]);

    $variant = ProductVariant::query()->create([
        'product_id' => $product->id,
        'sku' => 'TEST-ESM-01-DEF',
        'name' => 'Padrão',
        'price_cents' => 20000,
        'stock_qty' => 50,
        'is_active' => true,
        'is_default' => true,
    ]);

    $cart = Cart::query()->create([
        'token' => Str::random(32),
        'expires_at' => now()->addDays(7),
    ]);
    $cart->items()->create([
        'product_id' => $product->id,
        'product_variant_id' => $variant->id,
        'quantity' => 1,
        'unit_price_snapshot_cents' => 20000,
    ]);

    // 1. CEP no RJ (R$ 200,00 >= R$ 150,00) -> Frete Grátis liberado
    $cart->update(['shipping_cep' => '20010000']);
    $summaryRj = $cartService->buildSummary($cart);
    expect($summaryRj['regional_free_shipping']['uf'])->toBe('RJ');
    expect($summaryRj['regional_free_shipping']['is_unlocked'])->toBeTrue();
    expect($summaryRj['regional_free_shipping']['message'])->toContain('ganhou frete grátis para o RJ');

    // 2. Muda para SP (R$ 200,00 < R$ 299,90) -> Não liberado, faltam R$ 99,90
    $cart->update(['shipping_cep' => '01310100']);
    $summarySp = $cartService->buildSummary($cart);
    expect($summarySp['regional_free_shipping']['uf'])->toBe('SP');
    expect($summarySp['regional_free_shipping']['is_unlocked'])->toBeFalse();
    expect($summarySp['regional_free_shipping']['remaining_cents'])->toBe(9990);
    expect($summarySp['regional_free_shipping']['message'])->toContain('Faltam R$ 99,90 para você ganhar frete grátis no SP');
});

test('endpoints administrativos permitem consultar e atualizar regras regionais de frete', function (): void {
    $service = app(RegionalFreeShippingService::class);

    // Consulta inicial retorna as 4 regiões
    $rules = $service->getRules();
    expect(count($rules))->toBe(4);
    expect($rules[0]['id'])->toBe('rj');
    expect($rules[0]['min_subtotal_cents'])->toBe(15000);

    // Atualiza o valor do RJ para R$ 160,00
    $rules[0]['min_subtotal_cents'] = 16000;
    $service->saveRules($rules);

    $updated = $service->getRules();
    expect($updated[0]['min_subtotal_cents'])->toBe(16000);

    // Restaura padrão
    $service->saveRules(RegionalFreeShippingService::defaultRules());
});
