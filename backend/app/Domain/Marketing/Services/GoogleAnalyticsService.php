<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Domain\Shared\Enums\OrderStatus;
use App\Models\AnalyticsEvent;
use App\Models\MarketingIntegration;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\Refund;
use Carbon\Carbon;
use Illuminate\Support\Facades\Http;

class GoogleAnalyticsService
{
    public function __construct(
        private readonly MarketingBaselineInitializer $initializer,
        private readonly GoogleOAuthTokenHelper $oauth,
        private readonly GoogleMerchantFeedService $merchantFeed,
    ) {}

    /**
     * @param  array{range?: string, start_date?: string, end_date?: string}  $params
     * @return array<string, mixed>
     */
    public function getInsights(array $params = []): array
    {
        $this->initializer->ensureIntegrations();

        [$start, $end, $rangeLabel, $daysCount] = $this->resolvePeriod($params);
        $startStr = $start->toDateString();
        $endStr = $end->toDateString();

        $integration = MarketingIntegration::query()->where('platform', 'google_analytics_4')->first();
        $creds = $this->merchantFeed->decryptCredentials($integration?->encrypted_credentials);

        $measurementId = strtoupper(trim((string) ($integration?->pixel_id ?? '')));
        $gtmId = strtoupper(trim((string) ($integration?->settings['gtm_id'] ?? '')));
        $propertyId = preg_replace('/^properties\//i', '', trim((string) ($integration?->property_id ?? ''))) ?? '';
        $saJson = trim((string) ($creds['service_account_json'] ?? ''));

        $validTag = ($measurementId !== '' && preg_match('/^G-[A-Z0-9]{4,}$/', $measurementId) === 1 && preg_match('/^G-X+$/', $measurementId) !== 1)
            || ($gtmId !== '' && preg_match('/^GTM-[A-Z0-9]{4,}$/', $gtmId) === 1 && preg_match('/^GTM-X+$/', $gtmId) !== 1);

        // 1. Real first-party consented analytics events + real orders/refunds from the store DB
        $events = AnalyticsEvent::query()
            ->where('created_at', '>=', $start)
            ->where('created_at', '<=', $end)
            ->get();

        $eventCounts = [
            'page_view' => $events->where('event_name', 'page_view')->count(),
            'view_item' => $events->where('event_name', 'view_item')->count(),
            'add_to_cart' => $events->where('event_name', 'add_to_cart')->count(),
            'remove_from_cart' => $events->where('event_name', 'remove_from_cart')->count(),
            'begin_checkout' => $events->where('event_name', 'begin_checkout')->count(),
            'purchase' => $events->where('event_name', 'purchase')->count(),
            'refund' => $events->where('event_name', 'refund')->count(),
        ];

        $uniqueSessionsLocal = $events->pluck('session_id')->filter()->unique()->count();

        $realOrders = Order::query()
            ->whereNotIn('status', [OrderStatus::Cancelled->value, OrderStatus::PaymentFailed->value, OrderStatus::Expired->value])
            ->where('created_at', '>=', $start)
            ->where('created_at', '<=', $end)
            ->get();

        $realRefunds = Refund::query()
            ->where('status', 'completed')
            ->where('created_at', '>=', $start)
            ->where('created_at', '<=', $end)
            ->get();

        $storeOrdersCount = $realOrders->count();
        $storeRevenueCents = (int) $realOrders->sum('total_cents');
        $refundedCents = (int) $realRefunds->sum('amount_cents');
        $refundsCount = $realRefunds->count();

        // 2. Try live GA4 Data API if Property ID + Service Account JSON are configured
        $ga4ApiData = null;
        $ga4ApiError = null;

        if ($propertyId !== '' && $saJson !== '') {
            try {
                $ga4ApiData = $this->fetchGa4PropertyReport($propertyId, $saJson, $startStr, $endStr);
            } catch (\Throwable $e) {
                $ga4ApiError = $e->getMessage();
            }
        }

        $ga4Connected = $ga4ApiData !== null;

        // 3. Compute product views without purchases (from GA4 API when connected, else from consented local view_item + OrderItem)
        $productsViewsNoPurchase = $ga4Connected
            ? ($ga4ApiData['products_views_without_purchases'] ?? [])
            : $this->computeLocalViewsWithoutPurchases($events, $start, $end);

        $kpis = [
            'data_source' => $ga4Connected ? 'ga4_data_api' : 'local_consented_and_orders',
            'ga4_api_connected' => $ga4Connected,
            'tag_configured_on_storefront' => $validTag,
            'active_tag_id' => $validTag ? ($measurementId !== '' ? $measurementId : $gtmId) : null,
            'sessions' => $ga4Connected ? $ga4ApiData['kpis']['sessions'] : ($uniqueSessionsLocal > 0 ? $uniqueSessionsLocal : null),
            'products_viewed' => $ga4Connected ? $ga4ApiData['kpis']['items_viewed'] : ($eventCounts['view_item'] > 0 ? $eventCounts['view_item'] : null),
            'carts_started' => $ga4Connected ? $ga4ApiData['kpis']['add_to_carts'] : ($eventCounts['add_to_cart'] > 0 ? $eventCounts['add_to_cart'] : null),
            'carts_removed' => $eventCounts['remove_from_cart'] > 0 ? $eventCounts['remove_from_cart'] : 0,
            'checkouts_started' => $ga4Connected ? $ga4ApiData['kpis']['checkouts'] : ($eventCounts['begin_checkout'] > 0 ? $eventCounts['begin_checkout'] : null),
            'purchases_count' => $ga4Connected ? $ga4ApiData['kpis']['purchases'] : $storeOrdersCount,
            'revenue_cents' => $ga4Connected ? $ga4ApiData['kpis']['revenue_cents'] : $storeRevenueCents,
            'store_orders_count' => $storeOrdersCount,
            'store_revenue_cents' => $storeRevenueCents,
            'refunds_count' => $refundsCount,
            'refunded_cents' => $refundedCents,
        ];

        $funnelSteps = $this->buildFunnelSteps(
            $kpis['products_viewed'],
            $kpis['carts_started'],
            $kpis['checkouts_started'],
            $kpis['purchases_count']
        );

        $eventsAudit = $this->buildEventsAudit($events, $validTag, $refundsCount);

        $availabilityNotice = null;
        if (! $ga4Connected) {
            if ($ga4ApiError !== null) {
                $availabilityNotice = "A consulta à GA4 Data API retornou erro ({$ga4ApiError}). Exibindo apenas pedidos/reembolsos reais do banco e eventos locais consentidos.";
            } elseif (! $validTag) {
                $availabilityNotice = 'Conta Google Analytics 4 ainda não conectada (Measurement ID G-... e Service Account JSON pendentes). Os indicadores de compras e receita abaixo vêm diretamente dos pedidos reais da loja; visitas e funil do GA4 ficarão disponíveis assim que a propriedade for conectada.';
            } else {
                $availabilityNotice = 'Tag GA4 configurada na vitrine, mas a GA4 Data API (Property ID + Service Account JSON) ainda não foi vinculada. Exibindo telemetria consentida registrada pela própria loja.';
            }
        }

        return [
            'period' => [
                'range' => $params['range'] ?? 'last_30_days',
                'label' => $rangeLabel,
                'start_date' => $startStr,
                'end_date' => $endStr,
                'days_count' => $daysCount,
            ],
            'integration' => $this->merchantFeed->sanitizeIntegrationForClient($integration),
            'data_available' => $ga4Connected || $events->isNotEmpty() || $storeOrdersCount > 0,
            'ga4_api_connected' => $ga4Connected,
            'ga4_api_error' => $ga4ApiError,
            'availability_notice' => $availabilityNotice,
            'consent_mechanism' => [
                'storage_key' => 'mf:analytics-consent:v1',
                'google_consent_mode_v2' => true,
                'pii_protection' => 'Ativa (transaction_id usa order_number real; nome, e-mail, CPF, telefone e endereço são bloqueados dos eventos).',
            ],
            'kpis' => $kpis,
            'acquisition_channels' => $ga4Connected ? ($ga4ApiData['acquisition_channels'] ?? []) : $this->buildLocalUtmChannels($events),
            'funnel_steps' => $funnelSteps,
            'funnel_summary' => $this->buildFunnelSummary($funnelSteps, $ga4Connected),
            'products_views_without_purchases' => $productsViewsNoPurchase,
            'events_audit' => $eventsAudit,
        ];
    }

    /**
     * Dispatches a server-side GA4 Measurement Protocol refund event when configured,
     * and always records a PII-free internal AnalyticsEvent deduplicated by refund ID.
     */
    public function recordOrderRefund(Order $order, int $refundAmountCents, ?int $refundId = null): void
    {
        $itemsPayload = $order->items->map(fn (OrderItem $it): array => [
            'item_id' => $it->sku_snapshot,
            'item_name' => $it->product_name_snapshot,
            'price' => round(((int) $it->unit_price_cents) / 100, 2),
            'quantity' => (int) $it->quantity,
        ])->values()->all();

        $dedupSession = $refundId !== null ? "refund:{$refundId}" : "refund:order:{$order->id}:{$refundAmountCents}";
        $alreadyRecorded = AnalyticsEvent::query()
            ->where('event_name', 'refund')
            ->where('session_id', $dedupSession)
            ->exists();

        if (! $alreadyRecorded) {
            AnalyticsEvent::query()->create([
                'session_id' => $dedupSession,
                'user_id' => null,
                'order_id' => $order->id,
                'event_name' => 'refund',
                'path' => '/admin/pedidos',
                'payload' => [
                    'transaction_id' => $order->order_number,
                    'refund_id' => $refundId,
                    'value' => round($refundAmountCents / 100, 2),
                    'currency' => 'BRL',
                    'items' => $itemsPayload,
                ],
            ]);
        }

        $integration = MarketingIntegration::query()->where('platform', 'google_analytics_4')->first();
        if (! $integration) {
            return;
        }

        $measurementId = strtoupper(trim((string) ($integration->pixel_id ?? '')));
        $creds = $this->merchantFeed->decryptCredentials($integration->encrypted_credentials);
        $apiSecret = trim((string) ($creds['api_secret'] ?? ''));

        if ($measurementId === '' || preg_match('/^G-X+$/', $measurementId) === 1 || $apiSecret === '') {
            return;
        }

        try {
            Http::timeout(8)->post(
                "https://www.google-analytics.com/mp/collect?measurement_id={$measurementId}&api_secret={$apiSecret}",
                [
                    'client_id' => "server.order.{$order->id}",
                    'events' => [
                        [
                            'name' => 'refund',
                            'params' => [
                                'transaction_id' => $order->order_number,
                                'value' => round($refundAmountCents / 100, 2),
                                'currency' => 'BRL',
                                'items' => $itemsPayload,
                            ],
                        ],
                    ],
                ]
            );
        } catch (\Throwable) {
            // Never block financial refund completion on external telemetry network failures
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function fetchGa4PropertyReport(string $propertyId, string $saJson, string $startDate, string $endDate): array
    {
        $token = $this->oauth->tokenFromServiceAccount($saJson, [
            'https://www.googleapis.com/auth/analytics.readonly',
        ]);

        // 1. Totals report
        $totalsRes = Http::withToken($token)
            ->timeout(15)
            ->acceptJson()
            ->post("https://analyticsdata.googleapis.com/v1beta/properties/{$propertyId}:runReport", [
                'dateRanges' => [['startDate' => $startDate, 'endDate' => $endDate]],
                'metrics' => [
                    ['name' => 'sessions'],
                    ['name' => 'itemsViewed'],
                    ['name' => 'itemsAddedToCart'],
                    ['name' => 'checkouts'],
                    ['name' => 'ecommercePurchases'],
                    ['name' => 'purchaseRevenue'],
                ],
            ]);

        if (! $totalsRes->successful()) {
            $err = (string) ($totalsRes->json('error.message') ?? 'HTTP '.$totalsRes->status());
            throw new \RuntimeException($err);
        }

        $metricVals = $totalsRes->json('rows.0.metricValues') ?? [];
        $kpis = [
            'sessions' => (int) ($metricVals[0]['value'] ?? 0),
            'items_viewed' => (int) ($metricVals[1]['value'] ?? 0),
            'add_to_carts' => (int) ($metricVals[2]['value'] ?? 0),
            'checkouts' => (int) ($metricVals[3]['value'] ?? 0),
            'purchases' => (int) ($metricVals[4]['value'] ?? 0),
            'revenue_cents' => (int) round(((float) ($metricVals[5]['value'] ?? 0)) * 100),
        ];

        // 2. Channels breakdown
        $channelsRes = Http::withToken($token)
            ->timeout(15)
            ->acceptJson()
            ->post("https://analyticsdata.googleapis.com/v1beta/properties/{$propertyId}:runReport", [
                'dateRanges' => [['startDate' => $startDate, 'endDate' => $endDate]],
                'dimensions' => [['name' => 'sessionDefaultChannelGroup']],
                'metrics' => [
                    ['name' => 'sessions'],
                    ['name' => 'totalUsers'],
                    ['name' => 'ecommercePurchases'],
                    ['name' => 'purchaseRevenue'],
                ],
                'limit' => 10,
            ]);

        $channels = [];
        if ($channelsRes->successful()) {
            foreach (($channelsRes->json('rows') ?? []) as $row) {
                $sess = (int) ($row['metricValues'][0]['value'] ?? 0);
                $conv = (int) ($row['metricValues'][2]['value'] ?? 0);
                $channels[] = [
                    'channel' => (string) ($row['dimensionValues'][0]['value'] ?? 'Outros'),
                    'sessions' => $sess,
                    'users' => (int) ($row['metricValues'][1]['value'] ?? 0),
                    'conversions' => $conv,
                    'cvr_pct' => $sess > 0 ? round(($conv / $sess) * 100, 2) : 0.0,
                    'revenue_cents' => (int) round(((float) ($row['metricValues'][3]['value'] ?? 0)) * 100),
                ];
            }
        }

        // 3. Item views vs purchases
        $itemsRes = Http::withToken($token)
            ->timeout(15)
            ->acceptJson()
            ->post("https://analyticsdata.googleapis.com/v1beta/properties/{$propertyId}:runReport", [
                'dateRanges' => [['startDate' => $startDate, 'endDate' => $endDate]],
                'dimensions' => [['name' => 'itemId'], ['name' => 'itemName']],
                'metrics' => [['name' => 'itemsViewed'], ['name' => 'itemsPurchased']],
                'limit' => 50,
            ]);

        $viewsNoPurchase = [];
        if ($itemsRes->successful()) {
            foreach (($itemsRes->json('rows') ?? []) as $row) {
                $viewed = (int) ($row['metricValues'][0]['value'] ?? 0);
                $purchased = (int) ($row['metricValues'][1]['value'] ?? 0);
                if ($viewed > 0 && $purchased === 0) {
                    $viewsNoPurchase[] = [
                        'sku' => (string) ($row['dimensionValues'][0]['value'] ?? ''),
                        'name' => (string) ($row['dimensionValues'][1]['value'] ?? ''),
                        'views' => $viewed,
                        'purchases' => 0,
                        'source' => 'ga4_data_api',
                    ];
                }
            }
        }

        return [
            'kpis' => $kpis,
            'acquisition_channels' => $channels,
            'products_views_without_purchases' => $viewsNoPurchase,
        ];
    }

    /**
     * @param  \Illuminate\Support\Collection<int, AnalyticsEvent>  $events
     * @return list<array<string, mixed>>
     */
    private function computeLocalViewsWithoutPurchases($events, Carbon $start, Carbon $end): array
    {
        $viewsBySku = [];
        foreach ($events->where('event_name', 'view_item') as $ev) {
            $items = is_array($ev->payload['items'] ?? null) ? $ev->payload['items'] : [];
            foreach ($items as $it) {
                $sku = trim((string) ($it['item_id'] ?? ''));
                $name = trim((string) ($it['item_name'] ?? ''));
                if ($sku === '') {
                    continue;
                }
                if (! isset($viewsBySku[$sku])) {
                    $viewsBySku[$sku] = ['sku' => $sku, 'name' => $name, 'views' => 0];
                }
                $viewsBySku[$sku]['views']++;
            }
        }

        if ($viewsBySku === []) {
            return [];
        }

        $purchasedSkus = OrderItem::query()
            ->whereHas('order', function ($q) use ($start, $end): void {
                $q->whereNotIn('status', [OrderStatus::Cancelled->value, OrderStatus::PaymentFailed->value, OrderStatus::Expired->value])
                    ->where('created_at', '>=', $start)
                    ->where('created_at', '<=', $end);
            })
            ->pluck('sku_snapshot')
            ->filter()
            ->unique()
            ->all();

        $purchasedSet = array_flip($purchasedSkus);
        $out = [];
        foreach ($viewsBySku as $sku => $info) {
            if (! isset($purchasedSet[$sku])) {
                $prod = Product::query()->where('sku', $sku)->first(['id', 'slug', 'price_cents']);
                $out[] = [
                    'sku' => $sku,
                    'name' => $info['name'],
                    'slug' => $prod?->slug,
                    'views' => $info['views'],
                    'purchases' => 0,
                    'source' => 'consented_store_events',
                ];
            }
        }

        usort($out, fn (array $a, array $b): int => $b['views'] <=> $a['views']);

        return array_slice($out, 0, 20);
    }

    /**
     * @param  \Illuminate\Support\Collection<int, AnalyticsEvent>  $events
     * @return list<array<string, mixed>>
     */
    private function buildLocalUtmChannels($events): array
    {
        $pageViews = $events->where('event_name', 'page_view');
        if ($pageViews->isEmpty()) {
            return [];
        }

        $grouped = $pageViews->groupBy(function (AnalyticsEvent $ev): string {
            $src = trim((string) ($ev->utm_source ?: '(direct)'));
            $med = trim((string) ($ev->utm_medium ?: '(none)'));

            return "{$src} / {$med}";
        });

        $out = [];
        foreach ($grouped as $sourceMedium => $group) {
            $sessCount = $group->pluck('session_id')->filter()->unique()->count();
            $out[] = [
                'channel' => $sourceMedium,
                'source_medium' => $sourceMedium,
                'sessions' => $sessCount,
                'users' => $sessCount,
                'conversions' => 0,
                'cvr_pct' => 0.0,
                'revenue_cents' => 0,
            ];
        }

        usort($out, fn (array $a, array $b): int => $b['sessions'] <=> $a['sessions']);

        return array_slice($out, 0, 10);
    }

    /** @return list<array<string, mixed>> */
    private function buildFunnelSteps(?int $views, ?int $carts, ?int $checkouts, ?int $purchases): array
    {
        $rawSteps = [
            ['step_number' => 1, 'name' => 'Visualização de Produto', 'event_name' => 'view_item', 'count' => $views],
            ['step_number' => 2, 'name' => 'Adição ao Carrinho', 'event_name' => 'add_to_cart', 'count' => $carts],
            ['step_number' => 3, 'name' => 'Início do Checkout', 'event_name' => 'begin_checkout', 'count' => $checkouts],
            ['step_number' => 4, 'name' => 'Compra Confirmada', 'event_name' => 'purchase', 'count' => $purchases],
        ];

        $steps = [];
        $prev = null;
        foreach ($rawSteps as $st) {
            $cnt = $st['count'];
            $convPct = ($prev !== null && $prev > 0 && $cnt !== null) ? round(($cnt / $prev) * 100, 1) : null;
            $dropPct = $convPct !== null ? max(0.0, round(100 - $convPct, 1)) : null;
            $steps[] = [
                'step_number' => $st['step_number'],
                'name' => $st['name'],
                'event_name' => $st['event_name'],
                'users_count' => $cnt,
                'step_conversion_pct' => $convPct,
                'drop_off_pct' => $dropPct,
            ];
            if ($cnt !== null) {
                $prev = $cnt;
            }
        }

        return $steps;
    }

    /**
     * @param  list<array<string, mixed>>  $steps
     * @return array<string, mixed>
     */
    private function buildFunnelSummary(array $steps, bool $ga4Connected): array
    {
        $first = $steps[0]['users_count'] ?? null;
        $last = $steps[count($steps) - 1]['users_count'] ?? null;

        if ($first === null || $first === 0) {
            return [
                'overall_cvr_pct' => null,
                'biggest_leak' => null,
                'diagnosis' => $ga4Connected
                    ? 'A propriedade GA4 conectada ainda não registrou visualizações de produtos no período selecionado.'
                    : 'Sem eventos consentidos de visualização de produto suficientes no período para calcular conversão de funil.',
            ];
        }

        $overallCvr = $last !== null ? round(($last / $first) * 100, 2) : 0.0;
        $worstStep = null;
        $worstDrop = -1.0;
        foreach ($steps as $st) {
            if ($st['drop_off_pct'] !== null && $st['drop_off_pct'] > $worstDrop) {
                $worstDrop = (float) $st['drop_off_pct'];
                $worstStep = $st['name'];
            }
        }

        return [
            'overall_cvr_pct' => $overallCvr,
            'biggest_leak' => $worstStep ? "{$worstStep} ({$worstDrop}% de queda na etapa)" : null,
            'diagnosis' => "Taxa de conversão entre visualização de produto e pedido no período: {$overallCvr}%.",
        ];
    }

    /**
     * @param  \Illuminate\Support\Collection<int, AnalyticsEvent>  $events
     * @return list<array<string, mixed>>
     */
    private function buildEventsAudit($events, bool $validTag, int $refundsCount): array
    {
        $defs = [
            'view_item' => 'Visualização de página de produto (SKU, nome, categoria e preço em BRL, sem PII)',
            'add_to_cart' => 'Adição de item ao carrinho na vitrine, página de produto ou sacola lateral',
            'remove_from_cart' => 'Remoção de item no carrinho ou sacola lateral',
            'begin_checkout' => 'Entrada única no checkout (desduplicada por sessão/carrinho)',
            'purchase' => 'Pedido aprovado com transaction_id igual ao número real do pedido (MF-...) e trava anti-duplicidade',
            'refund' => 'Estorno/reembolso confirmado no pedido com transaction_id real e valor estornado',
        ];

        $out = [];
        foreach ($defs as $eventName => $details) {
            $matching = $events->where('event_name', $eventName);
            $last = $matching->sortByDesc('id')->first();
            $count = $matching->count();

            $out[] = [
                'event' => $eventName,
                'implemented_in_code' => true,
                'tag_active' => $validTag,
                'recorded_count_in_period' => $count,
                'status' => $count > 0 ? 'detected' : ($validTag ? 'ready_waiting_traffic' : 'implemented_pending_ga4_id'),
                'last_detected' => $last?->created_at?->toIso8601String(),
                'details' => $details.($eventName === 'refund' && $refundsCount === 0 ? ' (nenhum reembolso ocorrido no período).' : ''),
            ];
        }

        return $out;
    }

    /**
     * @param  array{range?: string, start_date?: string, end_date?: string}  $params
     * @return array{0: Carbon, 1: Carbon, 2: string, 3: int}
     */
    public function resolvePeriod(array $params): array
    {
        $range = (string) ($params['range'] ?? 'last_30_days');
        $now = now();

        return match ($range) {
            'today' => [$now->copy()->startOfDay(), $now->copy()->endOfDay(), 'Hoje', 1],
            'yesterday' => [$now->copy()->subDay()->startOfDay(), $now->copy()->subDay()->endOfDay(), 'Ontem', 1],
            'last_7_days' => [$now->copy()->subDays(6)->startOfDay(), $now->copy()->endOfDay(), 'Últimos 7 dias', 7],
            'last_90_days' => [$now->copy()->subDays(89)->startOfDay(), $now->copy()->endOfDay(), 'Últimos 90 dias', 90],
            'custom' => [
                Carbon::parse($params['start_date'] ?? $now->copy()->subDays(29)->toDateString())->startOfDay(),
                Carbon::parse($params['end_date'] ?? $now->toDateString())->endOfDay(),
                'Período personalizado',
                (int) max(1, Carbon::parse($params['start_date'] ?? $now->copy()->subDays(29)->toDateString())->diffInDays(Carbon::parse($params['end_date'] ?? $now->toDateString())) + 1),
            ],
            default => [$now->copy()->subDays(29)->startOfDay(), $now->copy()->endOfDay(), 'Últimos 30 dias', 30],
        };
    }
}
