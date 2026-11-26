<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Marketing\Services\GoogleAdsService;
use App\Domain\Marketing\Services\GoogleAnalyticsService;
use App\Domain\Marketing\Services\GoogleMerchantFeedService;
use App\Domain\Marketing\Services\MarketingAgentService;
use App\Domain\Marketing\Services\MarketingAutomationService;
use App\Domain\Marketing\Services\MarketingIntegrationsService;
use App\Domain\Marketing\Services\MarketingIntelligenceService;
use App\Domain\Marketing\Services\MarketingOpportunitiesService;
use App\Domain\Marketing\Services\MarketingReportService;
use App\Domain\Marketing\Services\MetaAdsService;
use App\Domain\Marketing\Services\SeoAuditService;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class AdminAiMarketingAgentController extends Controller
{
    public function __construct(
        private readonly MarketingIntelligenceService $intelligence,
        private readonly SeoAuditService $seoAudit,
        private readonly GoogleAdsService $googleAds,
        private readonly GoogleAnalyticsService $ga4,
        private readonly MetaAdsService $metaAds,
        private readonly MarketingOpportunitiesService $opportunitiesService,
        private readonly MarketingAgentService $agentService,
        private readonly MarketingAutomationService $automationsService,
        private readonly MarketingReportService $reportsService,
        private readonly MarketingIntegrationsService $integrationsService,
        private readonly GoogleMerchantFeedService $merchantFeedService,
    ) {}

    public function overview(Request $request): JsonResponse
    {
        $data = $this->intelligence->getOverview($request->all());

        return response()->json(['data' => $data]);
    }

    public function getChatHistory(Request $request): JsonResponse
    {
        $history = $this->agentService->getChatHistory($request->query('session_id'));

        return response()->json(['data' => $history]);
    }

    public function chat(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:2000'],
            'session_id' => ['nullable', 'string', 'max:64'],
            'range' => ['nullable', 'string', 'max:40'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date'],
        ]);

        $res = $this->agentService->chat(
            $validated['message'],
            $validated['session_id'] ?? null,
            $request->user(),
            [
                'range' => $validated['range'] ?? 'last_30_days',
                'start_date' => $validated['start_date'] ?? null,
                'end_date' => $validated['end_date'] ?? null,
            ]
        );

        return response()->json(['data' => $res]);
    }

    public function seoAudit(): JsonResponse
    {
        $data = $this->seoAudit->getLatestAudit();

        return response()->json(['data' => $data]);
    }

    public function runSeoAudit(Request $request): JsonResponse
    {
        $audit = $this->seoAudit->runAudit($request->user());

        return response()->json(['data' => $audit, 'message' => 'Auditoria técnica de SEO concluída com sucesso!']);
    }

    public function optimizeMetadata(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'inspection_id' => ['required', 'integer'],
        ]);

        $data = $this->seoAudit->optimizeMetadata((int) $validated['inspection_id']);

        return response()->json($data);
    }

    public function applyMetadata(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'inspection_id' => ['required', 'integer'],
        ]);

        $data = $this->seoAudit->applyMetadata((int) $validated['inspection_id']);

        return response()->json($data);
    }

    public function batchApplyMetadata(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'inspection_ids' => ['required', 'array'],
            'inspection_ids.*' => ['integer'],
        ]);

        $data = $this->seoAudit->batchApplyMetadata($validated['inspection_ids']);

        return response()->json($data);
    }

    public function googleAdsCampaigns(Request $request): JsonResponse
    {
        $data = $this->googleAds->getOverview($request->all());

        return response()->json(['data' => $data]);
    }

    public function addNegativeKeyword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'keyword' => ['required', 'string', 'max:120'],
        ]);

        $res = $this->googleAds->addNegativeKeyword($validated['keyword']);

        return response()->json($res);
    }

    public function draftGoogleAdsCampaign(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'topic' => ['nullable', 'string', 'max:200'],
            'daily_budget_brl' => ['nullable', 'numeric', 'min:5'],
        ]);

        $res = $this->googleAds->draftCampaignWithAi($validated);

        return response()->json($res, 201);
    }

    public function ga4Insights(Request $request): JsonResponse
    {
        $data = $this->ga4->getInsights($request->all());

        return response()->json(['data' => $data]);
    }

    public function shoppingFeed(Request $request): JsonResponse
    {
        $force = $request->boolean('refresh');
        $data = $this->merchantFeedService->getAdminDiagnostics($force);

        return response()->json(['data' => $data]);
    }

    public function refreshShoppingFeed(): JsonResponse
    {
        $data = $this->merchantFeedService->getAdminDiagnostics(true);

        return response()->json([
            'data' => $data,
            'message' => 'Feed do Google Merchant Center regerado e validado com os dados atuais do catálogo.',
        ]);
    }

    public function metaAdsCampaigns(): JsonResponse
    {
        $data = $this->metaAds->getOverview();

        return response()->json(['data' => $data]);
    }

    public function opportunities(Request $request): JsonResponse
    {
        $data = $this->opportunitiesService->list($request->all());

        return response()->json(['data' => $data]);
    }

    public function updateOpportunityStatus(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'string', 'in:nova,em_analise,aprovada,implementada,descartada'],
        ]);

        $opp = $this->opportunitiesService->updateStatus($id, $validated['status']);

        return response()->json(['data' => $opp, 'message' => 'Status da oportunidade atualizado!']);
    }

    public function scanOpportunities(): JsonResponse
    {
        $res = $this->opportunitiesService->scanCatalogOpportunities();

        return response()->json($res);
    }

    public function recommendations(): JsonResponse
    {
        $data = $this->agentService->getRecommendations();

        return response()->json(['data' => $data]);
    }

    public function applyRecommendation(Request $request, int $id): JsonResponse
    {
        $rec = $this->agentService->applyRecommendation($id, $request->user());

        return response()->json(['data' => $rec, 'message' => 'Recomendação aprovada e aplicada com sucesso!']);
    }

    public function discardRecommendation(int $id): JsonResponse
    {
        $rec = $this->agentService->discardRecommendation($id);

        return response()->json(['data' => $rec, 'message' => 'Recomendação descartada.']);
    }

    public function automations(): JsonResponse
    {
        $data = $this->automationsService->list();

        return response()->json(['data' => $data]);
    }

    public function saveAutomation(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:160'],
            'automation_type' => ['required', 'string', 'max:60'],
            'schedule' => ['required', 'string', 'in:hourly,daily,weekly'],
            'is_enabled' => ['required', 'boolean'],
            'parameters' => ['nullable', 'array'],
        ]);

        $res = $this->automationsService->save($validated);

        return response()->json(['data' => $res, 'message' => 'Automação salva com sucesso!']);
    }

    public function toggleAutomation(int $id): JsonResponse
    {
        $res = $this->automationsService->toggle($id);

        return response()->json(['data' => $res, 'message' => 'Status da automação alterado.']);
    }

    public function runAutomationNow(int $id): JsonResponse
    {
        $res = $this->automationsService->runNow($id);

        return response()->json($res);
    }

    public function reports(): JsonResponse
    {
        $data = $this->reportsService->list();

        return response()->json(['data' => $data]);
    }

    public function generateReport(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:200'],
            'period_range' => ['nullable', 'string'],
            'period_start' => ['nullable', 'date'],
            'period_end' => ['nullable', 'date'],
        ]);

        $res = $this->reportsService->generate($validated, $request->user());

        return response()->json(['data' => $res, 'message' => 'Relatório consolidado gerado com sucesso!']);
    }

    public function exportReport(int $id): Response
    {
        return $this->reportsService->exportCsv($id);
    }

    public function integrations(): JsonResponse
    {
        $data = $this->integrationsService->list();

        return response()->json(['data' => $data]);
    }

    public function saveIntegration(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'platform' => ['required', 'string'],
            'account_id' => ['nullable', 'string'],
            'account_name' => ['nullable', 'string'],
            'property_id' => ['nullable', 'string'],
            'pixel_id' => ['nullable', 'string'],
            'credentials' => ['nullable', 'array'],
            'encrypted_credentials' => ['nullable', 'array'],
            'settings' => ['nullable', 'array'],
        ]);

        if (! isset($validated['encrypted_credentials']) && isset($validated['credentials'])) {
            $validated['encrypted_credentials'] = $validated['credentials'];
        }

        $data = $this->integrationsService->connect($validated);

        return response()->json(['data' => $data, 'message' => 'Integração configurada com sucesso!']);
    }

    public function testIntegration(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'platform' => ['required', 'string'],
        ]);

        $res = $this->integrationsService->testConnection($validated['platform']);

        return response()->json($res);
    }
}
