<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Orders\Services\ProfitAndCostAnalyticsService;
use App\Domain\Shared\Enums\OrderStatus;
use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Payment;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class AdminReportsController extends Controller
{
    public function __construct(
        private readonly ProfitAndCostAnalyticsService $profitAnalytics,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $from = $request->query('from') ? CarbonImmutable::parse((string) $request->query('from'))->startOfDay() : now()->subDays(30)->startOfDay()->toImmutable();
        $to = $request->query('to') ? CarbonImmutable::parse((string) $request->query('to'))->endOfDay() : now()->endOfDay()->toImmutable();

        $paidStatuses = OrderStatus::recognizedSaleValues();

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

        $topProductsRaw = OrderItem::query()
            ->whereHas('order', fn ($q) => $q->whereBetween('created_at', [$from, $to])->whereIn('status', $paidStatuses))
            ->selectRaw('MAX(product_id) as product_id, sku_snapshot, product_name_snapshot, SUM(quantity) as qty_sold, SUM(total_cents) as revenue_cents')
            ->groupBy('sku_snapshot', 'product_name_snapshot')
            ->orderByDesc('qty_sold')
            ->limit(10)
            ->get();

        $reportProductIds = $topProductsRaw->pluck('product_id')->filter()->unique()->all();
        $reportImagesByProductId = ProductImage::query()
            ->whereIn('product_id', $reportProductIds)
            ->orderByDesc('is_primary')
            ->orderBy('sort_order')
            ->get()
            ->groupBy('product_id')
            ->map(fn ($imgs) => $imgs->first()?->path);

        $reportVariantImages = ProductVariant::query()
            ->whereIn('product_id', $reportProductIds)
            ->whereNotNull('image_path')
            ->orderBy('sort_order')
            ->get()
            ->groupBy('product_id')
            ->map(fn ($vars) => $vars->first()?->image_path);

        $topProducts = $topProductsRaw->map(fn ($p): array => [
            'product_id' => $p->product_id ? (int) $p->product_id : null,
            'sku_snapshot' => (string) $p->sku_snapshot,
            'product_name_snapshot' => (string) $p->product_name_snapshot,
            'qty_sold' => (int) $p->qty_sold,
            'revenue_cents' => (int) $p->revenue_cents,
            'image_url' => $p->product_id && (isset($reportImagesByProductId[$p->product_id]) || isset($reportVariantImages[$p->product_id]))
                ? (string) ($reportImagesByProductId[$p->product_id] ?? $reportVariantImages[$p->product_id])
                : null,
        ]);

        $topCoupons = Order::query()
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', $paidStatuses)
            ->whereNotNull('coupon_code')
            ->selectRaw('coupon_code, COUNT(*) as uses, COALESCE(SUM(discount_cents), 0) as discount_cents')
            ->groupBy('coupon_code')
            ->orderByDesc('uses')
            ->limit(10)
            ->get();

        $data = [
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
        ];

        if ($request->user()?->hasRole('superadmin', 'admin', 'finance') || $request->user()?->hasPermission('reports.profit.view')) {
            $data['profit_summary'] = $this->profitAnalytics->periodProfitSummary($from, $to);
            $data['top_products_profit'] = $this->profitAnalytics->topProductsProfitBreakdown($from, $to, 15);
            $data['inventory_valuation'] = $this->profitAnalytics->inventoryCostValuation();
        }

        return response()->json(['data' => $data]);
    }

    public function exportCsv(Request $request): Response
    {
        $from = $request->query('from') ? CarbonImmutable::parse((string) $request->query('from'))->startOfDay() : now()->subDays(30)->startOfDay()->toImmutable();
        $to = $request->query('to') ? CarbonImmutable::parse((string) $request->query('to'))->endOfDay() : now()->endOfDay()->toImmutable();
        $canExportProfit = $request->user()?->hasPermission('reports.profit.export') ?? false;

        $orders = Order::query()
            ->with(['latestPayment', 'items'])
            ->whereBetween('created_at', [$from, $to])
            ->orderBy('id')
            ->get();

        $headerCols = ['order_number', 'created_at', 'paid_at', 'status', 'customer_name', 'customer_email', 'subtotal_brl', 'discount_brl', 'shipping_brl', 'total_brl', 'payment_method', 'payment_status'];
        if ($canExportProfit) {
            array_push($headerCols, 'products_net_revenue_brl', 'cmv_brl', 'gross_profit_brl', 'gross_margin_pct', 'cost_coverage');
        }
        $lines = [implode(';', $headerCols)];

        foreach ($orders as $order) {
            $row = [
                $order->order_number,
                $order->created_at?->toIso8601String() ?? '',
                $order->paid_at?->toIso8601String() ?? '',
                $order->status->value,
                str_replace(';', ',', $order->customer_name),
                $order->customer_email,
                number_format($order->subtotal_cents / 100, 2, '.', ''),
                number_format($order->discount_cents / 100, 2, '.', ''),
                number_format($order->shipping_cents / 100, 2, '.', ''),
                number_format($order->total_cents / 100, 2, '.', ''),
                $order->latestPayment?->method->value ?? '',
                $order->latestPayment?->status->value ?? '',
            ];

            if ($canExportProfit) {
                $summary = $this->profitAnalytics->summarizeOrder($order, true)['financial_summary'];
                $row[] = number_format(((int) ($summary['products_revenue_cents'] ?? 0)) / 100, 2, '.', '');
                $row[] = number_format(((int) ($summary['cmv_cents'] ?? 0)) / 100, 2, '.', '');
                $row[] = number_format(((int) ($summary['gross_profit_cents'] ?? 0)) / 100, 2, '.', '');
                $row[] = $summary['gross_margin_pct'] !== null ? number_format((float) $summary['gross_margin_pct'], 2, '.', '') : '';
                $row[] = (string) ($summary['coverage_label'] ?? '');
            }

            $lines[] = implode(';', $row);
        }

        return response(implode("\n", $lines), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="relatorio-pedidos-'.$from->format('Ymd').'-'.$to->format('Ymd').'.csv"',
        ]);
    }

    public function exportProfitCsv(Request $request): Response
    {
        $from = $request->query('from') ? CarbonImmutable::parse((string) $request->query('from'))->startOfDay() : now()->subDays(30)->startOfDay()->toImmutable();
        $to = $request->query('to') ? CarbonImmutable::parse((string) $request->query('to'))->endOfDay() : now()->endOfDay()->toImmutable();

        $breakdown = $this->profitAnalytics->periodItemBreakdown($from, $to);
        $lines = ['tipo;pedido;data;produto;variacao;sku;quantidade;receita_liquida_brl;custo_unitario_historico_brl;cmv_brl;lucro_bruto_brl;margem_pct;origem_custo'];

        foreach ($breakdown['items'] as $row) {
            $lines[] = implode(';', [
                $row['entry_type'],
                $row['order_number'],
                (string) $row['event_date'],
                str_replace(';', ',', (string) $row['product_name']),
                str_replace(';', ',', (string) $row['variant_name']),
                (string) $row['sku'],
                (string) $row['quantity'],
                number_format(((int) $row['net_revenue_cents']) / 100, 2, '.', ''),
                $row['unit_cost_cents_snapshot'] !== null ? number_format(((int) $row['unit_cost_cents_snapshot']) / 100, 2, '.', '') : '',
                $row['cmv_cents'] !== null ? number_format(((int) $row['cmv_cents']) / 100, 2, '.', '') : '',
                $row['gross_profit_cents'] !== null ? number_format(((int) $row['gross_profit_cents']) / 100, 2, '.', '') : '',
                $row['margin_pct'] !== null ? number_format((float) $row['margin_pct'], 2, '.', '') : '',
                $row['has_cost'] ? (string) $row['cost_source'] : 'custo_nao_informado',
            ]);
        }

        return response(implode("\n", $lines), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="lucro-bruto-itens-'.$from->format('Ymd').'-'.$to->format('Ymd').'.csv"',
        ]);
    }
}
