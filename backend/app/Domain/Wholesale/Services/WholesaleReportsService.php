<?php

declare(strict_types=1);

namespace App\Domain\Wholesale\Services;

use App\Models\OrderItem;
use App\Models\WholesaleCustomerGroupMember;
use App\Models\WholesaleRule;
use Illuminate\Support\Facades\DB;

class WholesaleReportsService
{
    /**
     * Get wholesale performance overview KPIs.
     *
     * @return array<string, mixed>
     */
    public function summary(): array
    {
        // Items ordered with wholesale discount
        $wholesaleItemsQuery = OrderItem::query()
            ->whereNotNull('wholesale_rule_id')
            ->where('wholesale_discount_cents', '>', 0);

        $totalWholesaleRevenueCents = (int) $wholesaleItemsQuery->sum('total_cents');
        $totalWholesaleDiscountsCents = (int) $wholesaleItemsQuery->sum(DB::raw('wholesale_discount_cents * quantity'));
        $totalWholesaleUnits = (int) $wholesaleItemsQuery->sum('quantity');

        $distinctWholesaleOrders = (int) OrderItem::query()
            ->whereNotNull('wholesale_rule_id')
            ->distinct('order_id')
            ->count('order_id');

        $averageOrderTicketCents = $distinctWholesaleOrders > 0
            ? (int) round($totalWholesaleRevenueCents / $distinctWholesaleOrders)
            : 0;

        $activeRulesCount = WholesaleRule::query()->where('status', 'active')->count();
        $approvedResellersCount = WholesaleCustomerGroupMember::query()->where('status', 'approved')->count();
        $pendingResellersCount = WholesaleCustomerGroupMember::query()->where('status', 'pending')->count();

        return [
            'total_wholesale_revenue_cents' => $totalWholesaleRevenueCents,
            'total_wholesale_discounts_cents' => $totalWholesaleDiscountsCents,
            'total_wholesale_units' => $totalWholesaleUnits,
            'distinct_wholesale_orders_count' => $distinctWholesaleOrders,
            'average_wholesale_ticket_cents' => $averageOrderTicketCents,
            'active_rules_count' => $activeRulesCount,
            'approved_resellers_count' => $approvedResellersCount,
            'pending_resellers_count' => $pendingResellersCount,
        ];
    }

    /**
     * Top selling products in wholesale.
     *
     * @return list<array<string, mixed>>
     */
    public function topProducts(int $limit = 10): array
    {
        $results = DB::table('order_items')
            ->whereNotNull('wholesale_rule_id')
            ->select([
                'product_id',
                'sku_snapshot',
                'product_name_snapshot',
                DB::raw('SUM(quantity) as total_units'),
                DB::raw('SUM(total_cents) as total_revenue_cents'),
                DB::raw('SUM(wholesale_discount_cents * quantity) as total_discounts_cents'),
            ])
            ->groupBy(['product_id', 'sku_snapshot', 'product_name_snapshot'])
            ->orderByDesc('total_units')
            ->limit($limit)
            ->get();

        return $results->map(fn ($r) => [
            'product_id' => (int) $r->product_id,
            'sku' => (string) $r->sku_snapshot,
            'name' => (string) $r->product_name_snapshot,
            'total_units' => (int) $r->total_units,
            'total_revenue_cents' => (int) $r->total_revenue_cents,
            'total_discounts_cents' => (int) $r->total_discounts_cents,
        ])->all();
    }

    /**
     * Sales performance grouped by wholesale rule.
     *
     * @return list<array<string, mixed>>
     */
    public function rulePerformance(): array
    {
        $results = DB::table('order_items')
            ->whereNotNull('wholesale_rule_id')
            ->select([
                'wholesale_rule_id',
                'wholesale_rule_name',
                DB::raw('COUNT(DISTINCT order_id) as orders_count'),
                DB::raw('SUM(quantity) as units_count'),
                DB::raw('SUM(total_cents) as revenue_cents'),
                DB::raw('SUM(wholesale_discount_cents * quantity) as discounts_cents'),
            ])
            ->groupBy(['wholesale_rule_id', 'wholesale_rule_name'])
            ->orderByDesc('revenue_cents')
            ->get();

        return $results->map(fn ($r) => [
            'rule_id' => (int) $r->wholesale_rule_id,
            'rule_name' => (string) ($r->wholesale_rule_name ?? 'Regra de Atacado'),
            'orders_count' => (int) $r->orders_count,
            'units_count' => (int) $r->units_count,
            'revenue_cents' => (int) $r->revenue_cents,
            'discounts_cents' => (int) $r->discounts_cents,
        ])->all();
    }

    /**
     * Export wholesale order items as CSV with formula injection sanitization.
     */
    public function exportCsv(): string
    {
        $items = OrderItem::query()
            ->whereNotNull('wholesale_rule_id')
            ->with('order')
            ->orderByDesc('created_at')
            ->limit(1000)
            ->get();

        $rows = [];
        $rows[] = ['Data', 'Pedido', 'Regra Atacado', 'Faixa Min Un.', 'Produto', 'SKU', 'Qtd', 'Preço Unit. (R$)', 'Desc. Unit. (R$)', 'Total (R$)'];

        foreach ($items as $item) {
            $unitPriceFormatted = number_format($item->unit_price_cents / 100, 2, ',', '.');
            $discountFormatted = number_format($item->wholesale_discount_cents / 100, 2, ',', '.');
            $totalFormatted = number_format($item->total_cents / 100, 2, ',', '.');
            $date = $item->created_at ? $item->created_at->format('d/m/Y H:i') : '';
            $orderCode = $item->order ? $item->order->order_number : "#{$item->order_id}";

            $rows[] = [
                $this->sanitizeCsvField($date),
                $this->sanitizeCsvField($orderCode),
                $this->sanitizeCsvField($item->wholesale_rule_name ?? 'Atacado'),
                (string) ($item->wholesale_tier_min_qty ?? 1),
                $this->sanitizeCsvField($item->product_name_snapshot ?? ''),
                $this->sanitizeCsvField($item->sku_snapshot ?? ''),
                (string) $item->quantity,
                $unitPriceFormatted,
                $discountFormatted,
                $totalFormatted,
            ];
        }

        $fp = fopen('php://temp', 'r+');
        if (! $fp) {
            return '';
        }

        foreach ($rows as $row) {
            fputcsv($fp, $row, ';');
        }

        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        return $csv ?: '';
    }

    /**
     * Sanitize fields to prevent CSV Formula Injection (=, +, -, @).
     */
    private function sanitizeCsvField(string $val): string
    {
        $trimmed = trim($val);
        if ($trimmed !== '' && in_array($trimmed[0], ['=', '+', '-', '@', "\t", "\r"], true)) {
            return "'".$trimmed;
        }

        return $trimmed;
    }
}
