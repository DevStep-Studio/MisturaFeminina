<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Security\Services\AuditLogger;
use App\Domain\Shared\Enums\InventoryMovementType;
use App\Domain\Shared\Enums\ProductType;
use App\Http\Controllers\SeoController;
use App\Models\AiProductImport;
use App\Models\AiProductImportItem;
use App\Models\Brand;
use App\Models\BulkEditBatch;
use App\Models\BulkEditBatchItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ProductCatalogAgent
{
    public function __construct(
        private readonly AIProviderService $provider,
        private readonly AIUsageTracker $tracker,
        private readonly AIToolRegistry $tools,
        private readonly ProductDocumentProcessor $processor,
        private readonly ProductImportValidator $validator,
        private readonly InventoryService $inventory,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Extracts products/variants from files, pasted text, or conversational instructions,
     * validates against existing catalog, detects duplicates, and saves reviewable drafts.
     *
     * @param  list<UploadedFile>  $files
     * @param  array<string, mixed>  $params
     */
    public function processImport(User $actor, array $files = [], array $params = []): AiProductImport
    {
        $agent = $this->tracker->resolveAgent('product_catalog');
        $rawText = isset($params['raw_text']) ? (string) $params['raw_text'] : null;
        $instruction = isset($params['instruction']) ? (string) $params['instruction'] : null;
        $importId = ! empty($params['import_id']) ? (int) $params['import_id'] : null;

        /** @var AiProductImport|null $existingImport */
        $existingImport = $importId ? AiProductImport::query()->where('id', $importId)->firstOrFail() : null;
        $prevContext = is_array($existingImport?->context_parameters) ? $existingImport->context_parameters : [];
        $prevMessages = is_array($existingImport?->conversation_messages) ? $existingImport->conversation_messages : [];

        $execution = $this->tracker->startExecution(
            $agent,
            $actor,
            [
                'files_count' => count($files),
                'has_raw_text' => ! empty($rawText),
                'instruction' => $instruction,
                'import_id' => $importId,
            ],
            'product_import',
            $importId,
            $files !== [] ? ($files[0]->getClientOriginalName() ?: 'arquivo') : 'entrada_manual'
        );

        // Execute permission-checked discovery tools
        $this->tools->callTool('get_product_categories', [], $actor, $execution);
        $this->tools->callTool('get_registered_brands', [], $actor, $execution);

        $cfg = $this->provider->getConfig();
        $maxRows = max(10, (int) ($cfg['max_batch_rows'] ?? 500));

        $extracted = $this->processor->extract($files, $rawText, $instruction, $prevContext);
        if ($extracted['blocked_injections'] !== []) {
            $this->tracker->logEvent($execution, 'prompt_injection_blocked', null, 'Instruções suspeitas neutralizadas nos documentos de entrada.', [
                'patterns' => $extracted['blocked_injections'],
            ]);
        }

        $nlContext = $instruction ? $this->processor->parseContextDefaultsFromText($instruction) : [];
        $mergedContext = array_merge($prevContext, $nlContext);

        $rows = array_slice($extracted['rows'], 0, $maxRows);

        if ($rows === [] && $existingImport !== null && $existingImport->items()->count() > 0) {
            // Apply updated conversational parameters (e.g. brand/volume/price) onto existing draft items
            $rebuiltRows = [];
            foreach ($existingImport->items()->get() as $idx => $oldItem) {
                $p = $oldItem->proposed_data;
                $rebuiltRows[] = [
                    'row_index' => $idx,
                    'origin_file' => 'rascunho_conversacional',
                    'origin_detail' => 'Contexto atualizado',
                    'product_name' => $p['product_name'] ?? $oldItem->product_reference,
                    'brand' => $mergedContext['brand'] ?? ($p['brand_name'] ?? null),
                    'category' => $p['category_name'] ?? null,
                    'variant_name' => $p['variant_name'] ?? 'Padrão',
                    'shade_code' => $p['shade_code'] ?? null,
                    'color_family' => $p['color_family'] ?? null,
                    'color_hex' => $p['color_hex'] ?? null,
                    'volume' => $mergedContext['volume'] ?? ($p['volume'] ?? null),
                    'sku' => $oldItem->sku,
                    'gtin' => $oldItem->gtin,
                    'cost_price_cents' => $p['cost_price_cents'] ?? null,
                    'sale_price_cents' => $mergedContext['sale_price_cents'] ?? (! empty($p['price_cents']) ? (int) $p['price_cents'] : null),
                    'promo_price_cents' => $p['promo_price_cents'] ?? null,
                    'stock_qty' => $mergedContext['stock_qty'] ?? ($p['stock_qty'] ?? null),
                    'ingredients' => $p['ingredients'] ?? null,
                    'usage_instructions' => $p['usage_instructions'] ?? null,
                    'manufacturer' => $p['manufacturer'] ?? null,
                ];
            }
            $rows = $rebuiltRows;
        }

        $analyzed = $this->validator->analyzeAndBuildDraftItems($rows);
        $itemsData = $analyzed['items'];
        $stats = $analyzed['stats'];

        $skuList = array_values(array_filter(array_map(fn (array $i): ?string => $i['sku'], $itemsData)));
        if ($skuList !== []) {
            $this->tools->callTool('detect_duplicate_skus', ['skus' => array_slice($skuList, 0, 100)], $actor, $execution);
        }

        // Optional LLM enrichment when provider API key is configured (without inventing absent specs/prices)
        $llmUsage = ['connected' => false];
        if ($this->provider->connectionStatus()['has_api_key'] && $itemsData !== []) {
            $sampleGroups = [];
            foreach ($itemsData as $it) {
                $gk = (string) $it['group_key'];
                if (! isset($sampleGroups[$gk])) {
                    $sampleGroups[$gk] = [
                        'group_key' => $gk,
                        'product_name' => $it['proposed_data']['product_name'],
                        'brand' => $it['proposed_data']['brand_name'],
                        'volume' => $it['proposed_data']['volume'],
                    ];
                }
            }
            $llmResp = $this->provider->chatStructured(
                'catalog',
                'Você é o Agente de Cadastro da loja Mistura Feminina Cosméticos. '
                .'Melhore título SEO, descrição curta e descrição comercial usando EXCLUSIVAMENTE os fatos informados. '
                .'NUNCA invente preços, ingredientes, composição química ou registros regulatórios.',
                json_encode(array_slice(array_values($sampleGroups), 0, 10), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['descriptions'],
                    'properties' => [
                        'descriptions' => [
                            'type' => 'array',
                            'items' => [
                                'type' => 'object',
                                'additionalProperties' => false,
                                'required' => ['group_key', 'short_description', 'description'],
                                'properties' => [
                                    'group_key' => ['type' => 'string'],
                                    'short_description' => ['type' => 'string'],
                                    'description' => ['type' => 'string'],
                                ],
                            ],
                        ],
                    ],
                ]
            );
            $llmUsage = $llmResp;
            if (is_array($llmResp['content']['descriptions'] ?? null)) {
                $descMap = [];
                foreach ($llmResp['content']['descriptions'] as $d) {
                    if (is_array($d) && ! empty($d['group_key'])) {
                        $descMap[(string) $d['group_key']] = $d;
                    }
                }
                foreach ($itemsData as &$it) {
                    $gk = (string) $it['group_key'];
                    if (isset($descMap[$gk])) {
                        $it['proposed_data']['short_description'] = (string) ($descMap[$gk]['short_description'] ?? $it['proposed_data']['short_description']);
                        $it['proposed_data']['description'] = (string) ($descMap[$gk]['description'] ?? $it['proposed_data']['description']);
                    }
                }
                unset($it);
            }
        }

        if ($instruction !== null && trim($instruction) !== '') {
            $prevMessages[] = [
                'role' => 'user',
                'content' => trim($instruction),
                'at' => now()->toIso8601String(),
            ];
        }
        $prevMessages[] = [
            'role' => 'assistant',
            'content' => $itemsData !== []
                ? "Preparei {$stats['grouped_products_count']} produto(s) e {$stats['grouped_variants_count']} variação(ões) para revisão. "
                  .($stats['duplicate_count'] > 0 ? "Detectei {$stats['duplicate_count']} possível(eis) duplicidade(s). " : '')
                  .($stats['incomplete_count'] > 0 ? "{$stats['incomplete_count']} item(ns) precisam de conferência de campos ausentes." : '')
                : 'Registrei o contexto inicial informado. Envie a planilha ou informe as cores/preços para montar os rascunhos.',
            'at' => now()->toIso8601String(),
        ];

        $status = $itemsData === [] ? 'awaiting_review' : 'awaiting_review';

        /** @var AiProductImport $import */
        $import = DB::transaction(function () use (
            $existingImport,
            $execution,
            $actor,
            $extracted,
            $mergedContext,
            $prevMessages,
            $status,
            $stats,
            $itemsData,
        ): AiProductImport {
            if ($existingImport !== null) {
                $existingImport->update([
                    'execution_id' => $execution->id,
                    'source_type' => $extracted['source_type'],
                    'file_hash' => $extracted['file_hash'],
                    'original_filenames' => array_values(array_unique(array_merge($existingImport->original_filenames ?? [], $extracted['filenames']))),
                    'conversation_messages' => $prevMessages,
                    'context_parameters' => $mergedContext,
                    'status' => $status,
                    'total_records' => $stats['total_records'],
                    'grouped_products_count' => $stats['grouped_products_count'],
                    'grouped_variants_count' => $stats['grouped_variants_count'],
                    'new_count' => $stats['new_count'],
                    'update_count' => $stats['update_count'],
                    'duplicate_count' => $stats['duplicate_count'],
                    'incomplete_count' => $stats['incomplete_count'],
                    'error_count' => $stats['error_count'],
                ]);
                $existingImport->items()->delete();
                $import = $existingImport;
            } else {
                $import = AiProductImport::query()->create([
                    'execution_id' => $execution->id,
                    'user_id' => $actor->id,
                    'source_type' => $extracted['source_type'],
                    'file_hash' => $extracted['file_hash'],
                    'original_filenames' => $extracted['filenames'],
                    'conversation_messages' => $prevMessages,
                    'context_parameters' => $mergedContext,
                    'status' => $status,
                    'total_records' => $stats['total_records'],
                    'grouped_products_count' => $stats['grouped_products_count'],
                    'grouped_variants_count' => $stats['grouped_variants_count'],
                    'new_count' => $stats['new_count'],
                    'update_count' => $stats['update_count'],
                    'duplicate_count' => $stats['duplicate_count'],
                    'incomplete_count' => $stats['incomplete_count'],
                    'error_count' => $stats['error_count'],
                ]);
            }

            foreach ($itemsData as $row) {
                $import->items()->create($row);
            }

            return $import->fresh(['items', 'user:id,name', 'approvedBy:id,name']) ?? $import;
        });

        $this->tracker->finishExecution(
            $execution,
            'awaiting_review',
            ['import_id' => $import->id, 'stats' => $stats, 'blocked_injections' => $extracted['blocked_injections']],
            [
                ['tool' => 'get_product_categories'],
                ['tool' => 'get_registered_brands'],
                ['tool' => 'detect_duplicate_skus'],
            ],
            $llmUsage,
            "IMPORT-#{$import->id}"
        );

        return $import;
    }

    /** @param array<string, mixed> $changes */
    public function updateDraftItem(AiProductImportItem $item, array $changes): AiProductImportItem
    {
        $import = $item->import;
        if ($import && in_array($import->status, ['approved', 'discarded'], true)) {
            throw ValidationException::withMessages(['import' => ['Importação já finalizada não pode ser editada.']]);
        }

        $proposed = $item->proposed_data;
        $evidence = $item->source_evidence ?? [];
        $evidenceFields = is_array($evidence['fields'] ?? null) ? $evidence['fields'] : [];

        foreach ([
            'product_name',
            'product_line',
            'brand_id',
            'brand_name',
            'category_id',
            'category_name',
            'variant_name',
            'shade_code',
            'color_family',
            'color_hex',
            'volume',
            'supplier_code',
            'short_description',
            'description',
            'seo_title',
            'seo_description',
        ] as $strKey) {
            if (array_key_exists($strKey, $changes)) {
                $proposed[$strKey] = $changes[$strKey];
                $evidenceFields[$strKey] = 'manual';
            }
        }
        if (array_key_exists('sku', $changes)) {
            $newSku = strtoupper(trim((string) $changes['sku']));
            $proposed['sku'] = $newSku;
            $item->sku = $newSku;
            $evidenceFields['sku'] = 'manual';
        }
        if (array_key_exists('gtin', $changes)) {
            $newGtin = $changes['gtin'] !== null ? trim((string) $changes['gtin']) : null;
            $proposed['gtin'] = $newGtin;
            $item->gtin = $newGtin;
            $evidenceFields['gtin'] = $newGtin ? 'manual' : 'missing';
        }
        if (array_key_exists('power_watts', $changes)) {
            $pw = $changes['power_watts'] !== null && $changes['power_watts'] !== '' ? (int) $changes['power_watts'] : null;
            $proposed['power_watts'] = $pw;
            $evidenceFields['power_watts'] = $pw ? 'manual' : ((! empty($proposed['is_equipment'])) ? 'missing_illegible' : 'not_applicable');
        }
        if (array_key_exists('shipping_weight_grams', $changes)) {
            $sw = $changes['shipping_weight_grams'] !== null && $changes['shipping_weight_grams'] !== '' ? (int) $changes['shipping_weight_grams'] : null;
            $proposed['shipping_weight_grams'] = $sw;
            $evidenceFields['shipping_weight'] = $sw ? 'manual' : 'missing';
        }
        if (array_key_exists('price_cents', $changes)) {
            $proposed['price_cents'] = max(0, (int) $changes['price_cents']);
            $evidenceFields['price'] = $proposed['price_cents'] > 0 ? 'manual' : 'missing';
        }
        if (array_key_exists('cost_price_cents', $changes)) {
            $proposed['cost_price_cents'] = $changes['cost_price_cents'] !== null && $changes['cost_price_cents'] !== ''
                ? max(0, (int) $changes['cost_price_cents'])
                : null;
            $evidenceFields['cost'] = $proposed['cost_price_cents'] !== null ? 'manual' : 'missing';
        }
        if (array_key_exists('suggested_retail_price_cents', $changes)) {
            $proposed['suggested_retail_price_cents'] = $changes['suggested_retail_price_cents'] !== null && $changes['suggested_retail_price_cents'] !== ''
                ? max(0, (int) $changes['suggested_retail_price_cents'])
                : null;
        }
        if (! empty($changes['price_meaning']) && in_array($changes['price_meaning'], ['cost', 'supplier_suggested', 'sale'], true)) {
            $ambVal = (int) ($proposed['ambiguous_price_cents'] ?? $changes['ambiguous_price_cents'] ?? 0);
            $meaning = (string) $changes['price_meaning'];
            $proposed['price_meaning'] = $meaning;
            if ($ambVal > 0) {
                if ($meaning === 'cost') {
                    $proposed['cost_price_cents'] = $ambVal;
                } elseif ($meaning === 'supplier_suggested') {
                    $proposed['suggested_retail_price_cents'] = $ambVal;
                } else {
                    $proposed['price_cents'] = $ambVal;
                    $evidenceFields['price'] = 'manual';
                }
                $proposed['ambiguous_price_cents'] = null;
            }
        }
        if (! empty($changes['apply_pack_conversion']) && is_array($proposed['cost_conversion'] ?? null)) {
            $conv = $proposed['cost_conversion'];
            if (! empty($conv['proposed_unit_cost_cents'])) {
                $proposed['cost_price_cents'] = (int) $conv['proposed_unit_cost_cents'];
                $conv['selling_unit'] = (string) ($changes['selling_unit'] ?? 'unidade');
                $conv['applied'] = true;
                $proposed['cost_conversion'] = $conv;
            }
        }
        if (array_key_exists('promo_price_cents', $changes)) {
            $proposed['promo_price_cents'] = $changes['promo_price_cents'] !== null ? max(0, (int) $changes['promo_price_cents']) : null;
        }
        if (array_key_exists('stock_qty', $changes)) {
            $proposed['stock_qty'] = max(0, (int) $changes['stock_qty']);
            $evidenceFields['stock_qty'] = 'manual';
        }
        if (! empty($changes['ungroup'])) {
            $item->group_key = 'ungrouped-item-'.$item->id;
        } elseif (array_key_exists('group_key', $changes) && ! empty($changes['group_key'])) {
            $item->group_key = (string) $changes['group_key'];
        }
        if (array_key_exists('matched_product_id', $changes)) {
            $item->matched_product_id = $changes['matched_product_id'] ? (int) $changes['matched_product_id'] : null;
        }
        if (isset($changes['resolution_choice']) && in_array($changes['resolution_choice'], ['create_new', 'update_existing', 'ignore', 'manual_review'], true)) {
            $item->resolution_choice = (string) $changes['resolution_choice'];
        }

        $validation = $item->validation_result ?? ['is_valid' => true, 'errors' => [], 'warnings' => []];
        $errors = [];
        if (empty($proposed['sku'])) {
            $errors[] = 'SKU obrigatório.';
        }
        if ((int) ($proposed['price_cents'] ?? 0) <= 0 && $item->resolution_choice !== 'ignore' && ! $item->matched_variant_id) {
            $errors[] = 'Preço de venda deve ser maior que zero.';
        }
        if (! empty($proposed['is_equipment']) && empty($proposed['power_watts']) && $item->resolution_choice !== 'ignore') {
            $errors[] = 'Equipamento sem potência (W) informada manualmente.';
        }

        // Cross-check SKU vs GTIN conflict across different products
        $skuUpper = strtoupper(trim((string) ($proposed['sku'] ?? '')));
        $gtinVal = trim((string) ($proposed['gtin'] ?? ''));
        if ($skuUpper !== '' && $gtinVal !== '') {
            $skuVar = ProductVariant::query()->whereRaw('UPPER(sku) = ?', [$skuUpper])->first();
            $gtinProd = Product::query()->where('gtin', $gtinVal)->first()
                ?? ProductVariant::query()->with('product')->where('gtin', $gtinVal)->first()?->product;
            if ($skuVar && $gtinProd && (int) $skuVar->product_id !== (int) $gtinProd->id) {
                $errors[] = "Conflito: SKU {$skuUpper} e código de barras {$gtinVal} apontam para produtos diferentes no catálogo.";
            }
        }

        $validation['errors'] = $errors;
        $validation['is_valid'] = $errors === [];

        $evidence['fields'] = $evidenceFields;
        $item->source_evidence = $evidence;
        $item->proposed_data = $proposed;
        $item->validation_result = $validation;
        $item->save();

        if ($import) {
            $this->recomputeImportStats($import);
        }

        return $item->fresh() ?? $item;
    }

    /**
     * Applies bulk field assignments (brand, category, resolution_choice, ungroup) across selected draft items.
     *
     * @param  list<int>  $itemIds
     * @param  array<string, mixed>  $changes
     * @return list<AiProductImportItem>
     */
    public function bulkUpdateDraftItems(AiProductImport $import, array $itemIds, array $changes): array
    {
        if (in_array($import->status, ['approved', 'discarded'], true)) {
            throw ValidationException::withMessages(['import' => ['Importação já finalizada não pode ser editada.']]);
        }

        $updated = [];
        $items = $import->items()->whereIn('id', $itemIds)->get();
        foreach ($items as $item) {
            $updated[] = $this->updateDraftItem($item, $changes);
        }

        $this->recomputeImportStats($import);

        return $updated;
    }

    private function recomputeImportStats(AiProductImport $import): void
    {
        $items = $import->items()->get();
        $groups = [];
        $errorCount = 0;
        $incompleteCount = 0;
        foreach ($items as $it) {
            $groups[$it->group_key] = true;
            $val = $it->validation_result ?? [];
            if (! empty($val['errors'])) {
                $errorCount++;
            } elseif (! empty($val['warnings'])) {
                $incompleteCount++;
            }
        }

        $import->update([
            'grouped_products_count' => count($groups),
            'grouped_variants_count' => $items->count(),
            'error_count' => $errorCount,
            'incomplete_count' => $incompleteCount,
        ]);
    }

    /**
     * Commits approved draft items atomically into live `Product` & `ProductVariant` tables via existing `InventoryService`.
     * Idempotent: supports explicit `idempotencyKey` replay AND skips already-committed items safely without duplicates.
     *
     * @param  list<int>|null  $selectedItemIds
     * @return array<string, mixed>
     */
    public function commitApprovedImport(
        AiProductImport $import,
        User $actor,
        ?array $selectedItemIds = null,
        ?string $idempotencyKey = null,
    ): array {
        if (! $actor->hasPermission('ai.catalog.approve')) {
            throw ValidationException::withMessages(['permission' => ['Usuário sem permissão comercial para publicar cadastros da IA.']]);
        }

        if ($idempotencyKey) {
            $existingBatch = BulkEditBatch::query()->where('idempotency_key', $idempotencyKey)->first();
            if ($existingBatch) {
                return [
                    'import_id' => $import->id,
                    'created_products' => 0,
                    'created_variants' => 0,
                    'updated_variants' => 0,
                    'skipped_already_committed' => $import->items()->where('approval_status', 'committed')->count(),
                    'idempotent_replay' => true,
                    'batch_id' => $existingBatch->id,
                    'status' => $import->status,
                ];
            }
        }

        $result = DB::transaction(function () use ($import, $actor, $selectedItemIds, $idempotencyKey): array {
            /** @var AiProductImport $locked */
            $locked = AiProductImport::query()->with('items')->lockForUpdate()->findOrFail($import->id);
            if ($locked->status === 'discarded') {
                throw ValidationException::withMessages(['import' => ['Esta importação foi descartada e não pode ser publicada.']]);
            }

            $itemsQuery = $locked->items->filter(function (AiProductImportItem $it) use ($selectedItemIds): bool {
                if ($selectedItemIds !== null && ! in_array($it->id, $selectedItemIds, true)) {
                    return false;
                }

                return $it->resolution_choice !== 'ignore' && $it->approval_status !== 'committed';
            });

            if ($itemsQuery->isEmpty()) {
                return [
                    'import_id' => $locked->id,
                    'created_products' => 0,
                    'created_variants' => 0,
                    'updated_variants' => 0,
                    'skipped_already_committed' => $locked->items->where('approval_status', 'committed')->count(),
                    'batch_id' => $locked->committed_batch_id,
                ];
            }

            $batch = BulkEditBatch::query()->create([
                'batch_code' => 'AI-IMP-'.$locked->id.'-'.strtoupper(Str::random(4)),
                'idempotency_key' => $idempotencyKey ?: ('ai-import-commit-'.$locked->id.'-'.($selectedItemIds ? md5(json_encode($selectedItemIds) ?: '') : 'all')),
                'user_id' => $actor->id,
                'source' => 'ai_catalog_agent',
                'operation_type' => 'ai_import',
                'status' => 'completed',
                'total_rows' => $itemsQuery->count(),
                'created_count' => 0,
                'updated_count' => 0,
                'skipped_count' => 0,
                'pending_count' => 0,
                'failed_count' => 0,
            ]);

            $createdProducts = 0;
            $createdVariants = 0;
            $updatedVariants = 0;
            $groupProductCache = [];

            foreach ($itemsQuery as $item) {
                $p = $item->proposed_data;
                $evidenceFields = is_array($item->source_evidence['fields'] ?? null) ? $item->source_evidence['fields'] : [];
                $sku = strtoupper(trim((string) ($p['sku'] ?? $item->sku ?? '')));
                $priceCents = (int) ($p['price_cents'] ?? 0);

                if ($sku === '') {
                    throw ValidationException::withMessages([
                        'items' => ["Item #{$item->id} ({$item->product_reference}) sem SKU definido."],
                    ]);
                }
                if (! empty($p['is_equipment']) && empty($p['power_watts'])) {
                    throw ValidationException::withMessages([
                        'items' => ["Item #{$item->id} ({$item->product_reference}): equipamento sem potência elétrica (W) informada manualmente."],
                    ]);
                }

                // Resolve existing variant by SKU or explicit match for idempotency
                /** @var ProductVariant|null $existingVar */
                $existingVar = $item->matched_variant_id
                    ? ProductVariant::query()->with('product')->find($item->matched_variant_id)
                    : ProductVariant::query()->with('product')->whereRaw('UPPER(sku) = ?', [$sku])->first();

                $gtin = ! empty($p['gtin']) ? trim((string) $p['gtin']) : null;
                if ($gtin && $existingVar) {
                    $otherGtinProd = Product::query()->where('gtin', $gtin)->where('id', '!=', $existingVar->product_id)->first();
                    if ($otherGtinProd) {
                        throw ValidationException::withMessages([
                            'items' => ["Conflito de catálogo no item #{$item->id}: SKU {$sku} e código de barras {$gtin} apontam para produtos distintos."],
                        ]);
                    }
                }

                if ($existingVar) {
                    $oldStock = $existingVar->stock_qty;
                    $priceSource = (string) ($evidenceFields['price'] ?? 'provided');
                    $stockSource = (string) ($evidenceFields['stock_qty'] ?? 'provided');

                    $finalPrice = ($priceCents > 0 && ($priceSource !== 'missing' || ! empty($p['price_cents'])))
                        ? $priceCents
                        : $existingVar->price_cents;

                    $varUpdate = [
                        'price_cents' => $finalPrice,
                    ];
                    if (($evidenceFields['variant_name'] ?? 'provided') !== 'missing' && ! empty($p['variant_name']) && $p['variant_name'] !== 'Padrão') {
                        $varUpdate['name'] = (string) $p['variant_name'];
                    }
                    if (! empty($p['shade_code'])) {
                        $varUpdate['shade_code'] = (string) $p['shade_code'];
                    }
                    if (! empty($p['color_family'])) {
                        $varUpdate['color_family'] = (string) $p['color_family'];
                    }
                    if (! empty($p['color_hex'])) {
                        $varUpdate['color_hex'] = (string) $p['color_hex'];
                    }
                    if (! empty($p['supplier_code'])) {
                        $varUpdate['supplier_code'] = (string) $p['supplier_code'];
                    }
                    if ($gtin !== null) {
                        $varUpdate['gtin'] = $gtin;
                    }
                    if (array_key_exists('promo_price_cents', $p) && $p['promo_price_cents'] !== null) {
                        $varUpdate['promo_price_cents'] = (int) $p['promo_price_cents'];
                    }
                    if (array_key_exists('cost_price_cents', $p) && $p['cost_price_cents'] !== null && $actor->hasPermission('catalog.cost.write')) {
                        $varUpdate['cost_cents'] = (int) $p['cost_price_cents'];
                    }

                    $oldPriceSnap = $existingVar->price_cents;
                    $existingVar->update($varUpdate);

                    $targetStock = ($stockSource === 'missing')
                        ? $oldStock
                        : max(0, (int) ($p['stock_qty'] ?? $oldStock));
                    $delta = $targetStock - $oldStock;

                    if ($delta !== 0) {
                        $this->inventory->adjustStock(
                            $existingVar,
                            $delta,
                            InventoryMovementType::Adjustment,
                            $actor,
                            "Atualização em lote via Agente de Cadastro IA (#{$locked->id})",
                            $batch->batch_code
                        );
                    }

                    BulkEditBatchItem::query()->create([
                        'bulk_edit_batch_id' => $batch->id,
                        'product_id' => $existingVar->product_id,
                        'product_variant_id' => $existingVar->id,
                        'sku' => $sku,
                        'action' => 'updated',
                        'old_values' => ['price_cents' => $oldPriceSnap, 'stock_qty' => $oldStock],
                        'new_values' => ['price_cents' => $finalPrice, 'stock_qty' => $targetStock],
                    ]);

                    $item->update([
                        'matched_product_id' => $existingVar->product_id,
                        'matched_variant_id' => $existingVar->id,
                        'approval_status' => 'committed',
                    ]);
                    $updatedVariants++;

                    continue;
                }

                if ($priceCents <= 0) {
                    throw ValidationException::withMessages([
                        'items' => ["Item #{$item->id} ({$item->product_reference}) exige preço de venda maior que zero para cadastro."],
                    ]);
                }

                // Resolve or create parent product for this group_key
                $groupKey = $item->group_key;
                /** @var Product|null $parentProduct */
                $parentProduct = $groupProductCache[$groupKey] ?? null;

                if (! $parentProduct && $item->matched_product_id && $item->resolution_choice === 'update_existing') {
                    $parentProduct = Product::query()->find($item->matched_product_id);
                }

                if (! $parentProduct) {
                    $brandId = ! empty($p['brand_id']) ? (int) $p['brand_id'] : null;
                    if (! $brandId && ! empty($p['brand_name'])) {
                        $brand = Brand::query()->firstOrCreate(
                            ['slug' => Str::slug((string) $p['brand_name'])],
                            ['name' => (string) $p['brand_name'], 'is_active' => true]
                        );
                        $brandId = $brand->id;
                    }

                    $baseSlug = Str::slug((string) ($p['slug'] ?? $p['product_name'] ?? $sku));
                    $uniqueSlug = Product::query()->where('slug', $baseSlug)->exists()
                        ? $baseSlug.'-'.strtolower(Str::random(4))
                        : $baseSlug;

                    $parentSku = Product::query()->where('sku', $sku.'-PARENT')->exists()
                        ? $sku.'-PARENT-'.strtoupper(Str::random(3))
                        : $sku.'-PARENT';

                    $parentProduct = Product::query()->create([
                        'brand_id' => $brandId,
                        'name' => (string) ($p['product_name'] ?? $item->product_reference),
                        'slug' => $uniqueSlug,
                        'sku' => $parentSku,
                        'gtin' => $gtin,
                        'supplier_code' => ! empty($p['supplier_code']) ? (string) $p['supplier_code'] : null,
                        'power_watts' => ! empty($p['power_watts']) ? (int) $p['power_watts'] : null,
                        'manufacturer' => $p['manufacturer'] ?? null,
                        'short_description' => $p['short_description'] ?? null,
                        'description' => $p['description'] ?? null,
                        'ingredients' => $p['ingredients'] ?? null,
                        'usage_instructions' => $p['usage_instructions'] ?? null,
                        'product_type' => ProductType::Simple->value,
                        'cost_cents' => (array_key_exists('cost_price_cents', $p) && $p['cost_price_cents'] !== null && $actor->hasPermission('catalog.cost.write'))
                            ? (int) $p['cost_price_cents']
                            : null,
                        'price_cents' => $priceCents,
                        'promo_price_cents' => $p['promo_price_cents'] ?? null,
                        'weight_grams' => ! empty($p['shipping_weight_grams']) ? (int) $p['shipping_weight_grams'] : 200,
                        'is_active' => true,
                        'is_new_arrival' => true,
                        'seo_title' => $p['seo_title'] ?? null,
                        'seo_description' => $p['seo_description'] ?? null,
                    ]);

                    if (! empty($p['category_id'])) {
                        $parentProduct->categories()->sync([(int) $p['category_id']]);
                    }
                    $createdProducts++;
                }

                $groupProductCache[$groupKey] = $parentProduct;
                $initialStock = max(0, (int) ($p['stock_qty'] ?? 0));

                $variant = ProductVariant::query()->create([
                    'product_id' => $parentProduct->id,
                    'sku' => $sku,
                    'gtin' => $gtin,
                    'supplier_code' => ! empty($p['supplier_code']) ? (string) $p['supplier_code'] : null,
                    'name' => (string) ($p['variant_name'] ?? 'Padrão'),
                    'shade_code' => $p['shade_code'] ?? null,
                    'color_family' => $p['color_family'] ?? null,
                    'color_hex' => $p['color_hex'] ?? null,
                    'price_cents' => $priceCents,
                    'promo_price_cents' => $p['promo_price_cents'] ?? null,
                    'cost_cents' => (array_key_exists('cost_price_cents', $p) && $p['cost_price_cents'] !== null && $actor->hasPermission('catalog.cost.write'))
                        ? (int) $p['cost_price_cents']
                        : null,
                    'stock_qty' => 0,
                    'reserved_qty' => 0,
                    'weight_grams' => ! empty($p['shipping_weight_grams']) ? (int) $p['shipping_weight_grams'] : 200,
                    'is_default' => $parentProduct->variants()->count() === 0,
                    'is_active' => true,
                    'sort_order' => $item->row_index,
                ]);

                if ($initialStock > 0) {
                    $this->inventory->adjustStock(
                        $variant,
                        $initialStock,
                        InventoryMovementType::In,
                        $actor,
                        "Cadastro inicial aprovado via Agente IA (#{$locked->id})",
                        $batch->batch_code
                    );
                }

                BulkEditBatchItem::query()->create([
                    'bulk_edit_batch_id' => $batch->id,
                    'product_id' => $parentProduct->id,
                    'product_variant_id' => $variant->id,
                    'sku' => $sku,
                    'action' => 'created',
                    'old_values' => null,
                    'new_values' => ['price_cents' => $priceCents, 'stock_qty' => $initialStock],
                ]);

                $item->update([
                    'matched_product_id' => $parentProduct->id,
                    'matched_variant_id' => $variant->id,
                    'approval_status' => 'committed',
                ]);
                $createdVariants++;
            }

            $batch->update([
                'created_count' => $createdVariants,
                'updated_count' => $updatedVariants,
            ]);

            $remainingPending = $locked->items()->where('approval_status', 'pending')->where('resolution_choice', '!=', 'ignore')->count();
            $locked->update([
                'status' => $remainingPending === 0 ? 'approved' : 'partially_approved',
                'committed_batch_id' => $batch->id,
                'approved_by_user_id' => $actor->id,
                'approved_at' => now(),
            ]);

            $this->audit->record(
                'ai.catalog_import_committed',
                $actor,
                'ai_product_import',
                $locked->id,
                null,
                [
                    'batch_id' => $batch->id,
                    'created_products' => $createdProducts,
                    'created_variants' => $createdVariants,
                    'updated_variants' => $updatedVariants,
                ]
            );

            return [
                'import_id' => $locked->id,
                'batch_id' => $batch->id,
                'created_products' => $createdProducts,
                'created_variants' => $createdVariants,
                'updated_variants' => $updatedVariants,
                'status' => $locked->status,
            ];
        });

        SeoController::clearCaches();
        Cache::forget('storefront.bootstrap.v1');
        Cache::forget('storefront.catalog.filters.v1');

        return $result;
    }

    /**
     * Evaluates a single product in the catalog editor and returns non-destructive AI proposals.
     *
     * @return array<string, mixed>
     */
    public function assistSingleProduct(Product $product, User $actor, string $action): array
    {
        $product->loadMissing(['brand:id,name', 'categories:id,name', 'variants', 'images']);
        $agent = $this->tracker->resolveAgent('product_catalog');
        $execution = $this->tracker->startExecution(
            $agent,
            $actor,
            ['product_id' => $product->id, 'action' => $action],
            'product',
            $product->id,
            $product->sku
        );

        $issues = [];
        if ($product->images->isEmpty()) {
            $issues[] = 'Produto sem imagem cadastrada na vitrine.';
        }
        if (empty($product->description) || mb_strlen($product->description) < 40) {
            $issues[] = 'Descrição comercial ausente ou muito curta para conversão e SEO.';
        }
        if (empty($product->seo_title) || empty($product->seo_description)) {
            $issues[] = 'Metadados de SEO (título / meta description) incompletos.';
        }
        if ($product->price_cents <= 0) {
            $issues[] = 'Preço principal zerado ou inválido.';
        }

        $duplicates = Product::query()
            ->where('id', '!=', $product->id)
            ->where(function ($q) use ($product): void {
                $q->where('name', 'like', '%'.explode(' ', $product->name)[0].'%');
                if ($product->gtin) {
                    $q->orWhere('gtin', $product->gtin);
                }
            })
            ->limit(5)
            ->get(['id', 'name', 'sku', 'gtin'])
            ->toArray();

        $catName = $product->categories->first()?->name;
        $proposedShort = "{$product->name}".($product->brand ? " da marca {$product->brand->name}" : '').($catName ? " ({$catName})" : '').' — disponível na Mistura Feminina.';
        $proposedDesc = "{$product->name}"
            .($product->brand ? " — {$product->brand->name}" : '')
            .'. Possui '.$product->variants->count().' variação(ões) ativa(s) no catálogo oficial da Mistura Feminina.'
            .($product->usage_instructions ? "\n\nModo de uso: {$product->usage_instructions}" : '')
            .($product->ingredients ? "\n\nComposição informada: {$product->ingredients}" : '');

        $output = [
            'action' => $action,
            'product_id' => $product->id,
            'issues' => $issues,
            'possible_duplicates' => $duplicates,
            'proposed' => [
                'short_description' => $proposedShort,
                'description' => $proposedDesc,
                'seo_title' => mb_substr("{$product->name} | Mistura Feminina Cosméticos", 0, 160),
                'seo_description' => mb_substr($proposedShort, 0, 160),
            ],
            'requires_user_confirmation' => true,
            'execution_id' => $execution->id,
        ];

        $this->tracker->finishExecution($execution, 'completed', $output, [['tool' => 'search_existing_products']], [], $product->sku);

        return $output;
    }
}
