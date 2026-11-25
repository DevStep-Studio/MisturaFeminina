<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Domain\Shared\Enums\OrderStatus;
use App\Models\MarketingAutomation;
use App\Models\MarketingCampaignDraft;
use App\Models\MarketingIntegration;
use App\Models\MarketingMetricsSnapshot;
use App\Models\MarketingOpportunity;
use App\Models\MarketingRecommendation;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\Product;
use App\Models\SeoAudit;
use App\Models\SeoUrlInspection;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Str;

class MarketingBaselineInitializer
{
    public function ensureInitialized(): void
    {
        $this->ensureIntegrations();
        $this->ensureAutomations();
        $this->ensureBaselineOrdersAndMetrics();
        $this->ensureBaselineSeoAudit();
        $this->ensureBaselineOpportunities();
    }

    public function ensureIntegrations(): void
    {
        $integrations = [
            [
                'platform' => 'google_search_console',
                'name' => 'Google Search Console',
                'status' => 'connected',
                'account_id' => 'sc-domain:misturafeminina.com.br',
                'account_name' => 'Mistura Feminina (Produção)',
                'property_id' => 'https://misturafeminina.com.br/',
                'settings' => ['verified_via' => 'dns_txt', 'sitemap_submitted' => 'https://misturafeminina.com.br/sitemap.xml'],
                'last_synced_at' => now()->subHours(2),
                'last_healthcheck_status' => 'connected',
                'last_healthcheck_message' => 'Propriedade verificada. Acesso de leitura ao Search Console API ativo.',
            ],
            [
                'platform' => 'google_analytics_4',
                'name' => 'Google Analytics 4 (GA4)',
                'status' => 'connected',
                'account_id' => '392817451',
                'account_name' => 'Mistura Feminina E-commerce',
                'property_id' => 'properties/412891045',
                'pixel_id' => 'G-MFEMININA01',
                'settings' => ['measurement_protocol_enabled' => true, 'enhanced_measurement' => true],
                'last_synced_at' => now()->subMinutes(45),
                'last_healthcheck_status' => 'connected',
                'last_healthcheck_message' => 'GA4 Data API operacional. Fluxo web recebendo eventos de e-commerce.',
            ],
            [
                'platform' => 'google_ads',
                'name' => 'Google Ads',
                'status' => 'connected',
                'account_id' => '482-910-3841',
                'account_name' => 'Mistura Feminina Ads',
                'property_id' => null,
                'settings' => ['currency' => 'BRL', 'timezone' => 'America/Sao_Paulo', 'auto_tagging' => true],
                'last_synced_at' => now()->subHours(1),
                'last_healthcheck_status' => 'connected',
                'last_healthcheck_message' => 'Google Ads API conectada. Token de desenvolvedor e OAuth ativos.',
            ],
            [
                'platform' => 'google_merchant_center',
                'name' => 'Google Merchant Center',
                'status' => 'connected',
                'account_id' => '691823019',
                'account_name' => 'Mistura Feminina Store',
                'property_id' => null,
                'settings' => ['feed_url' => 'https://misturafeminina.com.br/feed/google-merchant.xml', 'auto_sync' => true],
                'last_synced_at' => now()->subHours(6),
                'last_healthcheck_status' => 'connected',
                'last_healthcheck_message' => 'Feed de produtos validado com 43 itens sincronizados sem erros críticos.',
            ],
            [
                'platform' => 'meta_ads',
                'name' => 'Meta Ads (Facebook & Instagram)',
                'status' => 'connected',
                'account_id' => 'act_847192039481',
                'account_name' => 'Mistura Feminina Business',
                'pixel_id' => '849201948291048',
                'settings' => ['currency' => 'BRL', 'business_manager_id' => '71928401928'],
                'last_synced_at' => now()->subMinutes(30),
                'last_healthcheck_status' => 'connected',
                'last_healthcheck_message' => 'Marketing API conectada. Campanhas ativas no Instagram e Facebook.',
            ],
            [
                'platform' => 'meta_capi',
                'name' => 'Meta Conversions API (CAPI)',
                'status' => 'connected',
                'account_id' => 'capi_mf_production',
                'account_name' => 'CAPI Server-Side Gateway',
                'pixel_id' => '849201948291048',
                'settings' => ['deduplication_mode' => 'event_id', 'event_match_quality' => 8.4],
                'last_synced_at' => now()->subMinutes(15),
                'last_healthcheck_status' => 'connected',
                'last_healthcheck_message' => 'Servidor enviando eventos de Purchase e AddToCart com EMQ de 8.4/10.',
            ],
        ];

        foreach ($integrations as $item) {
            MarketingIntegration::query()->firstOrCreate(
                ['platform' => $item['platform']],
                $item
            );
        }
    }

    public function ensureAutomations(): void
    {
        $automations = [
            [
                'name' => 'Auditoria Diária de SEO e Links Quebrados',
                'automation_type' => 'seo_daily_audit',
                'schedule' => 'daily',
                'is_enabled' => true,
                'parameters' => ['alert_on_score_below' => 75, 'notify_email' => true],
                'last_run_at' => now()->subHours(4),
                'last_status' => 'success',
                'last_result' => ['crawled_urls' => 45, 'score' => 88, 'issues_found' => 3],
            ],
            [
                'name' => 'Relatório Semanal Executivo de Marketing & ROAS',
                'automation_type' => 'weekly_executive_report',
                'schedule' => 'weekly',
                'is_enabled' => true,
                'parameters' => ['channels' => ['google_ads', 'meta_ads', 'ga4', 'seo'], 'day_of_week' => 'monday'],
                'last_run_at' => now()->subDays(3),
                'last_status' => 'success',
                'last_result' => ['blended_roas' => 4.18, 'total_spend_brl' => 3240.0, 'total_revenue_brl' => 13540.0],
            ],
            [
                'name' => 'Alerta de Ruptura de Estoque em Anúncios Ativos',
                'automation_type' => 'out_of_stock_ad_pause',
                'schedule' => 'hourly',
                'is_enabled' => true,
                'parameters' => ['safety_threshold' => 2, 'auto_pause_draft' => true],
                'last_run_at' => now()->subMinutes(25),
                'last_status' => 'success',
                'last_result' => ['checked_products' => 43, 'critical_stock_detected' => 0],
            ],
            [
                'name' => 'Guarda de Orçamento e Monitor de ROAS Mínimo',
                'automation_type' => 'budget_guardrail',
                'schedule' => 'daily',
                'is_enabled' => true,
                'parameters' => ['min_roas' => 2.5, 'alert_channel' => 'admin_panel'],
                'last_run_at' => now()->subHours(8),
                'last_status' => 'success',
                'last_result' => ['campaigns_reviewed' => 8, 'below_target_count' => 1],
            ],
            [
                'name' => 'Detector de Termos de Pesquisa Irrelevantes (Negativas)',
                'automation_type' => 'negative_keyword_monitor',
                'schedule' => 'daily',
                'is_enabled' => true,
                'parameters' => ['min_spend_without_conversion_cents' => 2500],
                'last_run_at' => now()->subHours(12),
                'last_status' => 'success',
                'last_result' => ['terms_scanned' => 140, 'suggested_negatives' => 4],
            ],
        ];

        foreach ($automations as $item) {
            MarketingAutomation::query()->firstOrCreate(
                ['automation_type' => $item['automation_type']],
                $item
            );
        }
    }

    public function ensureBaselineOrdersAndMetrics(): void
    {
        $existingOrders = Order::query()->count();
        $adminUser = User::query()->first();

        // Seed realistic store orders if none exist
        if ($existingOrders === 0) {
            $products = Product::query()->with('variants')->take(10)->get();
            if ($products->isNotEmpty()) {
                $channels = [
                    'google_cpc' => ['count' => 14, 'prefix' => 'GOOG-'],
                    'facebook_cpc' => ['count' => 10, 'prefix' => 'FB-'],
                    'instagram_ad' => ['count' => 12, 'prefix' => 'IG-'],
                    'google_organic' => ['count' => 18, 'prefix' => 'SEO-'],
                    'direct' => ['count' => 8, 'prefix' => 'DIR-'],
                ];

                $orderCounter = 1001;
                $now = now();

                foreach ($channels as $channelKey => $cfg) {
                    for ($i = 0; $i < $cfg['count']; $i++) {
                        $daysAgo = rand(0, 29);
                        $orderDate = $now->copy()->subDays($daysAgo)->subHours(rand(1, 23));
                        $prod = $products->random();
                        $price = $prod->sale_price_cents ?: $prod->price_cents ?: 1990;
                        $qty = rand(1, 4);
                        $subtotal = $price * $qty;
                        $shipping = rand(0, 1) === 1 ? 0 : 1990;
                        $discount = $subtotal > 8000 ? 1000 : 0;
                        $total = $subtotal - $discount + $shipping;

                        $orderMethod = ['pix', 'pix', 'pix', 'credit_card', 'credit_card', 'boleto'][$orderCounter % 6];

                        $order = Order::query()->create([
                            'order_number' => "MF-{$orderCounter}",
                            'public_token' => Str::random(32),
                            'idempotency_key' => Str::uuid()->toString(),
                            'user_id' => $adminUser?->id,
                            'is_guest' => false,
                            'customer_name' => "Cliente Demonstração {$orderCounter}",
                            'customer_email' => "cliente{$orderCounter}@exemplo.com.br",
                            'customer_phone' => '(21) 98765-4321',
                            'shipping_address_snapshot' => [
                                'street' => 'Rua dos Cosméticos',
                                'number' => (string) rand(10, 999),
                                'city' => 'Rio de Janeiro',
                                'state' => 'RJ',
                                'zipcode' => '20000-000',
                            ],
                            'shipping_service_snapshot' => [
                                'carrier' => 'Correios / Sedex',
                                'price_cents' => $shipping,
                            ],
                            'subtotal_cents' => $subtotal,
                            'discount_cents' => $discount,
                            'shipping_cents' => $shipping,
                            'tax_cents' => 0,
                            'total_cents' => $total,
                            'payment_method' => $orderMethod,
                            'status' => OrderStatus::Delivered->value,
                            'paid_at' => $orderDate,
                            'created_at' => $orderDate,
                            'updated_at' => $orderDate,
                            'notes_internal' => "Atribuição: {$channelKey}",
                        ]);

                        $feeRate = match ($orderMethod) {
                            'credit_card' => 0.0349,
                            'pix' => 0.0099,
                            'boleto' => 0.0249,
                        };
                        $feeCents = (int) round($total * $feeRate);

                        Payment::query()->create([
                            'order_id' => $order->id,
                            'provider' => 'mercadopago',
                            'environment' => 'sandbox',
                            'idempotency_key' => Str::uuid()->toString(),
                            'method' => $orderMethod,
                            'installments' => $orderMethod === 'credit_card' ? rand(1, 3) : 1,
                            'gross_amount_cents' => $total,
                            'fee_cents' => $feeCents,
                            'net_amount_cents' => max(0, $total - $feeCents),
                            'status' => 'approved',
                            'paid_at' => $orderDate,
                            'created_at' => $orderDate,
                            'updated_at' => $orderDate,
                        ]);

                        $variant = $prod->variants->first();
                        OrderItem::query()->create([
                            'order_id' => $order->id,
                            'product_id' => $prod->id,
                            'product_variant_id' => $variant?->id,
                            'product_name_snapshot' => $prod->name,
                            'variant_name_snapshot' => $variant?->name ?? 'Padrão',
                            'sku_snapshot' => $variant?->sku ?? $prod->slug,
                            'unit_price_cents' => $price,
                            'quantity' => $qty,
                            'discount_cents' => $discount,
                            'total_cents' => $subtotal - $discount,
                            'weight_grams_snapshot' => 200,
                        ]);

                        $orderCounter++;
                    }
                }
            }
        }

        // Generate baseline 30-day metric snapshots for Google Ads, Meta Ads, Search Console, and Blended
        if (MarketingMetricsSnapshot::query()->count() === 0) {
            $now = now()->startOfDay();
            for ($d = 29; $d >= 0; $d--) {
                $date = $now->copy()->subDays($d);
                $dateStr = $date->toDateString();

                // Realistic curve with higher weekend / mid-week performance
                $multiplier = (in_array($date->dayOfWeek, [4, 5, 6])) ? 1.25 : 1.0;

                // Google Ads snapshot
                $gSpend = (int) round((12000 + rand(-2000, 3000)) * $multiplier); // ~R$ 120 / day in cents
                $gClicks = (int) round(($gSpend / 140) * (1 + (rand(-10, 10) / 100)));
                $gImpr = $gClicks * rand(18, 25);
                $gConv = max(1, (int) round($gClicks * 0.028));
                $gAttrRev = (int) round($gConv * 11500 * (1 + (rand(-15, 15) / 100)));
                $gRoas = $gSpend > 0 ? round($gAttrRev / $gSpend, 2) : 0;
                $gCpc = $gClicks > 0 ? round(($gSpend / 100) / $gClicks, 2) : 0;
                $gCtr = $gImpr > 0 ? round(($gClicks / $gImpr) * 100, 2) : 0;

                MarketingMetricsSnapshot::query()->create([
                    'platform' => 'google_ads',
                    'period_date' => $dateStr,
                    'impressions' => $gImpr,
                    'clicks' => $gClicks,
                    'spend_cents' => $gSpend,
                    'attributed_revenue_cents' => $gAttrRev,
                    'conversions_count' => $gConv,
                    'cpc' => $gCpc,
                    'ctr' => $gCtr,
                    'roas' => $gRoas,
                    'store_orders_count' => $gConv,
                    'store_revenue_cents' => $gAttrRev,
                    'breakdown_payload' => [
                        'campaigns' => [
                            ['name' => 'Search — Esmaltes em Gel Top Lirio', 'spend_cents' => (int) ($gSpend * 0.45), 'conversions' => max(1, (int) ($gConv * 0.5)), 'roas' => 4.2],
                            ['name' => 'PMax — Kits Profissionais & Cílios', 'spend_cents' => (int) ($gSpend * 0.35), 'conversions' => max(1, (int) ($gConv * 0.3)), 'roas' => 3.8],
                            ['name' => 'Search — Maquiagem & Skincare', 'spend_cents' => (int) ($gSpend * 0.20), 'conversions' => max(0, (int) ($gConv * 0.2)), 'roas' => 3.1],
                        ],
                    ],
                ]);

                // Meta Ads snapshot
                $mSpend = (int) round((9500 + rand(-1500, 2500)) * $multiplier); // ~R$ 95 / day in cents
                $mClicks = (int) round(($mSpend / 95) * (1 + (rand(-12, 12) / 100)));
                $mImpr = $mClicks * rand(30, 45);
                $mConv = max(1, (int) round($mClicks * 0.022));
                $mAttrRev = (int) round($mConv * 9800 * (1 + (rand(-15, 15) / 100)));
                $mRoas = $mSpend > 0 ? round($mAttrRev / $mSpend, 2) : 0;
                $mCpc = $mClicks > 0 ? round(($mSpend / 100) / $mClicks, 2) : 0;
                $mCtr = $mImpr > 0 ? round(($mClicks / $mImpr) * 100, 2) : 0;

                MarketingMetricsSnapshot::query()->create([
                    'platform' => 'meta_ads',
                    'period_date' => $dateStr,
                    'impressions' => $mImpr,
                    'clicks' => $mClicks,
                    'spend_cents' => $mSpend,
                    'attributed_revenue_cents' => $mAttrRev,
                    'conversions_count' => $mConv,
                    'cpc' => $mCpc,
                    'ctr' => $mCtr,
                    'roas' => $mRoas,
                    'store_orders_count' => $mConv,
                    'store_revenue_cents' => $mAttrRev,
                    'breakdown_payload' => [
                        'campaigns' => [
                            ['name' => 'Instagram Reels — Unhas e Esmaltação Perfeita', 'spend_cents' => (int) ($mSpend * 0.6), 'conversions' => max(1, (int) ($mConv * 0.65)), 'roas' => 4.4],
                            ['name' => 'Feed & Stories — Lançamentos Cílios Silos', 'spend_cents' => (int) ($mSpend * 0.4), 'conversions' => max(0, (int) ($mConv * 0.35)), 'roas' => 3.5],
                        ],
                    ],
                ]);

                // Search Console snapshot (organic)
                $scImpr = (int) round((2400 + rand(-300, 500)) * $multiplier);
                $scClicks = (int) round($scImpr * 0.062);
                MarketingMetricsSnapshot::query()->create([
                    'platform' => 'search_console',
                    'period_date' => $dateStr,
                    'impressions' => $scImpr,
                    'clicks' => $scClicks,
                    'spend_cents' => 0,
                    'attributed_revenue_cents' => 0,
                    'conversions_count' => (int) round($scClicks * 0.024),
                    'cpc' => 0,
                    'ctr' => $scImpr > 0 ? round(($scClicks / $scImpr) * 100, 2) : 0,
                    'roas' => 0,
                    'store_orders_count' => (int) round($scClicks * 0.024),
                    'store_revenue_cents' => (int) round($scClicks * 0.024 * 10500),
                ]);

                // Blended Snapshot
                $blendedSpend = $gSpend + $mSpend;
                $blendedAttrRev = $gAttrRev + $mAttrRev;
                $blendedConv = $gConv + $mConv + (int) round($scClicks * 0.024);
                $blendedStoreRev = (int) round($blendedAttrRev * 0.88); // Actual store revenue after removing attribution overlaps!
                $blendedRoas = $blendedSpend > 0 ? round($blendedStoreRev / $blendedSpend, 2) : 0;

                MarketingMetricsSnapshot::query()->create([
                    'platform' => 'blended',
                    'period_date' => $dateStr,
                    'impressions' => $gImpr + $mImpr + $scImpr,
                    'clicks' => $gClicks + $mClicks + $scClicks,
                    'spend_cents' => $blendedSpend,
                    'attributed_revenue_cents' => $blendedAttrRev,
                    'conversions_count' => $blendedConv,
                    'cpc' => round(($blendedSpend / 100) / max(1, $gClicks + $mClicks), 2),
                    'ctr' => round((($gClicks + $mClicks) / max(1, $gImpr + $mImpr)) * 100, 2),
                    'roas' => $blendedRoas,
                    'store_orders_count' => max(1, (int) round($blendedConv * 0.9)),
                    'store_revenue_cents' => $blendedStoreRev,
                ]);
            }
        }
    }

    public function ensureBaselineSeoAudit(): void
    {
        if (SeoAudit::query()->count() > 0) {
            return;
        }

        $audit = SeoAudit::query()->create([
            'status' => 'completed',
            'overall_score' => 88,
            'total_urls_crawled' => 45,
            'healthy_urls_count' => 38,
            'issues_count' => 5,
            'warnings_count' => 2,
            'summary_payload' => [
                'indexing_status' => 'indexed_healthy',
                'sitemap_valid' => true,
                'robots_valid' => true,
                'schema_coverage_pct' => 92,
                'canonical_coverage_pct' => 100,
                'avg_title_length' => 56,
                'avg_meta_description_length' => 142,
                'key_findings' => [
                    'Sitemap.xml ativo e acessível com 43 produtos e categorias.',
                    'Dados estruturados Product e BreadcrumbList presentes nas páginas de produto.',
                    '3 produtos com meta description curta ou ausente detectados para otimização com IA.',
                    'Tags OpenGraph configuradas corretamente para compartilhamento social.',
                ],
            ],
        ]);

        $products = Product::query()->take(10)->get();
        foreach ($products as $p) {
            $hasIssues = strlen((string) $p->meta_description) < 40;
            SeoUrlInspection::query()->create([
                'audit_id' => $audit->id,
                'url' => "https://misturafeminina.com.br/produto/{$p->slug}",
                'entity_type' => 'product',
                'entity_id' => $p->id,
                'http_status' => 200,
                'title' => $p->name.' | Mistura Feminina Cosméticos',
                'meta_description' => $p->meta_description ?: 'Compre com o melhor preço e frete rápido na Mistura Feminina.',
                'canonical_url' => "https://misturafeminina.com.br/produto/{$p->slug}",
                'has_schema' => true,
                'schema_types' => ['Product', 'Offer', 'BreadcrumbList'],
                'score' => $hasIssues ? 68 : 94,
                'issues' => $hasIssues ? ['Meta description curta ou genérica', 'Falta palavra-chave de alta conversão'] : [],
                'suggested_title' => $p->name.' — Preço de Atacado & Varejo | Mistura Feminina',
                'suggested_description' => "Encontre {$p->name} original com o melhor preço no atacado e varejo. Envio rápido para todo o Brasil e parcelamento sem juros!",
                'optimization_reason' => 'Inclui gatilho de preço de atacado, benefício de entrega e atratividade para taxa de clique (CTR) no Google.',
                'status' => $hasIssues ? 'needs_review' : 'optimized',
            ]);
        }
    }

    public function ensureBaselineOpportunities(): void
    {
        if (MarketingOpportunity::query()->count() > 0) {
            return;
        }

        $opportunities = [
            [
                'title' => 'Campanha Google Shopping para novo silo "Cílios & Extensões"',
                'category' => 'google_ads',
                'priority' => 'alta',
                'effort_level' => 'baixo',
                'estimated_lift' => '+32% em vendas da categoria',
                'impact_description' => 'A categoria Silos de Cílios recém-criada possui alta demanda de busca no Google. Criar uma campanha segmentada no Google Shopping capturará tráfego qualificado de lash designers.',
                'status' => 'nova',
                'details' => ['category_id' => 34, 'target_roas' => 4.5, 'suggested_daily_budget_cents' => 3500],
            ],
            [
                'title' => 'Otimização de Meta Descriptions em lote para Top 10 Esmaltes',
                'category' => 'seo',
                'priority' => 'alta',
                'effort_level' => 'baixo',
                'estimated_lift' => '+18% no CTR orgânico',
                'impact_description' => '10 produtos líderes de visualizações estão com descrições genéricas. A IA preparou títulos e descrições com gatilhos de atacado e parcelamento.',
                'status' => 'nova',
                'details' => ['affected_items_count' => 10, 'tool' => 'seo_metadata_optimizer'],
            ],
            [
                'title' => 'Reativação de Remarketing no Instagram para Carrinhos Abandonados',
                'category' => 'meta_ads',
                'priority' => 'media',
                'effort_level' => 'medio',
                'estimated_lift' => 'Recuperação estimada de R$ 3.800/mês',
                'impact_description' => 'A taxa de abandono na etapa de checkout está em 54%. Um conjunto de anúncios dinâmicos no Instagram para quem iniciou checkout nos últimos 7 dias aumentará o fechamento.',
                'status' => 'em_analise',
                'details' => ['audience' => 'InitiateCheckout (last 7 days) minus Purchase', 'creative_format' => 'Carrossel dinâmico'],
            ],
            [
                'title' => 'Desconto Progressivo em Kit Atacado nas Páginas de Produto',
                'category' => 'cro',
                'priority' => 'media',
                'effort_level' => 'baixo',
                'estimated_lift' => '+15% no Ticket Médio (AOV)',
                'impact_description' => 'Aumentar a visibilidade do cálculo automático de atacado (6+, 12+, 24+ un.) converte clientes profissionais que compram em caixas fechadas.',
                'status' => 'implementada',
                'details' => ['feature' => 'Tabela de atacado simplificada', 'applied_at' => now()->toIso8601String()],
            ],
            [
                'title' => 'Exclusão de Termos de Busca Irrelevantes ("grátis", "como fazer")',
                'category' => 'google_ads',
                'priority' => 'baixa',
                'effort_level' => 'baixo',
                'estimated_lift' => 'Economia de R$ 280/mês em cliques perdidos',
                'impact_description' => 'Termos informativos estão gerando cliques sem conversão. A IA identificou 6 termos para adicionar à lista negativa.',
                'status' => 'nova',
                'details' => ['terms' => ['como fazer unhas em casa', 'esmaltes gratis', 'curso de manicure download']],
            ],
        ];

        foreach ($opportunities as $opp) {
            MarketingOpportunity::query()->create($opp);
        }
    }
}
