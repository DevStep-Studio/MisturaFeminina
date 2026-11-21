<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Models\MarketingIntegration;

class MetaAdsService
{
    /** @return array<string, mixed> */
    public function getOverview(): array
    {
        $metaIntegration = MarketingIntegration::query()->where('platform', 'meta_ads')->first();
        $capiIntegration = MarketingIntegration::query()->where('platform', 'meta_capi')->first();

        $campaigns = [
            [
                'id' => 'cmp_m_01',
                'name' => 'Instagram Reels — Unhas e Esmaltação Perfeita',
                'status' => 'ACTIVE',
                'objective' => 'SALES_CONVERSIONS',
                'daily_budget_cents' => 6000,
                'spend_cents' => 171000,
                'reach' => 48200,
                'impressions' => 96400,
                'frequency' => 2.00,
                'clicks' => 1890,
                'cpc' => 0.90,
                'ctr' => 1.96,
                'purchases' => 77,
                'cost_per_purchase' => 22.21,
                'attributed_revenue_cents' => 754600,
                'roas' => 4.41,
            ],
            [
                'id' => 'cmp_m_02',
                'name' => 'Feed & Stories — Lançamento Silos de Cílios',
                'status' => 'ACTIVE',
                'objective' => 'SALES_CONVERSIONS',
                'daily_budget_cents' => 3500,
                'spend_cents' => 105000,
                'reach' => 31400,
                'impressions' => 68200,
                'frequency' => 2.17,
                'clicks' => 1140,
                'cpc' => 0.92,
                'ctr' => 1.67,
                'purchases' => 38,
                'cost_per_purchase' => 27.63,
                'attributed_revenue_cents' => 367500,
                'roas' => 3.50,
            ],
            [
                'id' => 'cmp_m_03',
                'name' => 'Remarketing — Carrinho Abandonado 7 Dias',
                'status' => 'ACTIVE',
                'objective' => 'SALES_CONVERSIONS',
                'daily_budget_cents' => 2000,
                'spend_cents' => 54000,
                'reach' => 6800,
                'impressions' => 24500,
                'frequency' => 3.60,
                'clicks' => 490,
                'cpc' => 1.10,
                'ctr' => 2.00,
                'purchases' => 26,
                'cost_per_purchase' => 20.77,
                'attributed_revenue_cents' => 280800,
                'roas' => 5.20,
            ],
        ];

        $creatives = [
            [
                'id' => 'crt_01',
                'name' => 'Reels: Passo a Passo Esmaltação Top Lirio',
                'format' => 'Instagram Reel (9:16)',
                'campaign' => 'Instagram Reels — Unhas e Esmaltação',
                'spend_cents' => 98000,
                'frequency' => 1.84,
                'ctr' => 2.34,
                'fatigue_status' => 'healthy',
                'recommendation' => 'Ótimo desempenho. Manter ativo.',
            ],
            [
                'id' => 'crt_02',
                'name' => 'Carrossel: Silo de Cílios e Colas Profissionais',
                'format' => 'Carrossel (1:1)',
                'campaign' => 'Feed & Stories — Lançamento Silos',
                'spend_cents' => 62000,
                'frequency' => 2.10,
                'ctr' => 1.85,
                'fatigue_status' => 'healthy',
                'recommendation' => 'Bom engajamento com lash designers.',
            ],
            [
                'id' => 'crt_03',
                'name' => 'Vídeo Banner: Desconto no Atacado 6+ Unidades',
                'format' => 'Stories (9:16)',
                'campaign' => 'Remarketing — Carrinho Abandonado',
                'spend_cents' => 45000,
                'frequency' => 3.75,
                'ctr' => 1.15,
                'fatigue_status' => 'fatigued',
                'recommendation' => 'Fadiga detectada: frequência alta (> 3.5) e queda no CTR. Recomendado atualizar criativo.',
            ],
        ];

        $capiAudit = [
            'pixel_id' => $capiIntegration?->pixel_id ?? '849201948291048',
            'status' => 'active',
            'deduplication_rate_pct' => 96.8,
            'event_match_quality' => 8.4,
            'server_events' => [
                ['event' => 'Purchase', 'browser_count' => 141, 'server_count' => 141, 'matched_pct' => 98.2, 'status' => 'optimal'],
                ['event' => 'InitiateCheckout', 'browser_count' => 412, 'server_count' => 405, 'matched_pct' => 96.4, 'status' => 'optimal'],
                ['event' => 'AddToCart', 'browser_count' => 890, 'server_count' => 870, 'matched_pct' => 95.8, 'status' => 'optimal'],
                ['event' => 'ViewContent', 'browser_count' => 4200, 'server_count' => 4050, 'matched_pct' => 94.2, 'status' => 'optimal'],
            ],
        ];

        return [
            'meta_integration' => $metaIntegration,
            'capi_integration' => $capiIntegration,
            'campaigns' => $campaigns,
            'creatives' => $creatives,
            'capi_audit' => $capiAudit,
        ];
    }
}
