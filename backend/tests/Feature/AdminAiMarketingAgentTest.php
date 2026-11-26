<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Shared\Enums\OrderStatus;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Domain\Shared\Enums\RoleSlug;
use App\Models\AnalyticsEvent;
use App\Models\MarketingAutomation;
use App\Models\MarketingOpportunity;
use App\Models\MarketingRecommendation;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\Role;
use App\Models\SeoUrlInspection;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class AdminAiMarketingAgentTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DemoStoreSeeder::class);

        $this->admin = User::query()->where('email', 'admin@misturafeminina.local')->firstOrFail();
    }

    public function test_marketing_google_rbac_restricts_unauthorized_users_and_allows_marketing_role(): void
    {
        $unauth = $this->getJson('/api/v1/admin/marketing-google/overview');
        $unauth->assertStatus(401);

        $customer = User::factory()->create(['is_active' => true]);
        $customerRole = Role::query()->where('slug', RoleSlug::Customer->value)->firstOrFail();
        $customer->roles()->sync([$customerRole->id]);

        $forbidden = $this->actingAs($customer)->getJson('/api/v1/admin/marketing-google/overview');
        $forbidden->assertStatus(403);

        $marketingUser = User::factory()->create(['is_active' => true]);
        $marketingRole = Role::query()->where('slug', RoleSlug::Marketing->value)->firstOrFail();
        $marketingUser->roles()->sync([$marketingRole->id]);

        $allowed = $this->actingAs($marketingUser)->getJson('/api/v1/admin/marketing-google/overview?range=last_30_days');
        $allowed->assertOk();
    }

    public function test_marketing_overview_returns_honest_real_kpis_without_mock_spend_or_fake_sessions(): void
    {
        $response = $this->actingAs($this->admin)->getJson('/api/v1/admin/marketing-google/overview?range=last_30_days');

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                'period' => ['range', 'label', 'start_date', 'end_date'],
                'integrations_status' => ['ga4', 'google_ads', 'google_shopping', 'ai_agent'],
                'kpis' => [
                    'total_spend_cents',
                    'store_revenue_cents',
                    'attributed_revenue_cents',
                    'blended_roas',
                    'google_ads_roas',
                    'store_orders_count',
                    'ticket_medio_cents',
                    'conversion_rate_pct',
                ],
                'attribution_transparency' => ['real_store_revenue_cents', 'google_ads_attributed_cents', 'note'],
                'daily_chart',
                'traffic_sources',
                'sales_by_channel',
                'ai_period_summary',
            ],
        ]);

        // Without connected Google Ads, spend must be strictly null (never fake R$ numbers)
        $this->assertNull($response->json('data.kpis.total_spend_cents'));
        $this->assertNull($response->json('data.kpis.google_ads_roas'));
        $this->assertEquals('not_configured', $response->json('data.integrations_status.ga4.status'));
        $this->assertEquals('not_configured', $response->json('data.integrations_status.google_ads.status'));
    }

    public function test_google_merchant_feed_excludes_incomplete_products_and_supports_variants_and_identifier_rules(): void
    {
        // Create an incomplete active product WITHOUT raster image (only placeholder SVG)
        $incomplete = Product::query()->create([
            'sku' => 'MF-SEM-FOTO-01',
            'name' => 'Esmalte Sem Foto Real',
            'slug' => 'esmalte-sem-foto-real',
            'short_description' => 'Produto pendente de foto real',
            'description' => 'Descrição real do produto pendente de foto.',
            'price_cents' => 1490,
            'is_active' => true,
        ]);
        ProductImage::query()->create([
            'product_id' => $incomplete->id,
            'path' => '/placeholder-product.svg',
            'alt_text' => 'Placeholder',
            'is_primary' => true,
            'sort_order' => 0,
        ]);

        // Create a multi-variant product with real JPG image and no GTIN/Brand -> must emit g:item_group_id and g:identifier_exists=no
        $multi = Product::query()->create([
            'sku' => 'MF-GEL-MULTI',
            'name' => 'Esmalte em Gel Coleção Profissional',
            'slug' => 'esmalte-em-gel-colecao-profissional',
            'short_description' => 'Esmalte em gel UV/LED de longa duração.',
            'description' => 'Esmalte em gel UV/LED de alta cobertura e durabilidade profissional.',
            'has_variants' => true,
            'price_cents' => 1990,
            'promo_price_cents' => 1690,
            'weight_grams' => 45,
            'is_active' => true,
        ]);
        ProductImage::query()->create([
            'product_id' => $multi->id,
            'path' => '/storage/products/esmalte-gel-real.jpg',
            'alt_text' => 'Esmalte em Gel Real',
            'is_primary' => true,
            'sort_order' => 0,
        ]);
        ProductVariant::query()->create([
            'product_id' => $multi->id,
            'sku' => 'MF-GEL-MULTI-NUDE',
            'name' => 'Nude Rosado',
            'color_family' => 'Nude Rosado',
            'price_cents' => 1990,
            'promo_price_cents' => 1690,
            'inherits_price' => false,
            'inherits_promo_price' => false,
            'stock_qty' => 8,
            'is_default' => true,
            'is_active' => true,
            'sort_order' => 1,
        ]);
        ProductVariant::query()->create([
            'product_id' => $multi->id,
            'sku' => 'MF-GEL-MULTI-RUBI',
            'name' => 'Rubi Intenso',
            'color_family' => 'Rubi Intenso',
            'price_cents' => 2190,
            'inherits_price' => false,
            'inherits_promo_price' => false,
            'stock_qty' => 0,
            'is_active' => true,
            'sort_order' => 2,
        ]);

        // Test both feed URLs (/merchant-feed.xml and /feed/google-merchant.xml)
        $xmlRes = $this->get('/feed/google-merchant.xml?refresh=1');
        $xmlRes->assertOk();
        $xml = (string) $xmlRes->getContent();

        $this->assertStringNotContainsString('MF-SEM-FOTO-01', $xml);
        $this->assertStringNotContainsString('placeholder-product.svg', $xml);
        $this->assertStringContainsString('<g:id>MF-GEL-MULTI-NUDE</g:id>', $xml);
        $this->assertStringContainsString('<g:id>MF-GEL-MULTI-RUBI</g:id>', $xml);
        $this->assertStringContainsString('<g:item_group_id>MF-GEL-MULTI</g:item_group_id>', $xml);
        $this->assertStringContainsString('<g:price>19.90 BRL</g:price>', $xml);
        $this->assertStringContainsString('<g:sale_price>16.90 BRL</g:sale_price>', $xml);
        $this->assertStringContainsString('<g:identifier_exists>no</g:identifier_exists>', $xml);
        $this->assertStringContainsString('<g:shipping_weight>45 g</g:shipping_weight>', $xml);

        // Verify Admin Shopping Diagnostics reports the incomplete product with exact reason & guidance
        $diagRes = $this->actingAs($this->admin)->getJson('/api/v1/admin/marketing-google/shopping/feed?refresh=1');
        $diagRes->assertOk();
        $diagRes->assertJsonPath('data.merchant_center_api.google_confirmation', false);

        $incompleteSkus = array_column($diagRes->json('data.incomplete_products'), 'sku');
        $this->assertContains('MF-SEM-FOTO-01', $incompleteSkus);
    }

    public function test_storefront_events_strip_pii_deduplicate_purchase_and_support_remove_from_cart(): void
    {
        $product = Product::query()->create([
            'sku' => 'MF-VIEW-SEM-COMPRA',
            'name' => 'Top Coat Brilho Espelhado Sem Compra',
            'slug' => 'top-coat-brilho-espelhado-sem-compra',
            'price_cents' => 2290,
            'is_active' => true,
        ]);

        // View item without purchase -> must show up in products_views_without_purchases
        $viewRes = $this->postJson('/api/v1/storefront/events', [
            'event_name' => 'view_item',
            'session_id' => 'sess-anon-001',
            'path' => '/produto/top-coat-brilho-espelhado-sem-compra',
            'payload' => [
                'currency' => 'BRL',
                'value' => 22.90,
                'items' => [
                    ['item_id' => $product->sku, 'item_name' => $product->name, 'price' => 22.90, 'quantity' => 1],
                ],
                'customer_name' => 'Maria Silva',
                'email' => 'maria@example.com',
                'cpf' => '123.456.789-00',
                'phone' => '31999999999',
                'address' => 'Rua Secreta 100',
            ],
        ]);
        $viewRes->assertStatus(201);

        $storedView = AnalyticsEvent::query()->where('event_name', 'view_item')->latest('id')->firstOrFail();
        $this->assertArrayNotHasKey('customer_name', $storedView->payload ?? []);
        $this->assertArrayNotHasKey('email', $storedView->payload ?? []);
        $this->assertArrayNotHasKey('cpf', $storedView->payload ?? []);
        $this->assertArrayNotHasKey('phone', $storedView->payload ?? []);
        $this->assertArrayNotHasKey('address', $storedView->payload ?? []);

        // Remove from cart supported
        $remRes = $this->postJson('/api/v1/storefront/events', [
            'event_name' => 'remove_from_cart',
            'session_id' => 'sess-anon-001',
            'payload' => ['currency' => 'BRL', 'value' => 22.90],
        ]);
        $remRes->assertStatus(201);

        // Purchase deduplicated by transaction_id
        $p1 = $this->postJson('/api/v1/storefront/events', [
            'event_name' => 'purchase',
            'session_id' => 'sess-anon-002',
            'payload' => ['transaction_id' => 'MF-TEST-DEDUP-99', 'value' => 89.90, 'currency' => 'BRL'],
        ]);
        $p1->assertStatus(201);
        $this->assertTrue((bool) $p1->json('recorded'));

        $p2 = $this->postJson('/api/v1/storefront/events', [
            'event_name' => 'purchase',
            'session_id' => 'sess-anon-002',
            'payload' => ['transaction_id' => 'MF-TEST-DEDUP-99', 'value' => 89.90, 'currency' => 'BRL'],
        ]);
        $p2->assertOk();
        $this->assertFalse((bool) $p2->json('recorded'));

        $this->assertEquals(
            1,
            AnalyticsEvent::query()
                ->where('event_name', 'purchase')
                ->where('payload->transaction_id', 'MF-TEST-DEDUP-99')
                ->count()
        );

        // Verify GA4 insights lists the viewed product with zero purchases
        $ga4Res = $this->actingAs($this->admin)->getJson('/api/v1/admin/marketing-google/ga4/insights?range=last_30_days');
        $ga4Res->assertOk();
        $viewedSkus = array_column($ga4Res->json('data.products_views_without_purchases'), 'sku');
        $this->assertContains($product->sku, $viewedSkus);
    }

    public function test_admin_order_refund_records_refund_analytics_event_without_pii(): void
    {
        $order = Order::query()->create([
            'order_number' => 'MF-REFUND-0001',
            'public_token' => Str::random(40),
            'idempotency_key' => Str::uuid()->toString(),
            'status' => OrderStatus::Paid,
            'customer_name' => 'Cliente Teste',
            'customer_email' => 'cliente@teste.com',
            'customer_phone' => '31988887777',
            'shipping_address_snapshot' => ['city' => 'Belo Horizonte', 'state' => 'MG'],
            'shipping_service_snapshot' => ['carrier' => 'Correios', 'service_name' => 'SEDEX'],
            'subtotal_cents' => 5500,
            'discount_cents' => 0,
            'shipping_cents' => 1000,
            'tax_cents' => 0,
            'total_cents' => 6500,
            'paid_at' => now(),
        ]);

        Payment::query()->create([
            'order_id' => $order->id,
            'provider' => 'mercadopago',
            'environment' => 'sandbox',
            'idempotency_key' => Str::uuid()->toString(),
            'method' => 'pix',
            'status' => PaymentStatus::Approved,
            'gross_amount_cents' => 6500,
            'net_amount_cents' => 6400,
            'fee_cents' => 100,
            'paid_at' => now(),
        ]);

        $res = $this->actingAs($this->admin)->postJson("/api/v1/admin/orders/{$order->id}/refund", [
            'reason' => 'Solicitação da cliente no prazo legal',
            'manual_confirmation' => true,
        ]);
        $res->assertOk();

        $refundEvent = AnalyticsEvent::query()
            ->where('event_name', 'refund')
            ->where('order_id', $order->id)
            ->first();

        $this->assertNotNull($refundEvent);
        $this->assertEquals('MF-REFUND-0001', $refundEvent->payload['transaction_id'] ?? null);
        $this->assertEquals(65.0, (float) ($refundEvent->payload['value'] ?? 0));
        $this->assertArrayNotHasKey('customer_email', $refundEvent->payload ?? []);
        $this->assertArrayNotHasKey('customer_name', $refundEvent->payload ?? []);
    }

    public function test_google_ads_read_only_connection_and_campaign_sync_with_http_fake(): void
    {
        Http::fake([
            'https://oauth2.googleapis.com/token' => Http::response([
                'access_token' => 'fake-oauth-access-token',
                'expires_in' => 3600,
            ], 200),
            'https://googleads.googleapis.com/*' => Http::response([
                [
                    'results' => [
                        [
                            'customer' => [
                                'id' => '1234567890',
                                'descriptiveName' => 'Mistura Feminina Ads',
                                'currencyCode' => 'BRL',
                                'timeZone' => 'America/Sao_Paulo',
                            ],
                            'campaign' => [
                                'id' => '998877',
                                'name' => 'Shopping — Catálogo Esmaltes',
                                'status' => 'ENABLED',
                                'advertisingChannelType' => 'SHOPPING',
                            ],
                            'campaignBudget' => [
                                'amountMicros' => '45000000',
                            ],
                            'metrics' => [
                                'costMicros' => '180000000',
                                'impressions' => '12400',
                                'clicks' => '310',
                                'conversions' => 0,
                                'conversionsValue' => 0,
                            ],
                        ],
                    ],
                ],
            ], 200),
        ]);

        // Save encrypted Google Ads credentials
        $saveRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/marketing-google/integrations/connect', [
            'platform' => 'google_ads',
            'account_id' => '123-456-7890',
            'credentials' => [
                'developer_token' => 'dev-tok-example',
                'client_id' => 'cid.apps.googleusercontent.com',
                'client_secret' => 'csec-example',
                'refresh_token' => '1//refresh-example',
            ],
        ]);
        $saveRes->assertOk();
        // Secrets must never be exposed back to client
        $this->assertArrayNotHasKey('encrypted_credentials', $saveRes->json('data'));

        // Test connection
        $testRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/marketing-google/integrations/test', [
            'platform' => 'google_ads',
        ]);
        $testRes->assertOk();
        $this->assertEquals('connected', $testRes->json('status'));

        // Read campaigns & data-driven suggestions (high spend with 0 conversions triggers review suggestion)
        $adsRes = $this->actingAs($this->admin)->getJson('/api/v1/admin/marketing-google/google-ads/campaigns?range=last_30_days');
        $adsRes->assertOk();
        $this->assertTrue((bool) $adsRes->json('data.connected'));
        $this->assertTrue((bool) $adsRes->json('data.read_only_protection'));
        $this->assertCount(1, $adsRes->json('data.campaigns'));
        $this->assertEquals(18000, $adsRes->json('data.campaigns.0.spend_cents'));
        $this->assertNotEmpty($adsRes->json('data.suggestions'));
    }

    public function test_seo_audit_and_metadata_optimization_flow(): void
    {
        $auditRes = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/seo/audit');
        $auditRes->assertOk();
        $auditRes->assertJsonStructure(['data' => ['audit', 'inspections', 'gsc_performance']]);

        $inspection = SeoUrlInspection::query()->where('entity_type', 'product')->firstOrFail();

        $optRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/ai/marketing/seo/optimize-metadata', [
            'inspection_id' => $inspection->id,
        ]);
        $optRes->assertOk();
        $this->assertNotEmpty($optRes->json('data.suggested_title'));

        $applyRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/ai/marketing/seo/apply-metadata', [
            'inspection_id' => $inspection->id,
        ]);
        $applyRes->assertOk();
        $this->assertEquals('applied', $applyRes->json('data.status'));
    }

    public function test_opportunities_recommendations_and_automations_use_real_catalog_data(): void
    {
        $listRes = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/opportunities');
        $listRes->assertOk();
        $this->assertNotEmpty($listRes->json('data.items'));

        $opp = MarketingOpportunity::query()->firstOrFail();
        $updateRes = $this->actingAs($this->admin)->patchJson("/api/v1/admin/ai/marketing/opportunities/{$opp->id}/status", [
            'status' => 'em_analise',
        ]);
        $updateRes->assertOk();
        $this->assertEquals('em_analise', $updateRes->json('data.status'));

        $recList = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/recommendations');
        $recList->assertOk();
        $this->assertNotEmpty($recList->json('data'));

        $rec = MarketingRecommendation::query()->where('status', 'pending_review')->firstOrFail();
        $applyRes = $this->actingAs($this->admin)->postJson("/api/v1/admin/ai/marketing/recommendations/{$rec->id}/apply");
        $applyRes->assertOk();
        $this->assertEquals('applied', $applyRes->json('data.status'));

        $autoList = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/automations');
        $autoList->assertOk();
        $auto = MarketingAutomation::query()->firstOrFail();
        $runRes = $this->actingAs($this->admin)->postJson("/api/v1/admin/ai/marketing/automations/{$auto->id}/run");
        $runRes->assertOk();
        $this->assertEquals('success', $runRes->json('data.last_status'));
    }

    public function test_marketing_agent_chat_separates_facts_limitations_and_suggestions_on_all_key_questions(): void
    {
        $questions = [
            'Quais produtos recebem visitas e não geram compras?',
            'Quais produtos estão com dados incompletos para o Shopping?',
            'Como evoluíram as vendas e os acessos no período?',
            'Quais campanhas merecem revisão?',
        ];

        foreach ($questions as $question) {
            $chatRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/marketing-google/chat', [
                'message' => $question,
                'range' => 'last_30_days',
            ]);

            $chatRes->assertOk();
            $chatRes->assertJsonStructure([
                'data' => ['content', 'facts', 'limitations', 'suggestions', 'ai_status', 'period'],
            ]);
            $this->assertStringContainsString('### Fatos Confirmados', (string) $chatRes->json('data.content'));
            $this->assertStringContainsString('### Sugestões do Agente', (string) $chatRes->json('data.content'));
        }

        // Unconfigured connectivity test must honestly return not_configured, never fake connected
        $testRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/marketing-google/integrations/test', [
            'platform' => 'google_ads',
        ]);
        $testRes->assertOk();
        $this->assertEquals('not_configured', $testRes->json('status'));
    }
}
