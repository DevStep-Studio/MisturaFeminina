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

        $paidOrders30dCount = Order::query()
            ->whereIn('status', $paidStatuses)
            ->where('paid_at', '>=', $thirtyDaysAgo)
            ->count();

        $avgTicketCents = $paidOrders30dCount > 0 ? (int) round($sales30dCents / $paidOrders30dCount) : 0;

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
                    'paid_orders_30d' => $paidOrders30dCount,
                    'avg_ticket_cents' => $avgTicketCents,
                    'pending_payment_count' => (int) ($ordersByStatus[OrderStatus::PendingPayment->value]['count'] ?? 0),
                    'to_pack_count' => (int) ($ordersByStatus[OrderStatus::Paid->value]['count'] ?? 0) + (int) ($ordersByStatus[OrderStatus::Preparing->value]['count'] ?? 0),
                    'pending_reviews_count' => Review::query()->where('status', 'pending')->count(),
                    'pending_restock_count' => RestockRequest::query()->where('status', 'pending')->count(),
                ],
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
