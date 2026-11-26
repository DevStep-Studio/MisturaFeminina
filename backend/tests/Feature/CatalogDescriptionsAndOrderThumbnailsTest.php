<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Shared\Enums\OrderStatus;
use App\Models\IntegrationSetting;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class CatalogDescriptionsAndOrderThumbnailsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoStoreSeeder::class);
        $this->admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();
    }

    public function test_generate_product_description_uses_openai_when_configured_without_inventing_claims(): void
    {
        IntegrationSetting::query()->updateOrCreate(
            ['provider' => 'openai'],
            [
                'environment' => 'production',
                'encrypted_credentials' => ['api_key' => 'sk-test-valid-key'],
                'is_active' => true,
            ]
        );

        Http::fake([
            '*/chat/completions' => Http::response([
                'choices' => [
                    [
                        'message' => [
                            'content' => json_encode([
                                'short_description' => 'Regulador de pH Any Lovy 10 ml para preparação profissional das unhas.',
                                'description' => "Regulador de pH Any Lovy em embalagem de 10 ml para rotina de preparação de unhas.\n\nDados confirmados: Marca Any Lovy · Apresentação 10 ml.",
                                'seo_title' => 'Regulador de pH Any Lovy 10 ml | Mistura Feminina',
                                'seo_description' => 'Compre Regulador de pH Any Lovy 10 ml na Mistura Feminina Cosméticos.',
                            ], JSON_UNESCAPED_UNICODE),
                        ],
                    ],
                ],
                'usage' => ['prompt_tokens' => 120, 'completion_tokens' => 80, 'total_tokens' => 200],
            ], 200),
        ]);

        $res = $this->actingAs($this->admin)->postJson('/api/v1/admin/products/generate-description', [
            'name' => 'Regulador de pH Any Lovy 10 ml',
            'brand_name' => 'Any Lovy',
            'category_path' => 'Alongamento Unhas > Preparadores > Desidratador / Regulador pH',
            'unit_label' => '10 ml',
        ]);

        $res->assertOk();
        $res->assertJsonPath('data.ai_used', true);
        $res->assertJsonPath('data.ai_status', 'generated');
        $this->assertStringContainsString('Regulador de pH Any Lovy', (string) $res->json('data.proposed.description'));
    }

    public function test_generate_product_description_gracefully_handles_ai_failure_and_allows_product_save(): void
    {
        IntegrationSetting::query()->updateOrCreate(
            ['provider' => 'openai'],
            [
                'environment' => 'production',
                'encrypted_credentials' => ['api_key' => 'sk-test-failing-key'],
                'is_active' => true,
            ]
        );

        Http::fake([
            '*/chat/completions' => Http::response(['error' => ['message' => 'Service temporarily unavailable']], 503),
        ]);

        $genRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/products/generate-description', [
            'name' => 'Porta-Acetona Pequeno',
            'category_path' => 'Acessórios > Potes e Dispensers',
        ]);

        $genRes->assertOk();
        $genRes->assertJsonPath('data.ai_used', false);
        $genRes->assertJsonPath('data.ai_status', 'error');
        $this->assertNotEmpty($genRes->json('data.ai_notice'));
        $this->assertNotEmpty($genRes->json('data.proposed.description'));

        // Product can still be saved normally even when AI failed
        $saveRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/products', [
            'name' => 'Porta-Acetona Pequeno Teste',
            'sku' => 'MF-TEST-PORTA-01',
            'price_cents' => 1290,
            'stock_qty' => 3,
            'short_description' => $genRes->json('data.proposed.short_description'),
            'description' => $genRes->json('data.proposed.description'),
            'is_active' => true,
        ]);
        $saveRes->assertStatus(201);
    }

    public function test_admin_order_show_resolves_variant_image_deactivated_deleted_product_image_and_null_fallback(): void
    {
        // 1) Product with variant-specific image
        $prodVar = Product::query()->create([
            'sku' => 'MF-ORD-VAR',
            'name' => 'Gel Any Lovy',
            'slug' => 'gel-any-lovy-ord-test',
            'has_variants' => true,
            'price_cents' => 3990,
            'is_active' => true,
        ]);
        ProductImage::query()->create([
            'product_id' => $prodVar->id,
            'path' => '/storage/products/gel-parent.png',
            'is_primary' => true,
            'sort_order' => 0,
        ]);
        $variantWithImg = ProductVariant::query()->create([
            'product_id' => $prodVar->id,
            'sku' => 'MF-ORD-VAR-COVER',
            'name' => 'Cover Nude',
            'image_path' => '/storage/products/gel-cover-nude.png',
            'price_cents' => 3990,
            'stock_qty' => 5,
            'is_active' => true,
        ]);

        // 2) Soft-deleted & deactivated historical product with primary image
        $prodDeleted = Product::query()->create([
            'sku' => 'JK-HIST-DEL',
            'name' => 'Unha Postiça Histórica Removida',
            'slug' => 'unha-postica-historica-removida',
            'price_cents' => 1500,
            'is_active' => false,
        ]);
        ProductImage::query()->create([
            'product_id' => $prodDeleted->id,
            'path' => '/products/jack-oferta-3.png',
            'is_primary' => true,
            'sort_order' => 0,
        ]);
        $prodDeleted->delete(); // soft-deleted!

        // 3) Product without any image
        $prodNoImg = Product::query()->create([
            'sku' => 'MF-ORD-NOIMG',
            'name' => 'Item Sem Foto',
            'slug' => 'item-sem-foto-ord',
            'price_cents' => 990,
            'is_active' => true,
        ]);

        $order = Order::query()->create([
            'order_number' => 'MF-THUMB-0001',
            'public_token' => Str::random(40),
            'idempotency_key' => Str::uuid()->toString(),
            'status' => OrderStatus::Paid,
            'customer_name' => 'Cliente Pedido',
            'customer_email' => 'pedido@teste.com',
            'customer_phone' => '31988881111',
            'shipping_address_snapshot' => ['street' => 'Rua A', 'number' => '10', 'neighborhood' => 'Centro', 'city' => 'BH', 'state' => 'MG', 'cep' => '30100-000'],
            'shipping_service_snapshot' => ['carrier' => 'Correios', 'service_name' => 'PAC'],
            'subtotal_cents' => 6480,
            'discount_cents' => 0,
            'shipping_cents' => 1000,
            'tax_cents' => 0,
            'total_cents' => 7480,
            'paid_at' => now(),
        ]);

        OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => $prodVar->id,
            'product_variant_id' => $variantWithImg->id,
            'product_name_snapshot' => 'Gel Any Lovy',
            'variant_name_snapshot' => 'Cover Nude',
            'sku_snapshot' => 'MF-ORD-VAR-COVER',
            'quantity' => 1,
            'unit_price_cents' => 3990,
            'discount_cents' => 0,
            'total_cents' => 3990,
        ]);
        OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => $prodDeleted->id,
            'product_variant_id' => null,
            'product_name_snapshot' => 'Unha Postiça Histórica Removida',
            'variant_name_snapshot' => 'Padrão',
            'sku_snapshot' => 'JK-HIST-DEL',
            'quantity' => 1,
            'unit_price_cents' => 1500,
            'discount_cents' => 0,
            'total_cents' => 1500,
        ]);
        OrderItem::query()->create([
            'order_id' => $order->id,
            'product_id' => $prodNoImg->id,
            'product_variant_id' => null,
            'product_name_snapshot' => 'Item Sem Foto',
            'variant_name_snapshot' => 'Padrão',
            'sku_snapshot' => 'MF-ORD-NOIMG',
            'quantity' => 1,
            'unit_price_cents' => 990,
            'discount_cents' => 0,
            'total_cents' => 990,
        ]);

        $res = $this->actingAs($this->admin)->getJson("/api/v1/admin/orders/{$order->id}");
        $res->assertOk();

        $items = $res->json('data.items');
        $this->assertCount(3, $items);
        $this->assertEquals('/storage/products/gel-cover-nude.png', $items[0]['image_path']);
        $this->assertEquals('/products/jack-oferta-3.png', $items[1]['image_path']);
        $this->assertNull($items[2]['image_path']);
    }
}
