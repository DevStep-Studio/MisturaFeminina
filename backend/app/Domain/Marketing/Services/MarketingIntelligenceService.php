<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Domain\AI\Services\AIProviderService;
use App\Domain\Shared\Enums\OrderStatus;
use App\Models\Order;
use App\Models\Refund;
use Carbon\Carbon;

class MarketingIntelligenceService
{
    public function __construct(
        private readonly MarketingBaselineInitializer $initializer,
        private readonly GoogleAnalyticsService $ga4Service,
        private readonly GoogleAdsService $googleAdsService,
        private readonly GoogleMerchantFeedService $merchantFeedService,
        private readonly AIProviderService $aiProvider,
    ) {}

    /**
     * Consolidated, strictly real overview across Store Orders, GA4, Google Ads, Shopping Feed, and AI Provider.
     *
     * @param  array{range?: string, start_date?: string, end_date?: string}  $params
     * @return array<string, mixed>
     */
    public function getOverview(array $params = []): array
    {
        $this->initializer->ensureInitialized();

        [$startDate, $endDate, $rangeLabel, $daysCount] = $this->ga4Service->resolvePeriod($params);
        $prevEnd = $startDate->copy()->subSecond();
        $prevStart = $prevEnd->copy()->subDays(max(0, $daysCount - 1))->startOfDay();

        $validStatuses = [
            OrderStatus::PendingPayment->value,
            OrderStatus::Paid->value,
            OrderStatus::Preparing->value,
            OrderStatus::Shipped->value,
            OrderStatus::Delivered->value,
            OrderStatus::PartiallyRefunded->value,
            OrderStatus::Refunded->value,
        ];

        $storeOrders = Order::query()
            ->whereIn('status', $validStatuses)
            ->where('created_at', '>=', $startDate)
            ->where('created_at', '<=', $endDate)
            ->get();

        $prevOrders = Order::query()
            ->whereIn('status', $validStatuses)
            ->where('created_at', '>=', $prevStart)
            ->where('created_at', '<=', $prevEnd)
            ->get();

        $refunds = Refund::query()
            ->where('status', 'completed')
            ->where('created_at', '>=', $startDate)
            ->where('created_at', '<=', $endDate)
            ->get();

        $storeOrdersCount = $storeOrders->count();
        $prevOrdersCount = $prevOrders->count();
        $storeRevenueCents = (int) $storeOrders->sum('total_cents');
        $prevRevenueCents = (int) $prevOrders->sum('total_cents');
        $refundedCents = (int) $refunds->sum('amount_cents');
        $netStoreRevenueCents = max(0, $storeRevenueCents - $refundedCents);
        $ticketMedioCents = $storeOrdersCount > 0 ? (int) round($storeRevenueCents / $storeOrdersCount) : 0;

        $ga4 = $this->ga4Service->getInsights($params);
        $ads = $this->googleAdsService->getOverview($params);
        $shopping = $this->merchantFeedService->getAdminDiagnostics(false);
        $aiStatus = $this->aiProvider->connectionStatus();

        $googleSpendCents = $ads['connected'] && is_array($ads['totals']) ? (int) $ads['totals']['spend_cents'] : null;
        $googleAttrRevCents = $ads['connected'] && is_array($ads['totals']) ? (int) $ads['totals']['attributed_revenue_cents'] : null;
        $googleRoas = $ads['connected'] && is_array($ads['totals']) ? (float) $ads['totals']['roas'] : null;
        $sessions = $ga4['kpis']['sessions'];

        $blendedRoas = ($googleSpendCents !== null && $googleSpendCents > 0)
            ? round($storeRevenueCents / $googleSpendCents, 2)
            : null;

        $conversionRatePct = ($sessions !== null && $sessions > 0)
            ? round(($storeOrdersCount / $sessions) * 100, 2)
            : null;

        $ordersDeltaPct = $prevOrdersCount > 0
            ? round((($storeOrdersCount - $prevOrdersCount) / $prevOrdersCount) * 100, 1)
            : null;
        $revenueDeltaPct = $prevRevenueCents > 0
            ? round((($storeRevenueCents - $prevRevenueCents) / $prevRevenueCents) * 100, 1)
            : null;

        $dailyChart = $this->buildRealDailyChart($startDate, $endDate, $storeOrders);

        return [
            'period' => [
                'range' => $params['range'] ?? 'last_30_days',
                'label' => $rangeLabel,
                'start_date' => $startDate->toDateString(),
                'end_date' => $endDate->toDateString(),
                'days_count' => $daysCount,
                'previous_start_date' => $prevStart->toDateString(),
                'previous_end_date' => $prevEnd->toDateString(),
            ],
            'integrations_status' => [
                'ga4' => [
                    'status' => $ga4['ga4_api_connected'] ? 'connected' : ($ga4['integration']['status'] ?? 'not_configured'),
                    'tag_configured' => (bool) ($ga4['kpis']['tag_configured_on_storefront'] ?? false),
                    'active_tag_id' => $ga4['kpis']['active_tag_id'] ?? null,
                    'message' => $ga4['integration']['last_healthcheck_message'] ?? $ga4['availability_notice'],
                ],
                'google_ads' => [
                    'status' => $ads['connected'] ? 'connected' : ($ads['integration']['status'] ?? 'not_configured'),
                    'campaigns_count' => count($ads['campaigns']),
                    'message' => $ads['integration']['last_healthcheck_message'] ?? $ads['availability_notice'],
                ],
                'google_shopping' => [
                    'status' => $shopping['merchant_center_api']['status'],
                    'feed_status' => $shopping['feed']['status'],
                    'feed_url' => $shopping['feed']['feed_url'],
                    'ready_products_count' => $shopping['feed']['ready_products_count'],
                    'incomplete_products_count' => $shopping['feed']['incomplete_products_count'],
                    'message' => $shopping['merchant_center_api']['message'],
                ],
                'ai_agent' => [
                    'status' => $aiStatus['has_api_key'] ? ($aiStatus['status'] === 'connected' ? 'connected' : 'configured') : 'not_configured',
                    'has_api_key' => (bool) $aiStatus['has_api_key'],
                    'provider' => $aiStatus['provider'],
                    'model' => $aiStatus['models']['marketing'] ?? 'gpt-4o-mini',
                    'missing_requirement' => $aiStatus['has_api_key'] ? null : 'Defina OPENAI_API_KEY no servidor (/backend/.env) ou salve a chave na aba Central de IA > Configurações para respostas generativas.',
                ],
            ],
            'kpis' => [
                'total_spend_cents' => $googleSpendCents,
                'google_ads_spend_cents' => $googleSpendCents,
                'store_revenue_cents' => $storeRevenueCents,
                'net_store_revenue_cents' => $netStoreRevenueCents,
                'refunded_cents' => $refundedCents,
                'refunds_count' => $refunds->count(),
                'attributed_revenue_cents' => $googleAttrRevCents,
                'blended_roas' => $blendedRoas,
                'google_ads_roas' => $googleRoas,
                'meta_ads_roas' => null,
                'store_orders_count' => $storeOrdersCount,
                'previous_orders_count' => $prevOrdersCount,
                'orders_delta_pct' => $ordersDeltaPct,
                'previous_revenue_cents' => $prevRevenueCents,
                'revenue_delta_pct' => $revenueDeltaPct,
                'ticket_medio_cents' => $ticketMedioCents,
                'total_sessions' => $sessions,
                'conversion_rate_pct' => $conversionRatePct ?? 0.0,
                'organic_clicks' => 0,
                'shopping_ready_count' => $shopping['feed']['ready_products_count'],
                'shopping_incomplete_count' => $shopping['feed']['incomplete_products_count'],
                'shopping_total_active' => $shopping['feed']['total_active_products'],
            ],
            'attribution_transparency' => [
                'real_store_revenue_cents' => $storeRevenueCents,
                'google_ads_attributed_cents' => $googleAttrRevCents,
                'meta_ads_attributed_cents' => null,
                'note' => $ads['connected']
                    ? 'Receita da loja reflete pedidos reais registrados no MySQL; receita atribuída reflete conversões reportadas pela conta Google Ads conectada.'
                    : 'Exibindo exclusivamente pedidos e receitas reais registrados no banco da Mistura Feminina. Contas externas não conectadas não geram estimativas fictícias.',
            ],
            'daily_chart' => $dailyChart,
            'traffic_sources' => $ga4['acquisition_channels'],
            'sales_by_channel' => [
                [
                    'channel' => 'Pedidos Reais na Loja',
                    'revenue_cents' => $storeRevenueCents,
                    'orders' => $storeOrdersCount,
                    'roas' => $blendedRoas,
                ],
            ],
            'ai_period_summary' => $this->buildHonestSummary(
                $rangeLabel,
                $storeOrdersCount,
                $storeRevenueCents,
                $prevOrdersCount,
                $sessions,
                $ads['connected'],
                $shopping['feed']['ready_products_count'],
                $shopping['feed']['incomplete_products_count']
            ),
        ];
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Order>  $orders
     * @return list<array<string, mixed>>
     */
    private function buildRealDailyChart(Carbon $start, Carbon $end, $orders): array
    {
        $days = [];
        $curr = $start->copy();

        while ($curr->lte($end)) {
            $dStr = $curr->toDateString();
            $dayOrders = $orders->filter(fn (Order $o): bool => Carbon::parse((string) $o->created_at)->toDateString() === $dStr);

            $days[] = [
                'date' => $dStr,
                'label' => $curr->format('d/m'),
                'store_orders' => $dayOrders->count(),
                'store_revenue_cents' => (int) $dayOrders->sum('total_cents'),
            ];

            $curr->addDay();
        }

        return $days;
    }

    private function buildHonestSummary(
        string $rangeLabel,
        int $ordersCount,
        int $revenueCents,
        int $prevOrdersCount,
        ?int $sessions,
        bool $adsConnected,
        int $readyProducts,
        int $incompleteProducts
    ): string {
        $revBrl = number_format($revenueCents / 100, 2, ',', '.');
        $parts = [
            "Período selecionado ({$rangeLabel}): {$ordersCount} pedido(s) registrado(s) na loja somando R$ {$revBrl} (período anterior equivalente: {$prevOrdersCount} pedido(s)).",
        ];

        if ($sessions !== null) {
            $parts[] = "Sessões medidas: {$sessions}.";
        } else {
            $parts[] = 'Sessões do GA4 ainda indisponíveis (conecte a propriedade GA4 para leitura de acessos).';
        }

        $parts[] = "Google Shopping: {$readyProducts} produto(s) pronto(s) no XML e {$incompleteProducts} pendente(s) de dados obrigatórios.";

        if (! $adsConnected) {
            $parts[] = 'Google Ads pendente de credenciais de leitura.';
        }

        return implode(' ', $parts);
    }
}
