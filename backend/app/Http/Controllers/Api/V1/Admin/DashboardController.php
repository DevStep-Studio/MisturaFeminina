<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Catalog\Services\ReplenishmentService;
use App\Domain\Catalog\Services\RestockNotificationService;
use App\Domain\Orders\Services\ProfitAndCostAnalyticsService;
use App\Domain\Shared\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\AnalyticsEvent;
use App\Models\Order;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\RestockRequest;
use App\Models\Review;
use App\Models\SharedCart;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __construct(
        private readonly RestockNotificationService $restock,
        private readonly ReplenishmentService $replenishment,
        private readonly ProfitAndCostAnalyticsService $profitAnalytics,
    ) {}

    public function summary(Request $request): JsonResponse
    {
        $paidStatuses = [
            OrderStatus::Paid->value,
            OrderStatus::Preparing->value,
            OrderStatus::Shipped->value,
            OrderStatus::Delivered->value,
        ];

        $todayStart = now()->startOfDay();
        $sevenDaysAgo = now()->subDays(7)->startOfDay();
        $thirtyDaysAgo = now()->subDays(30)->startOfDay();

        $salesTodayCents = (int) Order::query()
            ->whereIn('status', $paidStatuses)
            ->where('paid_at', '>=', $todayStart)
            ->sum('total_cents');

        $sales7dCents = (int) Order::query()
            ->whereIn('status', $paidStatuses)
            ->where('paid_at', '>=', $sevenDaysAgo)
            ->sum('total_cents');

        $sales30dCents = (int) Order::query()
            ->whereIn('status', $paidStatuses)
            ->where('paid_at', '>=', $thirtyDaysAgo)
            ->sum('total_cents');

        $fourteenDaysAgo = now()->subDays(14)->startOfDay();
        $salesPrev7dCents = (int) Order::query()
            ->whereIn('status', $paidStatuses)
            ->where('paid_at', '>=', $fourteenDaysAgo)
            ->where('paid_at', '<', $sevenDaysAgo)
            ->sum('total_cents');
        $growth7dPct = $salesPrev7dCents > 0
            ? (float) round((($sales7dCents - $salesPrev7dCents) / $salesPrev7dCents) * 100, 1)
            : null;

        $paidOrders30dCount = Order::query()
            ->whereIn('status', $paidStatuses)
            ->where('paid_at', '>=', $thirtyDaysAgo)
            ->count();

        $avgTicketCents = $paidOrders30dCount > 0 ? (int) round($sales30dCents / $paidOrders30dCount) : 0;

        // Daily sales timeline for last 30 days
        $thirtyDaysTimelineStart = now()->subDays(29)->startOfDay();
        $dailyOrders = Order::query()
            ->whereIn('status', $paidStatuses)
            ->where('paid_at', '>=', $thirtyDaysTimelineStart)
            ->selectRaw('substr(paid_at, 1, 10) as sale_date, COUNT(*) as orders_count, SUM(total_cents) as total_cents')
            ->groupBy('sale_date')
            ->get()
            ->keyBy('sale_date');

        $dailySales30d = [];
        for ($i = 29; $i >= 0; $i--) {
            $dt = now()->subDays($i);
            $dStr = $dt->format('Y-m-d');
            $row = $dailyOrders->get($dStr);
            $dailySales30d[] = [
                'date' => $dStr,
                'label' => $dt->format('d/m'),
                'sales_cents' => (int) ($row->total_cents ?? 0),
                'orders_count' => (int) ($row->orders_count ?? 0),
            ];
        }

        // Top 5 products by revenue
        $topProductsRaw = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->whereIn('orders.status', $paidStatuses)
            ->where('orders.created_at', '>=', $thirtyDaysAgo)
            ->selectRaw('order_items.product_name_snapshot as name, MAX(order_items.product_id) as product_id, SUM(order_items.quantity) as total_qty, SUM(order_items.total_cents) as total_cents')
            ->groupBy('order_items.product_name_snapshot')
            ->orderByDesc('total_cents')
            ->limit(5)
            ->get();

        $productIds = $topProductsRaw->pluck('product_id')->filter()->unique()->all();
        $imagesByProductId = ProductImage::query()
            ->whereIn('product_id', $productIds)
            ->orderByDesc('is_primary')
            ->orderBy('sort_order')
            ->get()
            ->groupBy('product_id')
            ->map(fn ($imgs) => $imgs->first()?->path);

        $variantImagesByProductId = ProductVariant::query()
            ->whereIn('product_id', $productIds)
            ->whereNotNull('image_path')
            ->orderBy('sort_order')
            ->get()
            ->groupBy('product_id')
            ->map(fn ($vars) => $vars->first()?->image_path);

        $topProducts = $topProductsRaw->map(fn (object $p): array => [
            'name' => (string) $p->name,
            'product_id' => $p->product_id ? (int) $p->product_id : null,
            'image_url' => $p->product_id && (isset($imagesByProductId[$p->product_id]) || isset($variantImagesByProductId[$p->product_id]))
                ? (string) ($imagesByProductId[$p->product_id] ?? $variantImagesByProductId[$p->product_id])
                : null,
            'total_qty' => (int) $p->total_qty,
            'total_cents' => (int) $p->total_cents,
        ]);

        // Payment methods breakdown
        $paymentMethods = DB::table('payments')
            ->selectRaw('method, COUNT(*) as count, COALESCE(SUM(gross_amount_cents), 0) as total_cents')
            ->where('created_at', '>=', $thirtyDaysAgo)
            ->groupBy('method')
            ->get()
            ->map(fn (object $r): array => [
                'method' => (string) $r->method,
                'label' => match ((string) $r->method) {
                    'pix' => 'PIX',
                    'credit_card' => 'Cartão de Crédito',
                    'boleto' => 'Boleto Bancário',
                    default => ucfirst((string) $r->method),
                },
                'count' => (int) $r->count,
                'total_cents' => (int) $r->total_cents,
            ]);

        $ordersByStatus = DB::table('orders')
            ->selectRaw('status, COUNT(*) as orders_count, COALESCE(SUM(total_cents), 0) as total_cents')
            ->groupBy('status')
            ->get()
            ->mapWithKeys(fn (object $row): array => [
                (string) $row->status => [
                    'count' => (int) $row->orders_count,
                    'total_cents' => (int) $row->total_cents,
                ],
            ]);

        $lowStockVariants = ProductVariant::query()
            ->where('is_active', true)
            ->whereRaw('(stock_qty - reserved_qty) <= min_stock_alert')
            ->with('product:id,name,slug')
            ->orderByRaw('(stock_qty - reserved_qty) ASC')
            ->limit(15)
            ->get()
            ->map(fn (ProductVariant $v): array => [
                'id' => $v->id,
                'sku' => $v->sku,
                'name' => $v->name,
                'product_id' => $v->product_id,
                'product_name' => $v->product?->name,
                'stock_qty' => $v->stock_qty,
                'reserved_qty' => $v->reserved_qty,
                'available_stock' => $v->availableStock(),
                'min_stock_alert' => $v->min_stock_alert,
            ]);

        $recentOrders = Order::query()
            ->with(['latestPayment:id,order_id,method,status'])
            ->latest('id')
            ->limit(8)
            ->get(['id', 'order_number', 'customer_name', 'customer_email', 'total_cents', 'status', 'created_at']);

        $funnelEvents = AnalyticsEvent::query()
            ->where('created_at', '>=', $thirtyDaysAgo)
            ->selectRaw('event_name, COUNT(*) as total')
            ->groupBy('event_name')
            ->pluck('total', 'event_name');

        $restockDemand = $this->restock->demandSummary();
        $replenishmentInsights = $this->replenishment->adminInsights();

        $canViewProfit = $request->user()?->hasPermission('reports.profit.view') ?? false;
        $from = $request->filled('from')
            ? CarbonImmutable::parse((string) $request->query('from'))->startOfDay()
            : now()->subDays(29)->startOfDay()->toImmutable();
        $to = $request->filled('to')
            ? CarbonImmutable::parse((string) $request->query('to'))->endOfDay()
            : now()->endOfDay()->toImmutable();
        $stockAsOf = $request->filled('stock_as_of')
            ? CarbonImmutable::parse((string) $request->query('stock_as_of'))
            : null;

        // Real daily sales points scoped to selected period (capped at 90 days)
        $periodTimelineStart = $from->copy()->startOfDay();
        $periodSpanDays = min(90, max(1, (int) $periodTimelineStart->diffInDays($to->copy()->startOfDay()) + 1));
        $periodOrders = Order::query()
            ->whereIn('status', $paidStatuses)
            ->where('paid_at', '>=', $periodTimelineStart)
            ->where('paid_at', '<=', $to)
            ->selectRaw('substr(paid_at, 1, 10) as sale_date, COUNT(*) as orders_count, SUM(total_cents) as total_cents')
            ->groupBy('sale_date')
            ->get()
            ->keyBy('sale_date');

        $dailySalesPeriod = [];
        for ($i = 0; $i < $periodSpanDays; $i++) {
            $dt = $periodTimelineStart->addDays($i);
            $dStr = $dt->format('Y-m-d');
            $row = $periodOrders->get($dStr);
            $dailySalesPeriod[] = [
                'date' => $dStr,
                'label' => $dt->format('d/m'),
                'sales_cents' => (int) ($row->total_cents ?? 0),
                'orders_count' => (int) ($row->orders_count ?? 0),
            ];
        }

        $data = [
            'kpis' => [
                'sales_today_cents' => $salesTodayCents,
                'sales_7d_cents' => $sales7dCents,
                'sales_30d_cents' => $sales30dCents,
                'growth_7d_pct' => $growth7dPct,
                'paid_orders_30d' => $paidOrders30dCount,
                'avg_ticket_cents' => $avgTicketCents,
                'pending_payment_count' => (int) ($ordersByStatus[OrderStatus::PendingPayment->value]['count'] ?? 0),
                'to_pack_count' => (int) ($ordersByStatus[OrderStatus::Paid->value]['count'] ?? 0) + (int) ($ordersByStatus[OrderStatus::Preparing->value]['count'] ?? 0),
                'low_stock_count' => count($lowStockVariants),
                'pending_reviews_count' => Review::query()->where('status', 'pending')->count(),
                'pending_restock_count' => RestockRequest::query()->where('status', 'pending')->count(),
                'replenishment_lists_count' => $replenishmentInsights['lists_total'],
                'multi_shade_add_count' => (int) ($funnelEvents['multi_shade_bulk_add'] ?? 0),
                'shared_carts_created_count' => SharedCart::query()->count(),
                'shared_carts_imported_count' => (int) SharedCart::query()->sum('imports_count'),
            ],
            'daily_sales_30d' => $dailySales30d,
            'daily_sales_period' => $dailySalesPeriod,
            'top_products' => $topProducts,
            'payment_methods' => $paymentMethods,
            'orders_by_status' => $ordersByStatus,
            'low_stock_variants' => $lowStockVariants,
            'recent_orders' => $recentOrders,
            'top_demanded_variants' => array_slice($restockDemand['demand_ranking'], 0, 10),
            'top_replenishment_variants' => array_slice($replenishmentInsights['top_variants'], 0, 10),
            'funnel_30d' => [
                'page_view' => (int) ($funnelEvents['page_view'] ?? 0),
                'add_to_cart' => (int) ($funnelEvents['add_to_cart'] ?? 0),
                'begin_checkout' => (int) ($funnelEvents['begin_checkout'] ?? 0),
                'purchase_created' => (int) ($funnelEvents['purchase_created'] ?? 0),
                'purchase_paid' => $paidOrders30dCount,
            ],
        ];

        if ($canViewProfit) {
            $data['financial_summary'] = $this->profitAnalytics->periodProfitSummary($from, $to);
            $data['inventory_valuation'] = $this->profitAnalytics->inventoryCostValuation($stockAsOf);
        }

        return response()->json(['data' => $data]);
    }

    public function profitItems(Request $request): JsonResponse
    {
        $from = $request->filled('from')
            ? CarbonImmutable::parse((string) $request->query('from'))->startOfDay()
            : now()->subDays(29)->startOfDay()->toImmutable();
        $to = $request->filled('to')
            ? CarbonImmutable::parse((string) $request->query('to'))->endOfDay()
            : now()->endOfDay()->toImmutable();
        $filter = $request->query('filter')
            ? (string) $request->query('filter')
            : ($request->boolean('missing_cost') ? 'missing_cost' : null);

        return response()->json([
            'data' => $this->profitAnalytics->periodItemBreakdown($from, $to, $filter),
        ]);
    }

    public function inventoryValuation(Request $request): JsonResponse
    {
        $asOf = $request->filled('as_of')
            ? CarbonImmutable::parse((string) $request->query('as_of'))
            : null;

        return response()->json([
            'data' => $this->profitAnalytics->inventoryCostValuation($asOf),
        ]);
    }
}
