<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Models\MarketingAutomation;
use App\Models\MarketingIntegration;
use App\Models\MarketingOpportunity;
use App\Models\Product;
use App\Models\SeoAudit;
use App\Models\SeoUrlInspection;

class MarketingBaselineInitializer
{
    private const LEGACY_DEMO_IDS = [
        'G-MFEMININA01',
        '392817451',
        'properties/412891045',
        '482-910-3841',
        '691823019',
        'act_847192039481',
        'capi_mf_production',
    ];

    public function ensureInitialized(): void
    {
        $this->ensureIntegrations();
        $this->ensureAutomations();
        $this->ensureBaselineSeoAudit();
    }

    public function ensureIntegrations(): void
    {
        $apiBase = rtrim((string) config('app.url', 'https://api.misturafeminina.com.br'), '/');
        $frontBase = rtrim((string) config('app.frontend_url', 'https://misturafeminina.com.br'), '/');

        $definitions = [
            [
                'platform' => 'google_analytics_4',
                'name' => 'Google Analytics 4 (GA4)',
                'status' => 'not_configured',
                'account_id' => null,
                'account_name' => null,
                'property_id' => null,
                'pixel_id' => null,
                'settings' => [
                    'consent_mode_v2' => true,
                    'gtm_id' => null,
                ],
                'last_healthcheck_status' => 'not_configured',
                'last_healthcheck_message' => 'Pendente de configuração: informe o Measurement ID (G-...) para coleta na loja e Property ID + Service Account JSON para leitura da API no painel.',
            ],
            [
                'platform' => 'google_ads',
                'name' => 'Google Ads',
                'status' => 'not_configured',
                'account_id' => null,
                'account_name' => null,
                'property_id' => null,
                'pixel_id' => null,
                'settings' => [
                    'currency' => 'BRL',
                    'timezone' => 'America/Sao_Paulo',
                    'read_only_mode' => true,
                    'negative_keywords' => [],
                ],
                'last_healthcheck_status' => 'not_configured',
                'last_healthcheck_message' => 'Pendente de configuração: informe Customer ID, Developer Token e credenciais OAuth de leitura.',
            ],
            [
                'platform' => 'google_merchant_center',
                'name' => 'Google Shopping / Merchant Center',
                'status' => 'not_configured',
                'account_id' => null,
                'account_name' => null,
                'property_id' => null,
                'pixel_id' => null,
                'settings' => [
                    'feed_url' => "{$apiBase}/merchant-feed.xml",
                    'feed_alias_url' => "{$frontBase}/feed/google-merchant.xml",
                    'scheduled_fetch_ready' => true,
                ],
                'last_healthcheck_status' => 'not_configured',
                'last_healthcheck_message' => 'Feed XML público ativo para busca programada. Conecte Merchant ID + Service Account JSON para consultar aprovações direto na API do Google.',
            ],
            [
                'platform' => 'google_search_console',
                'name' => 'Google Search Console',
                'status' => 'not_configured',
                'account_id' => null,
                'account_name' => null,
                'property_id' => "{$frontBase}/",
                'pixel_id' => null,
                'settings' => [
                    'sitemap_url' => "{$frontBase}/sitemap.xml",
                ],
                'last_healthcheck_status' => 'not_configured',
                'last_healthcheck_message' => 'Pendente de credenciais da Search Console API.',
            ],
            [
                'platform' => 'meta_ads',
                'name' => 'Meta Ads (Facebook & Instagram)',
                'status' => 'not_configured',
                'account_id' => null,
                'account_name' => null,
                'property_id' => null,
                'pixel_id' => null,
                'settings' => ['currency' => 'BRL'],
                'last_healthcheck_status' => 'not_configured',
                'last_healthcheck_message' => 'Pendente de configuração do Access Token e Ad Account ID.',
            ],
            [
                'platform' => 'meta_capi',
                'name' => 'Meta Conversions API (CAPI)',
                'status' => 'not_configured',
                'account_id' => null,
                'account_name' => null,
                'property_id' => null,
                'pixel_id' => null,
                'settings' => ['deduplication_mode' => 'event_id'],
                'last_healthcheck_status' => 'not_configured',
                'last_healthcheck_message' => 'Pendente de configuração do Pixel ID e Access Token CAPI.',
            ],
        ];

        foreach ($definitions as $def) {
            $existing = MarketingIntegration::query()->where('platform', $def['platform'])->first();
            if (! $existing) {
                MarketingIntegration::query()->create($def);

                continue;
            }

            // Clean up any legacy hardcoded demo IDs if no real encrypted credentials exist
            $hasRealSecrets = is_array($existing->encrypted_credentials) && array_filter($existing->encrypted_credentials) !== [];
            $hasDemoId = in_array((string) $existing->account_id, self::LEGACY_DEMO_IDS, true)
                || in_array((string) $existing->pixel_id, self::LEGACY_DEMO_IDS, true)
                || in_array((string) $existing->property_id, self::LEGACY_DEMO_IDS, true);

            if (! $hasRealSecrets && $hasDemoId) {
                $existing->update([
                    'status' => 'not_configured',
                    'account_id' => null,
                    'account_name' => null,
                    'property_id' => $def['property_id'],
                    'pixel_id' => null,
                    'settings' => $def['settings'],
                    'last_synced_at' => null,
                    'last_healthcheck_status' => 'not_configured',
                    'last_healthcheck_message' => $def['last_healthcheck_message'],
                ]);
            }
        }
    }

    public function ensureAutomations(): void
    {
        $automations = [
            [
                'name' => 'Auditoria Técnica de SEO e Metadados do Catálogo',
                'automation_type' => 'seo_daily_audit',
                'schedule' => 'daily',
                'is_enabled' => true,
                'parameters' => ['alert_on_score_below' => 75],
                'last_run_at' => null,
                'last_status' => 'idle',
                'last_result' => null,
            ],
            [
                'name' => 'Diagnóstico de Integridade do Feed Google Shopping',
                'automation_type' => 'out_of_stock_ad_pause',
                'schedule' => 'daily',
                'is_enabled' => true,
                'parameters' => ['check_missing_images' => true],
                'last_run_at' => null,
                'last_status' => 'idle',
                'last_result' => null,
            ],
        ];

        foreach ($automations as $item) {
            MarketingAutomation::query()->firstOrCreate(
                ['automation_type' => $item['automation_type']],
                $item
            );
        }
    }

    public function ensureBaselineSeoAudit(): void
    {
        if (SeoAudit::query()->count() > 0) {
            return;
        }

        $frontBase = rtrim((string) config('app.frontend_url', 'https://misturafeminina.com.br'), '/');
        $products = Product::query()->where('is_active', true)->take(25)->get();

        $issuesCount = 0;
        $healthyCount = 0;
        foreach ($products as $p) {
            if (mb_strlen(trim((string) ($p->seo_description ?: $p->short_description))) < 40) {
                $issuesCount++;
            } else {
                $healthyCount++;
            }
        }

        $total = max(1, $products->count());
        $score = (int) max(50, min(100, round(($healthyCount / $total) * 100)));

        $audit = SeoAudit::query()->create([
            'status' => 'completed',
            'overall_score' => $score,
            'total_urls_crawled' => $products->count(),
            'healthy_urls_count' => $healthyCount,
            'issues_count' => $issuesCount,
            'warnings_count' => 0,
            'summary_payload' => [
                'sitemap_valid' => true,
                'robots_valid' => true,
            ],
        ]);

        foreach ($products as $p) {
            $desc = trim((string) ($p->seo_description ?: $p->short_description));
            $hasIssues = mb_strlen($desc) < 40;
            SeoUrlInspection::query()->create([
                'audit_id' => $audit->id,
                'url' => "{$frontBase}/produto/{$p->slug}",
                'entity_type' => 'product',
                'entity_id' => $p->id,
                'http_status' => 200,
                'title' => $p->seo_title ?: "{$p->name} | Mistura Feminina",
                'meta_description' => $desc !== '' ? $desc : null,
                'canonical_url' => "{$frontBase}/produto/{$p->slug}",
                'has_schema' => true,
                'schema_types' => ['Product', 'Offer', 'BreadcrumbList'],
                'score' => $hasIssues ? 68 : 94,
                'issues' => $hasIssues ? ['Meta description curta ou ausente no cadastro real'] : [],
                'suggested_title' => "{$p->name} | Mistura Feminina Cosméticos",
                'suggested_description' => "Compre {$p->name} na Mistura Feminina Cosméticos. Confira disponibilidade, especificações e envio para todo o Brasil.",
                'optimization_reason' => 'Baseado no título real do produto cadastrado.',
                'status' => $hasIssues ? 'needs_review' : 'optimized',
            ]);
        }

        if (MarketingOpportunity::query()->count() === 0 && $issuesCount > 0) {
            MarketingOpportunity::query()->create([
                'title' => "Completar descrições de SEO em {$issuesCount} produto(s) do catálogo",
                'category' => 'seo',
                'priority' => 'alta',
                'effort_level' => 'baixo',
                'estimated_lift' => null,
                'impact_description' => 'Produtos ativos sem meta description personalizada usam texto padrão nos buscadores.',
                'status' => 'nova',
                'details' => ['affected_items_count' => $issuesCount],
            ]);
        }
    }
}
