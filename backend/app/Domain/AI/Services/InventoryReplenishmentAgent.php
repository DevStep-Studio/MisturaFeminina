<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use App\Domain\Catalog\Services\GoodsReceiptService;
use App\Models\AiReplenishmentAnalysis;
use App\Models\AiReplenishmentSuggestion;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InventoryReplenishmentAgent
{
    public function __construct(
        private readonly AIProviderService $provider,
        private readonly AIUsageTracker $tracker,
        private readonly AIToolRegistry $tools,
        private readonly ReplenishmentCalculator $calculator,
        private readonly GoodsReceiptService $receipts,
    ) {}

    /** @param array<string, mixed> $params */
    public function runAnalysis(?User $actor, array $params = [], string $triggerType = 'manual'): AiReplenishmentAnalysis
    {
        $agent = $this->tracker->resolveAgent('inventory_replenishment');
        $cfg = $this->provider->getConfig();

        $mergedParams = [
            'analysis_period' => (int) ($params['analysis_period'] ?? 30),
            'lead_time_days' => (int) ($params['lead_time_days'] ?? $cfg['default_lead_time_days'] ?? 7),
            'safety_stock_days' => (int) ($params['safety_stock_days'] ?? $cfg['safety_stock_days'] ?? 3),
            'target_coverage_days' => (int) ($params['target_coverage_days'] ?? $cfg['target_coverage_days'] ?? 21),
            'supplier_id' => $params['supplier_id'] ?? null,
        ];

        $execution = $this->tracker->startExecution(
            $agent,
            $actor,
            $mergedParams,
            'replenishment_analysis',
            null,
            "periodo_{$mergedParams['analysis_period']}d"
        );

        $computed = $actor
            ? $this->tools->callTool('calculate_replenishment_metrics', $mergedParams, $actor, $execution)
            : $this->calculator->calculate($mergedParams);

        /** @var AiReplenishmentAnalysis $analysis */
        $analysis = DB::transaction(function () use ($execution, $actor, $triggerType, $mergedParams, $computed): AiReplenishmentAnalysis {
            $analysis = AiReplenishmentAnalysis::query()->create([
                'execution_id' => $execution->id,
                'user_id' => $actor?->id,
                'trigger_type' => $triggerType,
                'analysis_period' => $mergedParams['analysis_period'],
                'default_lead_time_days' => $mergedParams['lead_time_days'],
                'safety_stock_days' => $mergedParams['safety_stock_days'],
                'target_coverage_days' => $mergedParams['target_coverage_days'],
                'status' => 'completed',
                'summary_kpis' => $computed['kpis'],
            ]);

            foreach ($computed['items'] as $row) {
                $analysis->suggestions()->create([
                    'product_id' => $row['product_id'],
                    'variant_id' => $row['variant_id'],
                    'supplier_id' => $row['supplier_id'],
                    'sku_snapshot' => $row['sku'],
                    'product_name_snapshot' => $row['product_name'],
                    'variant_name_snapshot' => $row['variant_name'],
                    'shade_code_snapshot' => $row['shade_code'],
                    'available_stock' => $row['available_stock'],
                    'reserved_stock' => $row['reserved_stock'],
                    'pending_inbound_qty' => $row['pending_inbound_qty'],
                    'sales_7d' => $row['sales_7d'],
                    'sales_30d' => $row['sales_30d'],
                    'sales_90d' => $row['sales_90d'],
                    'returns_30d' => $row['returns_30d'],
                    'average_demand' => $row['average_demand'],
                    'coverage_days' => $row['coverage_days'],
                    'lead_time_days' => $row['lead_time_days'],
                    'safety_stock_qty' => $row['safety_stock_qty'],
                    'reorder_point_qty' => $row['reorder_point_qty'],
                    'target_stock_qty' => $row['target_stock_qty'],
                    'suggested_quantity' => $row['suggested_quantity'],
                    'unit_cost_cents' => $row['unit_cost_cents'],
                    'estimated_total_cents' => $row['estimated_total_cents'],
                    'restock_waitlist_count' => $row['restock_waitlist_count'],
                    'customer_lists_count' => $row['customer_lists_count'],
                    'forecast_quality' => $row['forecast_quality'],
                    'priority' => $row['priority'],
                    'explanation' => $row['explanation'],
                    'plan_status' => 'pending',
                ]);
            }

            return $analysis->fresh(['suggestions']) ?? $analysis;
        });

        $this->tracker->finishExecution(
            $execution,
            'completed',
            ['analysis_id' => $analysis->id, 'kpis' => $computed['kpis']],
            [['tool' => 'calculate_replenishment_metrics']],
            [],
            "REPL-#{$analysis->id}"
        );

        return $analysis;
    }

    /** @return array<string, mixed> */
    public function explainSuggestion(AiReplenishmentSuggestion $suggestion, User $actor): array
    {
        $conn = $this->provider->connectionStatus();
        $baseText = "Esta tonalidade ({$suggestion->variant_name_snapshot} — SKU {$suggestion->sku_snapshot}) "
            ."vendeu {$suggestion->sales_30d} unidade(s) nos últimos 30 dias e possui {$suggestion->available_stock} unidade(s) disponível(eis). "
            .'Considerando o prazo de reposição de '.$suggestion->lead_time_days.' dias e ponto de pedido de '.$suggestion->reorder_point_qty.' un., '
            .($suggestion->coverage_days !== null
                ? "a cobertura estimada atual é de {$suggestion->coverage_days} dias. "
                : 'não há histórico diário contínuo suficiente para estimar cobertura com precisão. ')
            .($suggestion->restock_waitlist_count > 0
                ? "Adicionalmente, {$suggestion->restock_waitlist_count} cliente(s) cadastraram aviso de reposição para este SKU. "
                : '')
            ."Sugestão calculada: {$suggestion->suggested_quantity} unidade(s).";

        if ($conn['has_api_key']) {
            $llm = $this->provider->chatStructured(
                'replenishment',
                'Você é o Analista de Estoque da Mistura Feminina. Explique em 2 a 3 frases objetivas os números reais desta sugestão de reposição sem alterar nem inventar nenhum número.',
                json_encode([
                    'sku' => $suggestion->sku_snapshot,
                    'produto' => $suggestion->product_name_snapshot,
                    'tonalidade' => $suggestion->variant_name_snapshot,
                    'estoque_disponivel' => $suggestion->available_stock,
                    'vendas_30d' => $suggestion->sales_30d,
                    'cobertura_dias' => $suggestion->coverage_days,
                    'prazo_fornecedor_dias' => $suggestion->lead_time_days,
                    'clientes_avise_me' => $suggestion->restock_waitlist_count,
                    'quantidade_sugerida' => $suggestion->suggested_quantity,
                ], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                [
                    'type' => 'object',
                    'additionalProperties' => false,
                    'required' => ['explanation'],
                    'properties' => ['explanation' => ['type' => 'string']],
                ]
            );
            $aiText = is_array($llm['content'] ?? null) ? trim((string) ($llm['content']['explanation'] ?? '')) : '';
            if ($aiText !== '') {
                $suggestion->update(['ai_explanation' => $aiText]);

                return [
                    'suggestion_id' => $suggestion->id,
                    'explanation' => $aiText,
                    'source' => 'llm_grounded',
                    'metrics' => $suggestion->toArray(),
                ];
            }
        }

        $suggestion->update(['ai_explanation' => $baseText]);

        return [
            'suggestion_id' => $suggestion->id,
            'explanation' => $baseText,
            'source' => 'deterministic',
            'metrics' => $suggestion->toArray(),
        ];
    }

    /**
     * Saves approved purchase planning quantities and optionally generates a draft GoodsReceipt
     * without ever sending an automatic order to an external supplier.
     *
     * @param  list<array{suggestion_id: int, quantity: int}>  $items
     * @return array<string, mixed>
     */
    public function savePurchasePlan(
        AiReplenishmentAnalysis $analysis,
        array $items,
        ?int $supplierId,
        bool $createGoodsReceiptDraft,
        User $actor,
    ): array {
        if ($items === []) {
            throw ValidationException::withMessages(['items' => ['Selecione ao menos uma variante para salvar o planejamento.']]);
        }

        if ($supplierId !== null) {
            Supplier::query()->findOrFail($supplierId);
        }

        $savedCount = 0;
        $receiptItems = [];

        DB::transaction(function () use ($analysis, $items, $supplierId, &$savedCount, &$receiptItems): void {
            foreach ($items as $entry) {
                /** @var AiReplenishmentSuggestion|null $suggestion */
                $suggestion = $analysis->suggestions()->where('id', (int) $entry['suggestion_id'])->first();
                if (! $suggestion) {
                    continue;
                }
                $qty = max(1, min(9999, (int) $entry['quantity']));
                $suggestion->update([
                    'adjusted_quantity' => $qty,
                    'supplier_id' => $supplierId ?? $suggestion->supplier_id,
                    'estimated_total_cents' => $qty * $suggestion->unit_cost_cents,
                    'plan_status' => 'saved_to_plan',
                ]);
                $savedCount++;
                $receiptItems[] = [
                    'product_variant_id' => $suggestion->variant_id,
                    'expected_qty' => $qty,
                    'received_qty' => 0,
                    'accepted_qty' => 0,
                    'unit_cost_cents' => $suggestion->unit_cost_cents,
                ];
            }
        });

        $draftReceipt = null;
        if ($createGoodsReceiptDraft && $receiptItems !== []) {
            $draftReceipt = $this->receipts->saveReceipt(null, [
                'supplier_id' => $supplierId,
                'purchase_reference' => "PLAN-IA-{$analysis->id}",
                'status' => 'draft',
                'notes' => "Rascunho de compra gerado a partir do planejamento de Reposição Inteligente (#{$analysis->id}). Nenhuma ordem automática enviada ao fornecedor.",
                'items' => $receiptItems,
            ], $actor);

            $analysis->suggestions()
                ->whereIn('id', array_map(fn (array $e): int => (int) $e['suggestion_id'], $items))
                ->update(['plan_status' => 'ordered_draft']);
        }

        return [
            'analysis_id' => $analysis->id,
            'saved_count' => $savedCount,
            'draft_goods_receipt_id' => $draftReceipt?->id,
            'draft_goods_receipt_number' => $draftReceipt?->receipt_number,
        ];
    }
}
