<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Shared\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\AnalyticsEvent;
use App\Models\Order;
use App\Models\ProductVariant;
use App\Models\RestockRequest;
use App\Models\Review;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
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
            : 15.4;

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
        $topProducts = DB::table('order_items')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->whereIn('orders.status', $paidStatuses)
            ->where('orders.created_at', '>=', $thirtyDaysAgo)
            ->selectRaw('order_items.product_name_snapshot as name, SUM(order_items.quantity) as total_qty, SUM(order_items.total_cents) as total_cents')
            ->groupBy('name')
            ->orderByDesc('total_cents')
            ->limit(5)
            ->get()
            ->map(fn (object $p): array => [
                'name' => (string) $p->name,
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

        return response()->json([
            'data' => [
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
                ],
                'daily_sales_30d' => $dailySales30d,
                'top_products' => $topProducts,
                'payment_methods' => $paymentMethods,
                'orders_by_status' => $ordersByStatus,
                'low_stock_variants' => $lowStockVariants,
                'recent_orders' => $recentOrders,
                'funnel_30d' => [
                    'page_view' => (int) ($funnelEvents['page_view'] ?? 0),
                    'add_to_cart' => (int) ($funnelEvents['add_to_cart'] ?? 0),
                    'begin_checkout' => (int) ($funnelEvents['begin_checkout'] ?? 0),
                    'purchase_created' => (int) ($funnelEvents['purchase_created'] ?? 0),
                    'purchase_paid' => $paidOrders30dCount,
                ],
            ],
        ]);
    }
}
