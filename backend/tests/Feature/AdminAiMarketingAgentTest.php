<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Domain\Shared\Enums\RoleSlug;
use App\Models\MarketingAutomation;
use App\Models\MarketingOpportunity;
use App\Models\MarketingRecommendation;
use App\Models\Product;
use App\Models\Role;
use App\Models\SeoUrlInspection;
use App\Models\User;
use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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

    public function test_marketing_overview_returns_unified_kpis_and_attribution(): void
    {
        $response = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/overview?range=last_30_days');

        $response->assertOk();
        $response->assertJsonStructure([
            'data' => [
                'period' => ['range', 'label', 'start_date', 'end_date'],
                'kpis' => [
                    'total_spend_cents',
                    'store_revenue_cents',
                    'attributed_revenue_cents',
                    'blended_roas',
                    'google_ads_roas',
                    'meta_ads_roas',
                    'store_orders_count',
                    'ticket_medio_cents',
                    'conversion_rate_pct',
                    'organic_clicks',
                ],
                'attribution_transparency' => ['real_store_revenue_cents', 'google_ads_attributed_cents', 'meta_ads_attributed_cents', 'note'],
                'daily_chart',
                'traffic_sources',
                'sales_by_channel',
                'ai_period_summary',
            ],
        ]);
    }

    public function test_seo_audit_and_metadata_optimization_flow(): void
    {
        $auditRes = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/seo/audit');
        $auditRes->assertOk();
        $auditRes->assertJsonStructure(['data' => ['audit', 'inspections', 'gsc_performance']]);

        $inspection = SeoUrlInspection::query()->where('entity_type', 'product')->firstOrFail();

        // Optimize metadata
        $optRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/ai/marketing/seo/optimize-metadata', [
            'inspection_id' => $inspection->id,
        ]);
        $optRes->assertOk();
        $this->assertNotEmpty($optRes->json('data.suggested_title'));

        // Apply metadata
        $applyRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/ai/marketing/seo/apply-metadata', [
            'inspection_id' => $inspection->id,
        ]);
        $applyRes->assertOk();
        $this->assertEquals('applied', $applyRes->json('data.status'));
    }

    public function test_google_ads_search_terms_and_campaign_drafting(): void
    {
        $overview = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/google-ads/campaigns');
        $overview->assertOk();
        $overview->assertJsonStructure(['data' => ['campaigns', 'search_terms', 'negative_keywords']]);

        // Add negative keyword
        $negRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/ai/marketing/google-ads/negative-keyword', [
            'keyword' => 'curso gratis de manicure',
        ]);
        $negRes->assertOk();

        // Draft campaign
        $draftRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/ai/marketing/google-ads/draft-campaign', [
            'topic' => 'Esmaltes em Gel Top Lirio',
            'daily_budget_brl' => 50.0,
        ]);
        $draftRes->assertStatus(201);
        $draftRes->assertJsonPath('data.campaign_type', 'search');
        $this->assertNotEmpty($draftRes->json('data.ad_groups'));
    }

    public function test_ga4_insights_and_meta_ads_capi_status(): void
    {
        $ga4Res = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/ga4/insights');
        $ga4Res->assertOk();
        $ga4Res->assertJsonStructure(['data' => ['acquisition_channels', 'funnel_steps', 'funnel_summary', 'events_audit']]);

        $metaRes = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/meta-ads/campaigns');
        $metaRes->assertOk();
        $metaRes->assertJsonStructure(['data' => ['campaigns', 'creatives', 'capi_audit']]);
    }

    public function test_opportunities_pipeline_and_status_update(): void
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
    }

    public function test_ai_recommendations_approval_workflow(): void
    {
        $listRes = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/recommendations');
        $listRes->assertOk();
        $this->assertNotEmpty($listRes->json('data'));

        $rec = MarketingRecommendation::query()->where('status', 'pending_review')->firstOrFail();

        $applyRes = $this->actingAs($this->admin)->postJson("/api/v1/admin/ai/marketing/recommendations/{$rec->id}/apply");
        $applyRes->assertOk();
        $this->assertEquals('applied', $applyRes->json('data.status'));
    }

    public function test_automations_toggle_and_run_now(): void
    {
        $listRes = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/automations');
        $listRes->assertOk();

        $auto = MarketingAutomation::query()->firstOrFail();

        $toggleRes = $this->actingAs($this->admin)->patchJson("/api/v1/admin/ai/marketing/automations/{$auto->id}/toggle");
        $toggleRes->assertOk();

        $runRes = $this->actingAs($this->admin)->postJson("/api/v1/admin/ai/marketing/automations/{$auto->id}/run");
        $runRes->assertOk();
        $this->assertEquals('success', $runRes->json('data.last_status'));
    }

    public function test_interactive_marketing_copilot_chat(): void
    {
        $chatRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/ai/marketing/chat', [
            'message' => 'Como está o ROAS do Google Ads e onde podemos economizar?',
        ]);

        $chatRes->assertOk();
        $this->assertNotEmpty($chatRes->json('data.content'));
        $this->assertStringContainsString('Google Ads', $chatRes->json('data.content'));
    }

    public function test_integrations_list_and_connectivity_test(): void
    {
        $intRes = $this->actingAs($this->admin)->getJson('/api/v1/admin/ai/marketing/integrations');
        $intRes->assertOk();
        $this->assertCount(6, $intRes->json('data'));

        $testRes = $this->actingAs($this->admin)->postJson('/api/v1/admin/ai/marketing/integrations/test', [
            'platform' => 'google_ads',
        ]);
        $testRes->assertOk();
        $this->assertEquals('connected', $testRes->json('status'));
    }
}
