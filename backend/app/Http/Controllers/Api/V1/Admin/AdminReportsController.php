<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Shared\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class AdminReportsController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $from = $request->query('from') ? now()->parse((string) $request->query('from'))->startOfDay() : now()->subDays(30)->startOfDay();
        $to = $request->query('to') ? now()->parse((string) $request->query('to'))->endOfDay() : now()->endOfDay();

        $paidStatuses = [
            OrderStatus::Paid->value,
            OrderStatus::Preparing->value,
            OrderStatus::Shipped->value,
            OrderStatus::Delivered->value,
        ];

        $ordersQuery = Order::query()->whereBetween('created_at', [$from, $to]);
        if ($request->filled('status')) {
            $ordersQuery->where('status', (string) $request->query('status'));
        }

        $totalOrders = (clone $ordersQuery)->count();
        $paidOrders = (clone $ordersQuery)->whereIn('status', $paidStatuses)->count();
        $grossRevenueCents = (int) (clone $ordersQuery)->whereIn('status', $paidStatuses)->sum('total_cents');
        $discountTotalCents = (int) (clone $ordersQuery)->whereIn('status', $paidStatuses)->sum('discount_cents');
        $shippingTotalCents = (int) (clone $ordersQuery)->whereIn('status', $paidStatuses)->sum('shipping_cents');

        $byMethod = Payment::query()
            ->whereBetween('created_at', [$from, $to])
            ->where('status', 'approved')
            ->selectRaw('method, COUNT(*) as count, COALESCE(SUM(gross_amount_cents), 0) as gross_cents, COALESCE(SUM(fee_cents), 0) as fee_cents, COALESCE(SUM(net_amount_cents), 0) as net_cents')
            ->groupBy('method')
            ->get();

        $topProducts = OrderItem::query()
            ->whereHas('order', fn ($q) => $q->whereBetween('created_at', [$from, $to])->whereIn('status', $paidStatuses))
            ->selectRaw('sku_snapshot, product_name_snapshot, SUM(quantity) as qty_sold, SUM(total_cents) as revenue_cents')
            ->groupBy('sku_snapshot', 'product_name_snapshot')
            ->orderByDesc('qty_sold')
            ->limit(10)
            ->get();

        $topCoupons = Order::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', $paidStatuses)
            ->whereNotNull('coupon_code')
            ->selectRaw('coupon_code, COUNT(*) as uses, COALESCE(SUM(discount_cents), 0) as discount_cents')
            ->groupBy('coupon_code')
            ->orderByDesc('uses')
            ->limit(10)
            ->get();

        return response()->json([
            'data' => [
                'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
                'summary' => [
                    'total_orders' => $totalOrders,
                    'paid_orders' => $paidOrders,
                    'conversion_paid_rate' => $totalOrders > 0 ? round(($paidOrders / $totalOrders) * 100, 1) : 0.0,
                    'gross_revenue_cents' => $grossRevenueCents,
                    'discount_total_cents' => $discountTotalCents,
                    'shipping_total_cents' => $shippingTotalCents,
                    'avg_ticket_cents' => $paidOrders > 0 ? (int) round($grossRevenueCents / $paidOrders) : 0,
                ],
                'by_payment_method' => $byMethod,
                'top_products' => $topProducts,
                'top_coupons' => $topCoupons,
            ],
        ]);
    }

    public function exportCsv(Request $request): Response
    {
        $from = $request->query('from') ? now()->parse((string) $request->query('from'))->startOfDay() : now()->subDays(30)->startOfDay();
        $to = $request->query('to') ? now()->parse((string) $request->query('to'))->endOfDay() : now()->endOfDay();

        $orders = Order::query()
            ->with('latestPayment')
            ->whereBetween('created_at', [$from, $to])
            ->orderBy('id')
            ->get();

        $lines = ['order_number;created_at;status;customer_name;customer_email;subtotal_brl;discount_brl;shipping_brl;total_brl;payment_method;payment_status'];
        foreach ($orders as $order) {
            $lines[] = implode(';', [
                $order->order_number,
                $order->created_at?->toIso8601String() ?? '',
                $order->status->value,
                str_replace(';', ',', $order->customer_name),
                $order->customer_email,
                number_format($order->subtotal_cents / 100, 2, '.', ''),
                number_format($order->discount_cents / 100, 2, '.', ''),
                number_format($order->shipping_cents / 100, 2, '.', ''),
                number_format($order->total_cents / 100, 2, '.', ''),
                $order->latestPayment?->method->value ?? '',
                $order->latestPayment?->status->value ?? '',
            ]);
        }

        return response(implode("\n", $lines), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="relatorio-pedidos-'.$from->format('Ymd').'-'.$to->format('Ymd').'.csv"',
        ]);
    }
}
