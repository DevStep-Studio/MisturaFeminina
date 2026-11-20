<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use App\Domain\Shared\Enums\OrderStatus;
use App\Models\ProductVariant;
use App\Models\Supplier;
use Illuminate\Support\Facades\DB;

class ReplenishmentCalculator
{
    /**
     * Deterministically evaluates every active SKU/variant individually to detect rupture risks
     * even when sibling shades in the same product line still hold high stock.
     *
     * @param  array<string, mixed>  $params
     * @return array{kpis: array<string, mixed>, items: list<array<string, mixed>>}
     */
    public function calculate(array $params = []): array
    {
        $periodDays = max(7, min(90, (int) ($params['analysis_period'] ?? 30)));
        $defaultLeadTimeDays = max(1, min(60, (int) ($params['lead_time_days'] ?? 7)));
        $safetyStockDays = max(1, min(30, (int) ($params['safety_stock_days'] ?? 3)));
        $targetCoverageDays = max($defaultLeadTimeDays + $safetyStockDays, min(90, (int) ($params['target_coverage_days'] ?? 21)));
        $supplierId = ! empty($params['supplier_id']) ? (int) $params['supplier_id'] : null;

        /** @var Supplier|null $selectedSupplier */
        $selectedSupplier = $supplierId ? Supplier::query()->find($supplierId) : null;
        $leadTimeDays = $selectedSupplier?->lead_time_days ?: $defaultLeadTimeDays;
        $minOrderQty = max(1, (int) ($selectedSupplier->min_order_qty ?? 1));

        $paidStatuses = [
            OrderStatus::Paid->value,
            OrderStatus::Preparing->value,
            OrderStatus::Shipped->value,
            OrderStatus::Delivered->value,
        ];
        $returnStatuses = [OrderStatus::Refunded->value, OrderStatus::Cancelled->value];

        $since90 = now()->subDays(90);
        $since30 = now()->subDays(30);
        $since7 = now()->subDays(7);

        $salesRows = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->where('orders.created_at', '>=', $since90)
            ->whereIn('orders.status', $paidStatuses)
            ->groupBy('order_items.product_variant_id')
            ->selectRaw('
                order_items.product_variant_id as variant_id,
                SUM(CASE WHEN orders.created_at >= ? THEN order_items.quantity ELSE 0 END) as qty_7d,
                SUM(CASE WHEN orders.created_at >= ? THEN order_items.quantity ELSE 0 END) as qty_30d,
                SUM(order_items.quantity) as qty_90d
            ', [$since7, $since30])
            ->get()
            ->keyBy('variant_id');

        $returnsRows = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->where('orders.created_at', '>=', $since30)
            ->whereIn('orders.status', $returnStatuses)
            ->groupBy('order_items.product_variant_id')
            ->selectRaw('order_items.product_variant_id as variant_id, SUM(order_items.quantity) as qty_returned')
            ->get()
            ->keyBy('variant_id');

        $pendingInboundRows = DB::table('goods_receipt_items')
            ->join('goods_receipts', 'goods_receipt_items.goods_receipt_id', '=', 'goods_receipts.id')
            ->whereIn('goods_receipts.status', ['draft', 'checking', 'verified', 'discrepancy'])
            ->groupBy('goods_receipt_items.product_variant_id')
            ->selectRaw('goods_receipt_items.product_variant_id as variant_id, SUM(goods_receipt_items.accepted_qty) as pending_qty')
            ->get()
            ->keyBy('variant_id');

        $waitlistRows = DB::table('restock_requests')
            ->where('status', 'pending')
            ->groupBy('product_variant_id')
            ->selectRaw('product_variant_id as variant_id, COUNT(*) as waitlist_count')
            ->get()
            ->keyBy('variant_id');

        $listRows = DB::table('replenishment_list_items')
            ->groupBy('product_variant_id')
            ->selectRaw('product_variant_id as variant_id, COUNT(DISTINCT replenishment_list_id) as lists_count')
            ->get()
            ->keyBy('variant_id');

        $variants = ProductVariant::query()
            ->where('is_active', true)
            ->whereHas('product', fn ($q) => $q->where('is_active', true))
            ->with(['product:id,name,slug,sku,brand_id,cost_cents,price_cents,created_at', 'product.brand:id,name'])
            ->get();

        $results = [];
        $outOfStockCount = 0;
        $ruptureRiskCount = 0;
        $waitlistTotalCount = 0;
        $suggestionsNeededCount = 0;
        $estimatedOrderCostCents = 0;

        foreach ($variants as $variant) {
            /** @var ProductVariant $variant */
            $product = $variant->product;
            if (! $product) {
                continue;
            }

            $vid = $variant->id;
            $sales7 = (int) ($salesRows->get($vid)->qty_7d ?? 0);
            $sales30 = (int) ($salesRows->get($vid)->qty_30d ?? 0);
            $sales90 = (int) ($salesRows->get($vid)->qty_90d ?? 0);
            $returns30 = (int) ($returnsRows->get($vid)->qty_returned ?? 0);
            $pendingInbound = (int) ($pendingInboundRows->get($vid)->pending_qty ?? 0);
            $waitlistCount = (int) ($waitlistRows->get($vid)->waitlist_count ?? 0);
            $listsCount = (int) ($listRows->get($vid)->lists_count ?? 0);

            $available = $variant->availableStock();
            $reserved = (int) $variant->reserved_qty;

            $netSalesPeriod = max(0, ($periodDays === 7 ? $sales7 : ($periodDays === 90 ? $sales90 : $sales30)) - $returns30);
            $avgDaily = round($netSalesPeriod / $periodDays, 4);

            // Detect forecast quality transparently
            $isNew = $product->created_at !== null && $product->created_at->greaterThan(now()->subDays(14));
            $forecastQuality = 'high_confidence';
            if ($sales90 === 0 && $waitlistCount === 0) {
                $forecastQuality = $isNew ? 'new_product' : 'low_history';
            } elseif ($sales30 > 0 && $sales7 >= $sales30 * 0.7 && $sales30 >= 10) {
                $forecastQuality = 'irregular_demand';
            } elseif ($available <= 0 && ($sales30 > 0 || $waitlistCount > 0)) {
                $forecastQuality = 'out_of_stock_distortion';
            }

            $coverageDays = $avgDaily > 0 ? round($available / $avgDaily, 1) : null;
            $demandDuringLead = (int) ceil($avgDaily * $leadTimeDays);
            $safetyStock = (int) ceil($avgDaily * $safetyStockDays);
            $reorderPoint = $demandDuringLead + $safetyStock;
            $targetStock = (int) ceil($avgDaily * $targetCoverageDays);

            // Include secondary demand signals (waitlist + B2B lists) conservatively if historical sales were capped by zero stock
            if ($available === 0 && $waitlistCount > 0 && $targetStock < $waitlistCount) {
                $targetStock = $waitlistCount;
            }

            $inventoryPosition = $available + $pendingInbound;
            $rawSuggested = max(0, $targetStock - $inventoryPosition);

            if ($rawSuggested > 0 && $minOrderQty > 1) {
                $rawSuggested = (int) (ceil($rawSuggested / $minOrderQty) * $minOrderQty);
            }

            // Priority classification using transparent operational rules
            $priority = 'low';
            if ($available <= 0 && ($avgDaily > 0 || $waitlistCount > 0)) {
                $priority = 'critical';
            } elseif ($coverageDays !== null && $coverageDays <= $leadTimeDays && $avgDaily > 0) {
                $priority = 'critical';
            } elseif (($coverageDays !== null && $coverageDays <= ($leadTimeDays + $safetyStockDays) && $avgDaily > 0) || ($rawSuggested > 0 && $available <= $reorderPoint)) {
                $priority = 'high';
            } elseif ($rawSuggested > 0 || $waitlistCount > 0) {
                $priority = 'normal';
            }

            // Skip completely inactive/idle SKUs unless out of stock or has demand
            if ($rawSuggested === 0 && $available > 0 && $sales30 === 0 && $waitlistCount === 0) {
                continue;
            }

            if ($available <= 0) {
                $outOfStockCount++;
            }
            if (in_array($priority, ['critical', 'high'], true)) {
                $ruptureRiskCount++;
            }
            if ($waitlistCount > 0) {
                $waitlistTotalCount += $waitlistCount;
            }
            if ($rawSuggested > 0) {
                $suggestionsNeededCount++;
            }

            $unitCostCents = (int) ($product->cost_cents ?: (int) round($variant->effectivePriceCents() * 0.5));
            $estLineCost = $rawSuggested * $unitCostCents;
            $estimatedOrderCostCents += $estLineCost;

            $explanation = $this->buildDeterministicExplanation(
                $available,
                $sales30,
                $coverageDays,
                $leadTimeDays,
                $waitlistCount,
                $pendingInbound,
                $rawSuggested,
                $forecastQuality
            );

            $results[] = [
                'product_id' => $product->id,
                'variant_id' => $vid,
                'supplier_id' => $selectedSupplier?->id,
                'sku' => $variant->sku,
                'product_name' => $product->name,
                'variant_name' => $variant->name,
                'shade_code' => $variant->shade_code,
                'brand_name' => $product->brand?->name,
                'available_stock' => $available,
                'reserved_stock' => $reserved,
                'pending_inbound_qty' => $pendingInbound,
                'sales_7d' => $sales7,
                'sales_30d' => $sales30,
                'sales_90d' => $sales90,
                'returns_30d' => $returns30,
                'average_demand' => $avgDaily,
                'coverage_days' => $coverageDays,
                'lead_time_days' => $leadTimeDays,
                'lead_time_source' => $selectedSupplier?->lead_time_days ? 'supplier' : 'default_policy',
                'safety_stock_qty' => $safetyStock,
                'reorder_point_qty' => $reorderPoint,
                'target_stock_qty' => $targetStock,
                'suggested_quantity' => $rawSuggested,
                'unit_cost_cents' => $unitCostCents,
                'estimated_total_cents' => $estLineCost,
                'restock_waitlist_count' => $waitlistCount,
                'customer_lists_count' => $listsCount,
                'forecast_quality' => $forecastQuality,
                'priority' => $priority,
                'explanation' => $explanation,
            ];
        }

        usort($results, function (array $a, array $b): int {
            $order = ['critical' => 0, 'high' => 1, 'normal' => 2, 'low' => 3];
            $pa = $order[$a['priority']];
            $pb = $order[$b['priority']];
            if ($pa !== $pb) {
                return $pa <=> $pb;
            }

            return $b['suggested_quantity'] <=> $a['suggested_quantity'];
        });

        return [
            'kpis' => [
                'analyzed_variants_count' => count($results),
                'rupture_risk_count' => $ruptureRiskCount,
                'out_of_stock_count' => $outOfStockCount,
                'waitlist_demand_count' => $waitlistTotalCount,
                'suggestions_count' => $suggestionsNeededCount,
                'estimated_total_cents' => $estimatedOrderCostCents,
            ],
            'items' => array_slice($results, 0, 250),
        ];
    }

    private function buildDeterministicExplanation(
        int $available,
        int $sales30,
        ?float $coverageDays,
        int $leadTimeDays,
        int $waitlistCount,
        int $pendingInbound,
        int $suggestedQty,
        string $forecastQuality,
    ): string {
        if ($forecastQuality === 'low_history' || $forecastQuality === 'new_product') {
            return $waitlistCount > 0
                ? "Dados históricos insuficientes de vendas; porém existem {$waitlistCount} cliente(s) na fila Avise-me para esta tonalidade."
                : 'Dados insuficientes para estimar a demanda com confiança no período selecionado.';
        }

        $parts = ["Vendeu {$sales30} un. nos últimos 30 dias e possui {$available} un. disponíveis."];
        if ($coverageDays !== null) {
            $parts[] = "Cobertura estimada de {$coverageDays} dias frente ao prazo de reposição de {$leadTimeDays} dias.";
        }
        if ($waitlistCount > 0) {
            $parts[] = "{$waitlistCount} cliente(s) aguardam aviso de reposição.";
        }
        if ($pendingInbound > 0) {
            $parts[] = "Já constam {$pendingInbound} un. em conferência/recebimento.";
        }
        if ($suggestedQty > 0) {
            $parts[] = "Sugestão conservadora: {$suggestedQty} un.";
        }

        return implode(' ', $parts);
    }
}
