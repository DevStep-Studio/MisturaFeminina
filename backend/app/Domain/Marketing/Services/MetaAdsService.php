<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Models\MarketingIntegration;

class MetaAdsService
{
    public function __construct(
        private readonly MarketingBaselineInitializer $initializer,
    ) {}

    /** @return array<string, mixed> */
    public function getOverview(): array
    {
        $this->initializer->ensureIntegrations();

        $metaIntegration = MarketingIntegration::query()->where('platform', 'meta_ads')->first();
        $capiIntegration = MarketingIntegration::query()->where('platform', 'meta_capi')->first();

        return [
            'meta_integration' => $metaIntegration ? [
                'id' => $metaIntegration->id,
                'platform' => $metaIntegration->platform,
                'name' => $metaIntegration->name,
                'status' => $metaIntegration->status,
                'account_id' => $metaIntegration->account_id,
                'last_healthcheck_message' => $metaIntegration->last_healthcheck_message,
            ] : null,
            'capi_integration' => $capiIntegration ? [
                'id' => $capiIntegration->id,
                'platform' => $capiIntegration->platform,
                'name' => $capiIntegration->name,
                'status' => $capiIntegration->status,
                'pixel_id' => $capiIntegration->pixel_id,
                'last_healthcheck_message' => $capiIntegration->last_healthcheck_message,
            ] : null,
            'campaigns' => [],
            'creatives' => [],
            'capi_audit' => [
                'pixel_id' => $capiIntegration?->pixel_id,
                'status' => $capiIntegration?->status ?? 'not_configured',
                'deduplication_rate_pct' => null,
                'event_match_quality' => null,
                'server_events' => [],
            ],
            'data_availability_notice' => 'Integração Meta Ads / CAPI pendente de configuração. Nenhuma campanha simulada é exibida.',
        ];
    }
}
