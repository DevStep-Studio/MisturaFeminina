<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Admin\Services\IntelligentReportsService;
use App\Domain\AI\Services\AIProviderService;
use App\Domain\AI\Services\AIUsageTracker;
use App\Domain\AI\Services\CustomerSupportAgent;
use App\Domain\AI\Services\GoogleProductSearchService;
use App\Domain\AI\Services\InventoryReplenishmentAgent;
use App\Domain\AI\Services\ProductCatalogAgent;
use App\Domain\AI\Services\ProductWebLookupService;
use App\Domain\Media\Services\MediaUploadService;
use App\Http\Controllers\Controller;
use App\Jobs\RunAiReplenishmentAnalysisJob;
use App\Models\AiAgent;
use App\Models\AiExecution;
use App\Models\AiExecutionEvent;
use App\Models\AiProductImport;
use App\Models\AiProductImportItem;
use App\Models\AiReplenishmentAnalysis;
use App\Models\AiReplenishmentSuggestion;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rule;

class AdminAiAgentController extends Controller
{
    public function __construct(
        private readonly AIProviderService $provider,
        private readonly AIUsageTracker $tracker,
        private readonly CustomerSupportAgent $supportAgent,
        private readonly ProductCatalogAgent $catalogAgent,
        private readonly ProductWebLookupService $webLookup,
        private readonly GoogleProductSearchService $googleSearch,
        private readonly MediaUploadService $media,
        private readonly InventoryReplenishmentAgent $replenishmentAgent,
        private readonly IntelligentReportsService $reports,
    ) {}

    public function overview(): JsonResponse
    {
        return response()->json(['data' => $this->tracker->overviewPayload()]);
    }

    public function executions(Request $request): JsonResponse
    {
        $query = AiExecution::query()
            ->with(['agent:id,slug,name,type', 'user:id,name'])
            ->latest('id');

        if ($request->filled('agent')) {
            $slug = (string) $request->query('agent');
            $query->whereHas('agent', fn ($q) => $q->where('slug', $slug));
        }
        if ($request->filled('status')) {
            $query->where('status', (string) $request->query('status'));
        }

        return response()->json($query->paginate(25));
    }

    public function showExecution(int $id): JsonResponse
    {
        $execution = AiExecution::query()
            ->with(['agent', 'user:id,name', 'events'])
            ->findOrFail($id);

        return response()->json(['data' => $execution]);
    }

    public function logs(): JsonResponse
    {
        $events = AiExecutionEvent::query()
            ->with(['execution:id,agent_id,user_id,status,provider,model_name', 'execution.agent:id,slug,name', 'execution.user:id,name'])
            ->latest('id')
            ->limit(100)
            ->get();

        $failed = AiExecution::query()
            ->where('status', 'failed')
            ->with(['agent:id,name', 'user:id,name'])
            ->latest('id')
            ->limit(25)
            ->get();

        return response()->json([
            'data' => [
                'events' => $events,
                'recent_failures' => $failed,
                'usage_today' => [
                    'executions_count' => AiExecution::query()->where('created_at', '>=', now()->startOfDay())->count(),
                    'total_tokens' => (int) AiExecution::query()->where('created_at', '>=', now()->startOfDay())->sum('total_tokens'),
                    'estimated_cost_usd' => round((float) AiExecution::query()->where('created_at', '>=', now()->startOfDay())->sum('estimated_cost_usd'), 4),
                ],
            ],
        ]);
    }

    public function getSettings(): JsonResponse
    {
        $this->tracker->ensureAgentsSeeded();

        return response()->json([
            'data' => [
                'config' => $this->provider->getConfig(),
                'connection' => $this->provider->connectionStatus(),
                'search_connection' => $this->googleSearch->connectionStatus(),
                'agents' => AiAgent::query()->orderBy('id')->get(),
            ],
        ]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'config' => ['sometimes', 'array'],
            'config.provider' => ['sometimes', 'string', 'max:40'],
            'config.base_url' => ['sometimes', 'url', 'max:255'],
            'config.support_model' => ['sometimes', 'string', 'max:80'],
            'config.catalog_model' => ['sometimes', 'string', 'max:80'],
            'config.replenishment_model' => ['sometimes', 'string', 'max:80'],
            'config.max_tokens_per_operation' => ['sometimes', 'integer', 'min:200', 'max:16000'],
            'config.timeout_seconds' => ['sometimes', 'integer', 'min:3', 'max:120'],
            'config.max_retries' => ['sometimes', 'integer', 'min:0', 'max:5'],
            'config.daily_execution_limit' => ['sometimes', 'integer', 'min:1', 'max:10000'],
            'config.daily_user_limit' => ['sometimes', 'integer', 'min:1', 'max:5000'],
            'config.daily_budget_usd' => ['sometimes', 'numeric', 'min:0', 'max:1000'],
            'config.max_file_size_kb' => ['sometimes', 'integer', 'min:128', 'max:20480'],
            'config.max_batch_rows' => ['sometimes', 'integer', 'min:10', 'max:2000'],
            'config.default_margin_pct' => ['sometimes', 'numeric', 'min:0', 'max:500'],
            'config.default_lead_time_days' => ['sometimes', 'integer', 'min:1', 'max:60'],
            'config.safety_stock_days' => ['sometimes', 'integer', 'min:1', 'max:30'],
            'config.target_coverage_days' => ['sometimes', 'integer', 'min:7', 'max:90'],
            'config.auto_replenishment_schedule' => ['sometimes', Rule::in(['daily', 'weekly', 'manual'])],
            'config.auto_replenishment_time' => ['sometimes', 'string', 'max:10'],
            'config.naming_pattern' => ['sometimes', 'string', 'max:150'],
            'agents' => ['sometimes', 'array'],
            'agents.*.slug' => ['required', 'string', 'max:60'],
            'agents.*.enabled' => ['sometimes', 'boolean'],
            'agents.*.model_name' => ['sometimes', 'string', 'max:80'],
        ]);

        if (! empty($validated['config']) && is_array($validated['config'])) {
            $this->provider->updateConfig($validated['config']);
        }

        if (! empty($validated['agents']) && is_array($validated['agents'])) {
            foreach ($validated['agents'] as $agentInput) {
                /** @var AiAgent|null $agent */
                $agent = AiAgent::query()->where('slug', $agentInput['slug'])->first();
                if ($agent) {
                    $agent->update([
                        'enabled' => array_key_exists('enabled', $agentInput) ? (bool) $agentInput['enabled'] : $agent->enabled,
                        'model_name' => $agentInput['model_name'] ?? $agent->model_name,
                        'version' => $agent->version + 1,
                    ]);
                }
            }
        }

        return $this->getSettings();
    }

    public function testConnection(Request $request): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $result = $this->provider->testConnection($actor);

        return response()->json(['data' => $result]);
    }

    // -------------------------------------------------------------------------
    // Agente 01: Atendimento em Pedidos
    // -------------------------------------------------------------------------

    public function prepareOrderReply(Request $request, int $orderId): JsonResponse
    {
        $validated = $request->validate([
            'instruction' => ['nullable', 'string', 'max:1000'],
            'tone_length' => ['nullable', Rule::in(['short', 'normal', 'detailed'])],
            'save_internal_note' => ['nullable', 'boolean'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $order = Order::query()->findOrFail($orderId);

        return response()->json([
            'data' => $this->supportAgent->prepareOrderReply($order, $actor, $validated),
        ]);
    }

    public function summarizeOrderHistory(Request $request, int $orderId): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $order = Order::query()->findOrFail($orderId);

        return response()->json([
            'data' => $this->supportAgent->summarizeOrderHistory($order, $actor),
        ]);
    }

    public function analyzeOrderOccurrences(Request $request, int $orderId): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $order = Order::query()->findOrFail($orderId);

        return response()->json([
            'data' => $this->supportAgent->analyzeOccurrences($order, $actor),
        ]);
    }

    // -------------------------------------------------------------------------
    // Agente 02: Cadastro Inteligente de Produtos
    // -------------------------------------------------------------------------

    public function listCatalogImports(): JsonResponse
    {
        $imports = AiProductImport::query()
            ->with(['user:id,name', 'approvedBy:id,name'])
            ->latest('id')
            ->limit(40)
            ->get();

        return response()->json(['data' => $imports]);
    }

    public function createCatalogImport(Request $request): JsonResponse
    {
        $cfg = $this->provider->getConfig();
        $maxKb = max(512, (int) ($cfg['max_file_size_kb'] ?? 5120));

        $validated = $request->validate([
            'import_id' => ['nullable', 'integer', 'exists:ai_product_imports,id'],
            'raw_text' => ['nullable', 'string', 'max:300000'],
            'instruction' => ['nullable', 'string', 'max:4000'],
            'files' => ['nullable', 'array', 'max:10'],
            'files.*' => ['file', 'mimes:csv,txt,tsv,xlsx,pdf,jpg,jpeg,png,webp', "max:{$maxKb}"],
        ]);

        $uploaded = $request->file('files', []);
        $files = $uploaded instanceof UploadedFile ? [$uploaded] : array_values($uploaded);

        if ($files === [] && empty($validated['raw_text']) && empty($validated['instruction'])) {
            return response()->json([
                'message' => 'Envie ao menos um arquivo (.xlsx, .csv, .pdf, imagem), tabela colada ou instrução textual.',
            ], 422);
        }

        /** @var User $actor */
        $actor = $request->user();
        $import = $this->catalogAgent->processImport($actor, $files, $validated);

        return response()->json(['data' => $import], 201);
    }

    public function showCatalogImport(int $id): JsonResponse
    {
        $import = AiProductImport::query()
            ->with(['items', 'user:id,name', 'approvedBy:id,name'])
            ->findOrFail($id);

        return response()->json(['data' => $import]);
    }

    public function updateCatalogImportItem(Request $request, int $id, int $itemId): JsonResponse
    {
        $import = AiProductImport::query()->findOrFail($id);
        /** @var AiProductImportItem $item */
        $item = $import->items()->where('id', $itemId)->firstOrFail();

        $validated = $request->validate([
            'product_name' => ['sometimes', 'string', 'max:190'],
            'product_line' => ['sometimes', 'nullable', 'string', 'max:120'],
            'brand_id' => ['sometimes', 'nullable', 'integer', 'exists:brands,id'],
            'brand_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'category_id' => ['sometimes', 'nullable', 'integer', 'exists:categories,id'],
            'category_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'variant_name' => ['sometimes', 'string', 'max:120'],
            'shade_code' => ['sometimes', 'nullable', 'string', 'max:40'],
            'color_family' => ['sometimes', 'nullable', 'string', 'max:60'],
            'color_hex' => ['sometimes', 'nullable', 'string', 'max:20'],
            'volume' => ['sometimes', 'nullable', 'string', 'max:40'],
            'supplier_code' => ['sometimes', 'nullable', 'string', 'max:80'],
            'sku' => ['sometimes', 'string', 'max:80'],
            'gtin' => ['sometimes', 'nullable', 'string', 'max:40'],
            'power_watts' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:5000'],
            'shipping_weight_grams' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:50000'],
            'price_cents' => ['sometimes', 'integer', 'min:0'],
            'cost_price_cents' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'suggested_retail_price_cents' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'price_meaning' => ['sometimes', Rule::in(['cost', 'supplier_suggested', 'sale'])],
            'apply_pack_conversion' => ['sometimes', 'boolean'],
            'selling_unit' => ['sometimes', 'nullable', 'string', 'max:40'],
            'promo_price_cents' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'stock_qty' => ['sometimes', 'integer', 'min:0'],
            'short_description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'description' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'seo_title' => ['sometimes', 'nullable', 'string', 'max:160'],
            'seo_description' => ['sometimes', 'nullable', 'string', 'max:200'],
            'group_key' => ['sometimes', 'string', 'max:140'],
            'ungroup' => ['sometimes', 'boolean'],
            'matched_product_id' => ['sometimes', 'nullable', 'integer', 'exists:products,id'],
            'resolution_choice' => ['sometimes', Rule::in(['create_new', 'update_existing', 'ignore', 'manual_review'])],
        ]);

        $updated = $this->catalogAgent->updateDraftItem($item, $validated);

        return response()->json(['data' => $updated]);
    }

    public function bulkUpdateCatalogImportItems(Request $request, int $id): JsonResponse
    {
        $import = AiProductImport::query()->findOrFail($id);
        $validated = $request->validate([
            'item_ids' => ['required', 'array', 'min:1', 'max:200'],
            'item_ids.*' => ['integer'],
            'brand_id' => ['sometimes', 'nullable', 'integer', 'exists:brands,id'],
            'brand_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'category_id' => ['sometimes', 'nullable', 'integer', 'exists:categories,id'],
            'category_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'product_line' => ['sometimes', 'nullable', 'string', 'max:120'],
            'resolution_choice' => ['sometimes', Rule::in(['create_new', 'update_existing', 'ignore', 'manual_review'])],
            'ungroup' => ['sometimes', 'boolean'],
        ]);

        $itemIds = array_map('intval', $validated['item_ids']);
        unset($validated['item_ids']);
        $updated = $this->catalogAgent->bulkUpdateDraftItems($import, $itemIds, $validated);

        return response()->json([
            'data' => $updated,
            'import' => $import->fresh(['items', 'user:id,name', 'approvedBy:id,name']),
        ]);
    }

    public function approveCatalogImport(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'item_ids' => ['nullable', 'array'],
            'item_ids.*' => ['integer'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $import = AiProductImport::query()->findOrFail($id);

        $itemIds = isset($validated['item_ids']) ? array_map('intval', $validated['item_ids']) : null;
        $idempotencyKey = ! empty($validated['idempotency_key'])
            ? (string) $validated['idempotency_key']
            : ($request->header('X-Idempotency-Key') ?: null);
        $summary = $this->catalogAgent->commitApprovedImport($import, $actor, $itemIds, $idempotencyKey);

        return response()->json(['data' => $summary]);
    }

    public function discardCatalogImport(int $id): JsonResponse
    {
        $import = AiProductImport::query()->findOrFail($id);
        $import->update(['status' => 'discarded']);

        return response()->json(['data' => $import->fresh()]);
    }

    public function assistSingleProduct(Request $request, int $productId): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', Rule::in(['improve_description', 'audit_catalog', 'check_duplicates'])],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $product = Product::query()->findOrFail($productId);

        return response()->json([
            'data' => $this->catalogAgent->assistSingleProduct($product, $actor, (string) $validated['action']),
        ]);
    }

    public function generateProductDescription(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'product_id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'min:2', 'max:220'],
            'sku' => ['nullable', 'string', 'max:80'],
            'gtin' => ['nullable', 'string', 'max:40'],
            'brand_name' => ['nullable', 'string', 'max:120'],
            'category_path' => ['nullable', 'string', 'max:255'],
            'unit_label' => ['nullable', 'string', 'max:80'],
            'weight_grams' => ['nullable', 'integer', 'min:0'],
            'power_watts' => ['nullable', 'integer', 'min:0'],
            'specs' => ['nullable', 'array'],
            'specs.*' => ['string', 'max:120'],
            'variants' => ['nullable', 'array'],
            'variants.*' => ['string', 'max:120'],
            'usage_instructions' => ['nullable', 'string', 'max:2000'],
            'ingredients' => ['nullable', 'string', 'max:2000'],
        ]);

        /** @var User|null $actor */
        $actor = $request->user();

        return response()->json([
            'data' => $this->catalogAgent->generateProductDescription($validated, $actor, true),
        ]);
    }

    public function testSearchConnection(): JsonResponse
    {
        return response()->json(['data' => $this->googleSearch->testConnection()]);
    }

    public function lookupProductByName(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['nullable', 'string', 'max:220'],
            'brand' => ['nullable', 'string', 'max:120'],
            'source_url' => ['nullable', 'url', 'max:500'],
            'barcode' => ['nullable', 'string', 'max:40'],
            'manufacturer_code' => ['nullable', 'string', 'max:80'],
            'internal_sku' => ['nullable', 'string', 'max:80'],
            'refresh' => ['nullable', 'boolean'],
            'force_web_search' => ['nullable', 'boolean'],
        ]);

        if (
            trim((string) ($validated['query'] ?? '')) === '' &&
            trim((string) ($validated['source_url'] ?? '')) === '' &&
            trim((string) ($validated['barcode'] ?? '')) === ''
        ) {
            return response()->json([
                'message' => 'Digite o nome do produto, informe um link de referência ou um código de barras.',
            ], 422);
        }

        /** @var User $actor */
        $actor = $request->user();

        return response()->json([
            'data' => $this->webLookup->lookup($actor, $validated),
        ]);
    }

    public function importCatalogImageFromUrl(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'url', 'max:1000'],
            'title' => ['nullable', 'string', 'max:180'],
            'alt_text' => ['nullable', 'string', 'max:255'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $result = $this->media->importFromExternalUrl(
            (string) $validated['url'],
            $actor,
            $validated['title'] ?? null,
            $validated['alt_text'] ?? null,
            'catalog'
        );

        return response()->json([
            'data' => [
                'id' => $result['asset']->id,
                'path' => $result['path'],
                'thumb_path' => $result['thumb_path'],
                'width' => $result['width'],
                'height' => $result['height'],
                'mime_type' => $result['mime_type'],
                'size_bytes' => $result['size_bytes'],
                'source_url' => $result['source_url'],
            ],
        ], 201);
    }

    public function uploadCatalogImageFile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'max:5120'],
            'title' => ['nullable', 'string', 'max:180'],
            'alt_text' => ['nullable', 'string', 'max:255'],
        ]);

        $asset = $this->media->uploadImage(
            $request->file('file'),
            $request->user(),
            $validated['title'] ?? null,
            $validated['alt_text'] ?? null,
            'catalog'
        );

        return response()->json(['data' => $asset], 201);
    }

    public function checkCatalogDuplicates(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sku' => ['nullable', 'string', 'max:80'],
            'gtin' => ['nullable', 'string', 'max:40'],
            'name' => ['nullable', 'string', 'max:200'],
        ]);

        return response()->json([
            'data' => $this->webLookup->checkDuplicates($validated),
        ]);
    }

    // -------------------------------------------------------------------------
    // Agente 03: Reposição Inteligente
    // -------------------------------------------------------------------------

    public function latestReplenishment(): JsonResponse
    {
        $latest = AiReplenishmentAnalysis::query()
            ->with(['user:id,name', 'suggestions.supplier:id,name'])
            ->latest('id')
            ->first();

        return response()->json(['data' => $latest]);
    }

    public function analyzeReplenishment(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'analysis_period' => ['nullable', 'integer', Rule::in([7, 30, 90])],
            'lead_time_days' => ['nullable', 'integer', 'min:1', 'max:60'],
            'safety_stock_days' => ['nullable', 'integer', 'min:1', 'max:30'],
            'target_coverage_days' => ['nullable', 'integer', 'min:7', 'max:90'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'async' => ['nullable', 'boolean'],
        ]);

        /** @var User $actor */
        $actor = $request->user();

        if (! empty($validated['async'])) {
            RunAiReplenishmentAnalysisJob::dispatch($actor->id, $validated, 'manual_async');

            return response()->json(['data' => ['queued' => true]], 202);
        }

        $analysis = $this->replenishmentAgent->runAnalysis($actor, $validated, 'manual');

        return response()->json(['data' => $analysis->load(['user:id,name', 'suggestions.supplier:id,name'])], 201);
    }

    public function explainReplenishmentSuggestion(Request $request, int $suggestionId): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $suggestion = AiReplenishmentSuggestion::query()->findOrFail($suggestionId);

        return response()->json([
            'data' => $this->replenishmentAgent->explainSuggestion($suggestion, $actor),
        ]);
    }

    public function saveReplenishmentPlan(Request $request, int $analysisId): JsonResponse
    {
        $validated = $request->validate([
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'create_goods_receipt_draft' => ['nullable', 'boolean'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.suggestion_id' => ['required', 'integer'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:9999'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $analysis = AiReplenishmentAnalysis::query()->findOrFail($analysisId);

        return response()->json([
            'data' => $this->replenishmentAgent->savePurchasePlan(
                $analysis,
                $validated['items'],
                ! empty($validated['supplier_id']) ? (int) $validated['supplier_id'] : null,
                ! empty($validated['create_goods_receipt_draft']),
                $actor
            ),
        ]);
    }

    public function exportReplenishmentCsv(int $analysisId): Response
    {
        $analysis = AiReplenishmentAnalysis::query()->with('suggestions')->findOrFail($analysisId);
        $lines = ['produto;tonalidade;sku;estoque_disponivel;media_diaria;cobertura_dias;prazo_dias;quantidade_sugerida;quantidade_ajustada;prioridade;justificativa'];

        foreach ($analysis->suggestions as $s) {
            $lines[] = implode(';', [
                $this->reports->safeCsvCell($s->product_name_snapshot),
                $this->reports->safeCsvCell($s->variant_name_snapshot),
                $this->reports->safeCsvCell($s->sku_snapshot),
                (string) $s->available_stock,
                (string) $s->average_demand,
                $s->coverage_days !== null ? (string) $s->coverage_days : 'N/D',
                (string) $s->lead_time_days,
                (string) $s->suggested_quantity,
                (string) ($s->adjusted_quantity ?? $s->suggested_quantity),
                $this->reports->safeCsvCell($s->priority),
                $this->reports->safeCsvCell($s->explanation),
            ]);
        }

        return response(implode("\n", $lines), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="reposicao-inteligente-'.$analysis->id.'.csv"',
        ]);
    }
}
