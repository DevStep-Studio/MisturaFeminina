<?php

declare(strict_types=1);

namespace App\Domain\Orders\Services;

use App\Domain\Shared\Enums\OrderStatus;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderReturnItem;
use App\Models\ProductVariant;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

class ProfitAndCostAnalyticsService
{
    public function __construct(private readonly OrderCostService $orderCost) {}

    /**
     * Centralized financial & profit computation shared across Dashboard, Reports, CSV export and drill-down.
     *
     * Recognition rules:
     * - Sales are recognized strictly when payment is confirmed (`orders.paid_at IS NOT NULL`).
     * - Returns/cancellations post-payment are accounted on the return event date (`order_returns.occurred_at`).
     * - Shipping and taxes are excluded from product revenue base.
     * - Partial margin is calculated strictly over the covered revenue of items that have a recorded unit cost.
     *
     * @return array<string, mixed>
     */
    public function periodProfitSummary(CarbonInterface $from, CarbonInterface $to, bool $includeComparison = true): array
    {
        $breakdown = $this->periodItemBreakdown($from, $to);
        $rows = $breakdown['items'];

        $productsRevenueCents = 0;
        $coveredRevenueCents = 0;
        $uncoveredRevenueCents = 0;
        $knownCmvCents = 0;
        $grossProfitCents = 0;

        $totalUnitsSold = 0;
        $coveredUnitsSold = 0;
        $missingCostUnits = 0;
        $missingCostItems = [];
        $coveredItemsCount = 0;

        foreach ($rows as $row) {
            $effQty = (int) $row['quantity'];
            $netRev = (int) $row['net_revenue_cents'];
            $productsRevenueCents += $netRev;
            $totalUnitsSold += $effQty;

            if ($row['has_cost']) {
                $cmv = (int) ($row['cmv_cents'] ?? 0);
                $coveredRevenueCents += $netRev;
                $knownCmvCents += $cmv;
                $grossProfitCents += ($netRev - $cmv);
                $coveredUnitsSold += $effQty;
                if ($effQty > 0 || $row['entry_type'] === 'sale') {
                    $coveredItemsCount++;
                }
            } else {
                $uncoveredRevenueCents += $netRev;
                if ($effQty > 0) {
                    $missingCostUnits += $effQty;
                    $missingCostItems[] = $row;
                }
            }
        }

        $grossMarginPct = $coveredRevenueCents > 0
            ? round(($grossProfitCents / $coveredRevenueCents) * 100, 2)
            : null;

        $missingCount = count($missingCostItems);
        $isPartial = $missingCount > 0;
        $coverageLabel = $isPartial
            ? sprintf(
                'Lucro parcial · %d %s sem custo informado',
                $missingCount,
                $missingCount === 1 ? 'item vendido' : 'itens vendidos'
            )
            : ($coveredItemsCount > 0 ? 'Cobertura de custo: 100%' : 'Sem vendas reconhecidas no período');

        $comparison = null;
        if ($includeComparison) {
            $spanDays = max(1, (int) $from->copy()->startOfDay()->diffInDays($to->copy()->startOfDay()) + 1);
            $prevTo = CarbonImmutable::instance($from)->startOfDay()->subSecond();
            $prevFrom = $prevTo->subDays($spanDays - 1)->startOfDay();
            $prevSummary = $this->periodProfitSummary($prevFrom, $prevTo, false);
            $prevKpis = $prevSummary['kpis'];

            $prevRev = (int) $prevKpis['products_revenue_cents'];
            $prevCmv = (int) $prevKpis['cmv_cents'];
            $prevProfit = (int) $prevKpis['gross_profit_cents'];
            $hasPriorData = ((int) $prevKpis['total_units_sold']) > 0 || $prevRev > 0;

            $comparison = [
                'previous_from' => $prevFrom->toDateString(),
                'previous_to' => $prevTo->toDateString(),
                'has_prior_data' => $hasPriorData,
                'previous_products_revenue_cents' => $prevRev,
                'previous_cmv_cents' => $prevCmv,
                'previous_gross_profit_cents' => $prevProfit,
                'revenue_delta_pct' => ($hasPriorData && $prevRev > 0)
                    ? round((($productsRevenueCents - $prevRev) / $prevRev) * 100, 1)
                    : null,
                'cmv_delta_pct' => ($hasPriorData && $prevCmv > 0)
                    ? round((($knownCmvCents - $prevCmv) / $prevCmv) * 100, 1)
                    : null,
                'profit_delta_pct' => ($hasPriorData && $prevProfit > 0)
                    ? round((($grossProfitCents - $prevProfit) / $prevProfit) * 100, 1)
                    : null,
            ];
        }

        return [
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'sale_recognition_rule' => 'Confirmação do pagamento (orders.paid_at)',
                'adjustment_date_rule' => 'Data do evento de devolução/estorno (order_returns.occurred_at)',
            ],
            'kpis' => [
                'products_revenue_cents' => $productsRevenueCents,
                'cmv_cents' => $knownCmvCents,
                'gross_profit_cents' => $grossProfitCents,
                'gross_margin_pct' => $grossMarginPct,
                'covered_revenue_cents' => $coveredRevenueCents,
                'uncovered_revenue_cents' => $uncoveredRevenueCents,
                'total_units_sold' => $totalUnitsSold,
                'covered_units_sold' => $coveredUnitsSold,
                'missing_cost_units' => $missingCostUnits,
            ],
            'coverage' => [
                'is_partial' => $isPartial,
                'covered_items_count' => $coveredItemsCount,
                'missing_cost_items_count' => $missingCount,
                'missing_cost_units_count' => $missingCostUnits,
                'label' => $coverageLabel,
            ],
            'comparison' => $comparison,
            'missing_cost_items' => array_values($missingCostItems),
        ];
    }

    /**
     * Item-level drill-down dataset matching the exact KPI totals above.
     *
     * @return array{
     *   period: array<string, string>,
     *   totals: array<string, mixed>,
     *   items: list<array<string, mixed>>
     * }
     */
    public function periodItemBreakdown(
        CarbonInterface $from,
        CarbonInterface $to,
        ?string $filter = null,
    ): array {
        $recognizedOrders = Order::query()
            ->whereNotNull('paid_at')
            ->whereBetween('paid_at', [$from, $to])
            ->with([
                'items' => fn ($q) => $q->orderBy('id'),
                'items.product' => fn ($pq) => $pq->withTrashed()->select(['id', 'name', 'sku', 'slug']),
            ])
            ->orderByDesc('paid_at')
            ->orderByDesc('id')
            ->get();

        // Returns whose occurred_at sits in [from, to]
        $periodReturnItems = OrderReturnItem::query()
            ->whereHas('orderReturn', fn ($q) => $q->whereBetween('occurred_at', [$from, $to]))
            ->with([
                'orderReturn:id,order_id,return_type,restock_items,reason,occurred_at',
                'orderReturn.order:id,order_number,paid_at,customer_name',
                'orderItem:id,order_id,product_id,product_variant_id,product_name_snapshot,variant_name_snapshot,sku_snapshot,quantity,unit_price_cents,total_cents,net_revenue_cents,order_discount_allocated_cents,unit_cost_cents_snapshot,cost_source',
            ])
            ->orderByDesc('id')
            ->get();

        $samePeriodReturnsByOrderItem = [];
        $priorPeriodReturnRows = [];

        foreach ($periodReturnItems as $ri) {
            $retOrder = $ri->orderReturn?->order;
            $oi = $ri->orderItem;
            if (! $oi || ! $retOrder) {
                continue;
            }
            $paidInSamePeriod = $retOrder->paid_at !== null
                && $retOrder->paid_at->greaterThanOrEqualTo($from)
                && $retOrder->paid_at->lessThanOrEqualTo($to);

            if ($paidInSamePeriod) {
                if (! isset($samePeriodReturnsByOrderItem[$oi->id])) {
                    $samePeriodReturnsByOrderItem[$oi->id] = [
                        'qty' => 0,
                        'restocked_qty' => 0,
                        'rev' => 0,
                        'cogs' => 0,
                    ];
                }
                $samePeriodReturnsByOrderItem[$oi->id]['qty'] += (int) $ri->returned_qty;
                $samePeriodReturnsByOrderItem[$oi->id]['restocked_qty'] += (int) $ri->restocked_qty;
                $samePeriodReturnsByOrderItem[$oi->id]['rev'] += (int) $ri->revenue_reversed_cents;
                if ($ri->cogs_reversed_cents !== null) {
                    $samePeriodReturnsByOrderItem[$oi->id]['cogs'] += (int) $ri->cogs_reversed_cents;
                }
            } else {
                $unitCost = $ri->unit_cost_cents_snapshot ?? $oi->unit_cost_cents_snapshot;
                $hasCost = $unitCost !== null;
                $revDelta = -((int) $ri->revenue_reversed_cents);
                $cmvDelta = $hasCost ? -((int) ($ri->cogs_reversed_cents ?? ((int) $ri->returned_qty * (int) $unitCost))) : null;
                $profitDelta = $hasCost ? ($revDelta - (int) $cmvDelta) : null;

                $priorPeriodReturnRows[] = [
                    'entry_type' => 'return_adjustment',
                    'order_id' => $retOrder->id,
                    'order_number' => $retOrder->order_number,
                    'order_item_id' => $oi->id,
                    'event_date' => $ri->orderReturn->occurred_at->toIso8601String(),
                    'paid_at' => $retOrder->paid_at?->toIso8601String(),
                    'product_id' => $oi->product_id,
                    'variant_id' => $oi->product_variant_id,
                    'product_name' => $oi->product_name_snapshot,
                    'variant_name' => $oi->variant_name_snapshot,
                    'sku' => $oi->sku_snapshot,
                    'sold_qty' => 0,
                    'returned_qty' => (int) $ri->returned_qty,
                    'quantity' => -((int) $ri->returned_qty),
                    'gross_item_total_cents' => 0,
                    'order_discount_allocated_cents' => 0,
                    'net_revenue_cents' => $revDelta,
                    'unit_cost_cents_snapshot' => $unitCost,
                    'has_cost' => $hasCost,
                    'cost_source' => $oi->cost_source ?? ($hasCost ? 'historical' : 'missing'),
                    'cmv_cents' => $cmvDelta,
                    'gross_profit_cents' => $profitDelta,
                    'margin_pct' => null,
                    'note' => 'Ajuste por devolução/estorno: '.$ri->orderReturn->reason,
                ];
            }
        }

        $items = [];
        foreach ($recognizedOrders as $order) {
            $orderItems = $order->items;
            $needsAlloc = $orderItems->contains(fn (OrderItem $it): bool => $it->net_revenue_cents === null);
            $allocs = $needsAlloc
                ? $this->orderCost->allocateOrderDiscounts(
                    $orderItems->map(fn (OrderItem $it): int => max(0, (int) $it->total_cents))->values()->all(),
                    (int) $order->discount_cents
                )
                : [];

            foreach ($orderItems->values() as $idx => $oi) {
                $allocDiscount = $oi->net_revenue_cents !== null
                    ? (int) $oi->order_discount_allocated_cents
                    : ($allocs[$idx] ?? 0);
                $initialNetRev = $oi->net_revenue_cents !== null
                    ? (int) $oi->net_revenue_cents
                    : max(0, (int) $oi->total_cents - $allocDiscount);

                $ret = $samePeriodReturnsByOrderItem[$oi->id] ?? ['qty' => 0, 'restocked_qty' => 0, 'rev' => 0, 'cogs' => 0];
                $effQty = max(0, (int) $oi->quantity - $ret['qty']);
                $netRev = max(0, $initialNetRev - $ret['rev']);

                $unitCost = $oi->unit_cost_cents_snapshot;
                $hasCost = $unitCost !== null;
                $initialCmv = $hasCost ? ((int) $oi->quantity * (int) $unitCost) : null;
                $cmv = $hasCost ? max(0, (int) $initialCmv - $ret['cogs']) : null;
                $grossProfit = $hasCost ? ($netRev - (int) $cmv) : null;
                $marginPct = ($hasCost && $netRev > 0)
                    ? round(((int) $grossProfit / $netRev) * 100, 2)
                    : null;

                $items[] = [
                    'entry_type' => 'sale',
                    'order_id' => $order->id,
                    'order_number' => $order->order_number,
                    'order_item_id' => $oi->id,
                    'event_date' => $order->paid_at?->toIso8601String() ?? $order->created_at?->toIso8601String(),
                    'paid_at' => $order->paid_at?->toIso8601String(),
                    'product_id' => $oi->product_id,
                    'variant_id' => $oi->product_variant_id,
                    'product_name' => $oi->product_name_snapshot,
                    'variant_name' => $oi->variant_name_snapshot,
                    'sku' => $oi->sku_snapshot,
                    'sold_qty' => (int) $oi->quantity,
                    'returned_qty' => $ret['qty'],
                    'restocked_qty' => $ret['restocked_qty'],
                    'quantity' => $effQty,
                    'gross_item_total_cents' => (int) $oi->total_cents,
                    'order_discount_allocated_cents' => $allocDiscount,
                    'net_revenue_cents' => $netRev,
                    'unit_cost_cents_snapshot' => $unitCost,
                    'has_cost' => $hasCost,
                    'cost_source' => $oi->cost_source ?? ($hasCost ? 'historical' : 'missing'),
                    'cmv_cents' => $cmv,
                    'gross_profit_cents' => $grossProfit,
                    'margin_pct' => $marginPct,
                    'note' => $ret['qty'] > 0 ? "{$ret['qty']} un. devolvida(s) no período" : null,
                ];
            }
        }

        $allItems = array_merge($items, $priorPeriodReturnRows);

        if ($filter === 'missing_cost') {
            $allItems = array_values(array_filter(
                $allItems,
                fn (array $row): bool => ! $row['has_cost'] && (int) $row['quantity'] > 0
            ));
        }

        $totalsRev = 0;
        $totalsCoveredRev = 0;
        $totalsCmv = 0;
        $totalsProfit = 0;
        $totalsQty = 0;
        foreach ($allItems as $r) {
            $totalsRev += (int) $r['net_revenue_cents'];
            $totalsQty += (int) $r['quantity'];
            if ($r['has_cost']) {
                $totalsCoveredRev += (int) $r['net_revenue_cents'];
                $totalsCmv += (int) ($r['cmv_cents'] ?? 0);
                $totalsProfit += (int) ($r['gross_profit_cents'] ?? 0);
            }
        }

        return [
            'period' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
            ],
            'totals' => [
                'quantity' => $totalsQty,
                'products_revenue_cents' => $totalsRev,
                'covered_revenue_cents' => $totalsCoveredRev,
                'cmv_cents' => $totalsCmv,
                'gross_profit_cents' => $totalsProfit,
                'gross_margin_pct' => $totalsCoveredRev > 0 ? round(($totalsProfit / $totalsCoveredRev) * 100, 2) : null,
            ],
            'items' => array_values($allItems),
        ];
    }

    /**
     * Product-level profit ranking strictly computed from recognized net item revenues and historical costs.
     *
     * @return list<array<string, mixed>>
     */
    public function topProductsProfitBreakdown(CarbonInterface $from, CarbonInterface $to, int $limit = 10): array
    {
        $breakdown = $this->periodItemBreakdown($from, $to);
        $grouped = [];

        foreach ($breakdown['items'] as $row) {
            $sku = (string) $row['sku'];
            if (! isset($grouped[$sku])) {
                $grouped[$sku] = [
                    'sku_snapshot' => $sku,
                    'product_name_snapshot' => (string) $row['product_name'],
                    'variant_name_snapshot' => (string) $row['variant_name'],
                    'qty_sold' => 0,
                    'revenue_cents' => 0,
                    'covered_revenue_cents' => 0,
                    'cmv_cents' => 0,
                    'gross_profit_cents' => 0,
                    'has_missing_cost' => false,
                ];
            }
            $grouped[$sku]['qty_sold'] += (int) $row['quantity'];
            $grouped[$sku]['revenue_cents'] += (int) $row['net_revenue_cents'];
            if ($row['has_cost']) {
                $grouped[$sku]['covered_revenue_cents'] += (int) $row['net_revenue_cents'];
                $grouped[$sku]['cmv_cents'] += (int) ($row['cmv_cents'] ?? 0);
                $grouped[$sku]['gross_profit_cents'] += (int) ($row['gross_profit_cents'] ?? 0);
            } elseif ((int) $row['quantity'] > 0) {
                $grouped[$sku]['has_missing_cost'] = true;
            }
        }

        $list = array_values(array_filter($grouped, fn (array $g): bool => $g['qty_sold'] > 0 || $g['revenue_cents'] > 0));
        foreach ($list as &$entry) {
            $entry['gross_margin_pct'] = $entry['covered_revenue_cents'] > 0
                ? round(($entry['gross_profit_cents'] / $entry['covered_revenue_cents']) * 100, 2)
                : null;
        }
        unset($entry);

        usort($list, static fn (array $a, array $b): int => $b['revenue_cents'] <=> $a['revenue_cents']);

        return array_slice($list, 0, $limit);
    }

    /**
     * Current inventory valuation at cost (counting each variant SKU strictly once, never double-counting parent+variants),
     * OR explicit reference-date reconstruction from immutable `inventory_movements` ledger.
     *
     * @return array<string, mixed>
     */
    public function inventoryCostValuation(?CarbonInterface $asOf = null): array
    {
        $isHistorical = $asOf !== null;
        $variants = ProductVariant::query()
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->whereNull('products.deleted_at')
            ->select('product_variants.*')
            ->with(['product' => fn ($q) => $q->select(['id', 'name', 'sku', 'slug', 'cost_cents', 'is_active'])])
            ->orderBy('product_variants.id')
            ->get();

        $movementQtyByVariant = [];
        if ($isHistorical) {
            $cutoff = $asOf->copy()->endOfDay();
            $latestIds = DB::table('inventory_movements')
                ->where('created_at', '<=', $cutoff)
                ->selectRaw('product_variant_id, MAX(id) as max_id')
                ->groupBy('product_variant_id')
                ->pluck('max_id', 'product_variant_id');

            if ($latestIds->isNotEmpty()) {
                $movementQtyByVariant = InventoryMovement::query()
                    ->whereIn('id', $latestIds->values()->all())
                    ->pluck('physical_after', 'product_variant_id')
                    ->map(fn ($v): int => max(0, (int) $v))
                    ->all();
            }
        }

        $totalCostCents = 0;
        $totalUnits = 0;
        $valuedUnits = 0;
        $missingCostUnits = 0;
        $totalSkus = 0;
        $valuedSkus = 0;
        $missingSkus = [];

        foreach ($variants as $variant) {
            $qty = $isHistorical
                ? (int) ($movementQtyByVariant[$variant->id] ?? 0)
                : max(0, (int) $variant->stock_qty);

            if ($qty <= 0) {
                continue;
            }

            $totalSkus++;
            $totalUnits += $qty;
            $unitCost = $variant->effectiveCostCents();

            if ($unitCost === null) {
                $missingCostUnits += $qty;
                $missingSkus[] = [
                    'product_id' => $variant->product_id,
                    'variant_id' => $variant->id,
                    'sku' => $variant->sku,
                    'product_name' => $variant->product?->name ?? 'Produto',
                    'variant_name' => $variant->name,
                    'stock_qty' => $qty,
                ];
            } else {
                $valuedSkus++;
                $valuedUnits += $qty;
                $totalCostCents += ($qty * $unitCost);
            }
        }

        $missingCount = count($missingSkus);
        $isPartial = $missingCount > 0;

        return [
            'label' => $isHistorical
                ? 'Posição histórica em '.$asOf->format('d/m/Y')
                : 'Posição atual',
            'is_historical_reference' => $isHistorical,
            'as_of' => ($asOf ?? now())->toIso8601String(),
            'note' => $isHistorical
                ? 'Quantidade reconstituída pelo último movimento de estoque registrado até a data de referência.'
                : 'Saldo físico atual contado uma única vez por SKU de variação.',
            'total_cost_cents' => $totalCostCents,
            'total_units' => $totalUnits,
            'valued_units' => $valuedUnits,
            'missing_cost_units' => $missingCostUnits,
            'total_skus' => $totalSkus,
            'valued_skus' => $valuedSkus,
            'missing_cost_skus_count' => $missingCount,
            'is_partial' => $isPartial,
            'coverage_label' => $isPartial
                ? sprintf('Valor parcial · %d %s em estoque sem custo informado', $missingCount, $missingCount === 1 ? 'SKU' : 'SKUs')
                : ($totalSkus > 0 ? 'Cobertura de custo: 100%' : 'Nenhum SKU com saldo positivo'),
            'missing_skus' => $missingSkus,
        ];
    }

    /**
     * Financial & gross profit summary for a single Order (used by AdminOrderController::show).
     *
     * @return array<string, mixed>
     */
    public function summarizeOrder(Order $order, bool $includeCost): array
    {
        $order->loadMissing([
            'items' => fn ($q) => $q->orderBy('id'),
            'returns.items',
        ]);

        $orderItems = $order->items;
        $needsAlloc = $orderItems->contains(fn (OrderItem $it): bool => $it->net_revenue_cents === null);
        $allocs = $needsAlloc
            ? $this->orderCost->allocateOrderDiscounts(
                $orderItems->map(fn (OrderItem $it): int => max(0, (int) $it->total_cents))->values()->all(),
                (int) $order->discount_cents
            )
            : [];

        $serializedItems = [];
        $productsRevenueCents = 0;
        $coveredRevenueCents = 0;
        $knownCmvCents = 0;
        $grossProfitCents = 0;
        $missingCostCount = 0;

        foreach ($orderItems->values() as $idx => $oi) {
            $allocDiscount = $oi->net_revenue_cents !== null
                ? (int) $oi->order_discount_allocated_cents
                : ($allocs[$idx] ?? 0);
            $initialNet = $oi->net_revenue_cents !== null
                ? (int) $oi->net_revenue_cents
                : max(0, (int) $oi->total_cents - $allocDiscount);
            $returnedQty = (int) $oi->returned_qty;
            $restockedQty = (int) $oi->restocked_qty;
            $remainingQty = max(0, (int) $oi->quantity - $returnedQty);
            $returnedRev = (int) $oi->returned_revenue_cents;
            $effectiveNetRev = max(0, $initialNet - $returnedRev);

            $productsRevenueCents += $effectiveNetRev;

            $rowPayload = [
                'id' => $oi->id,
                'product_id' => $oi->product_id,
                'product_variant_id' => $oi->product_variant_id,
                'product_name_snapshot' => $oi->product_name_snapshot,
                'variant_name_snapshot' => $oi->variant_name_snapshot,
                'sku_snapshot' => $oi->sku_snapshot,
                'quantity' => (int) $oi->quantity,
                'returned_qty' => $returnedQty,
                'restocked_qty' => $restockedQty,
                'remaining_qty' => $remainingQty,
                'unit_price_cents' => (int) $oi->unit_price_cents,
                'discount_cents' => (int) $oi->discount_cents,
                'order_discount_allocated_cents' => $allocDiscount,
                'total_cents' => (int) $oi->total_cents,
                'net_revenue_cents' => $effectiveNetRev,
                'returned_revenue_cents' => $returnedRev,
                'wholesale_rule_id' => $oi->wholesale_rule_id,
                'wholesale_rule_name' => $oi->wholesale_rule_name,
                'wholesale_tier_min_qty' => $oi->wholesale_tier_min_qty,
                'wholesale_discount_cents' => (int) ($oi->wholesale_discount_cents ?? 0),
                'wholesale_unit_price_cents' => $oi->wholesale_unit_price_cents,
                'original_unit_price_cents' => $oi->original_unit_price_cents,
            ];

            if ($includeCost) {
                $unitCost = $oi->unit_cost_cents_snapshot;
                $hasCost = $unitCost !== null;
                $lineCmv = $hasCost ? ($remainingQty * (int) $unitCost) : null;
                $lineProfit = $hasCost ? ($effectiveNetRev - (int) $lineCmv) : null;
                $lineMargin = ($hasCost && $effectiveNetRev > 0)
                    ? round(((int) $lineProfit / $effectiveNetRev) * 100, 2)
                    : null;

                if ($hasCost) {
                    $coveredRevenueCents += $effectiveNetRev;
                    $knownCmvCents += (int) $lineCmv;
                    $grossProfitCents += (int) $lineProfit;
                } elseif ($remainingQty > 0) {
                    $missingCostCount++;
                }

                $rowPayload['unit_cost_cents_snapshot'] = $unitCost;
                $rowPayload['has_cost'] = $hasCost;
                $rowPayload['cost_source'] = $oi->cost_source ?? ($hasCost ? 'historical' : 'missing');
                $rowPayload['cost_recorded_at'] = $oi->cost_recorded_at?->toIso8601String();
                $rowPayload['cost_backfilled_at'] = $oi->cost_backfilled_at?->toIso8601String();
                $rowPayload['cmv_cents'] = $lineCmv;
                $rowPayload['gross_profit_cents'] = $lineProfit;
                $rowPayload['gross_margin_pct'] = $lineMargin;
            }

            $serializedItems[] = $rowPayload;
        }

        $summary = null;
        if ($includeCost) {
            $isRecognized = $order->paid_at !== null;
            $marginPct = $coveredRevenueCents > 0
                ? round(($grossProfitCents / $coveredRevenueCents) * 100, 2)
                : null;

            $summary = [
                'is_recognized_sale' => $isRecognized,
                'products_revenue_cents' => $productsRevenueCents,
                'covered_revenue_cents' => $coveredRevenueCents,
                'cmv_cents' => $knownCmvCents,
                'gross_profit_cents' => $grossProfitCents,
                'gross_margin_pct' => $marginPct,
                'is_partial' => $missingCostCount > 0,
                'missing_cost_items_count' => $missingCostCount,
                'coverage_label' => $missingCostCount > 0
                    ? "Lucro parcial · {$missingCostCount} ".($missingCostCount === 1 ? 'item sem custo histórico' : 'itens sem custo histórico')
                    : 'Cobertura completa',
            ];
        }

        return [
            'items' => $serializedItems,
            'financial_summary' => $summary,
            'returns' => $order->returns->map(fn ($r): array => [
                'id' => $r->id,
                'return_type' => $r->return_type,
                'restock_items' => $r->restock_items,
                'financial_refund_cents' => $r->financial_refund_cents,
                'reason' => $r->reason,
                'occurred_at' => $r->occurred_at->toIso8601String(),
                'items' => $r->items->map(fn ($ri): array => [
                    'order_item_id' => $ri->order_item_id,
                    'returned_qty' => $ri->returned_qty,
                    'restocked_qty' => $ri->restocked_qty,
                    'revenue_reversed_cents' => $ri->revenue_reversed_cents,
                    'cogs_reversed_cents' => $includeCost ? $ri->cogs_reversed_cents : null,
                ])->values()->all(),
            ])->values()->all(),
        ];
    }
}
