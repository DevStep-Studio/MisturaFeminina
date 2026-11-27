<?php

declare(strict_types=1);

namespace App\Domain\Admin\Services;

use App\Domain\Catalog\Services\RestockNotificationService;
use App\Domain\Shared\Enums\OrderStatus;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\SearchQueryLog;
use App\Models\SearchSynonym;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class IntelligentReportsService
{
    public function __construct(private readonly RestockNotificationService $restock) {}

    public function logSearchQuery(
        string $rawTerm,
        int $resultsCount,
        ?string $categorySlug = null,
        ?string $sessionId = null,
        ?int $userId = null,
    ): void {
        $clean = trim($rawTerm);
        if (mb_strlen($clean) < 2) {
            return;
        }
        // Guard against PII (emails or CPFs) being persisted in search analytics.
        if (str_contains($clean, '@') || preg_match('/\d{9,14}/', preg_replace('/\D/', '', $clean) ?? '') === 1) {
            return;
        }

        $normalized = Str::ascii(mb_strtolower(preg_replace('/\s+/', ' ', $clean) ?? $clean));

        SearchQueryLog::query()->create([
            'raw_term' => mb_substr($clean, 0, 160),
            'normalized_term' => mb_substr($normalized, 0, 160),
            'results_count' => max(0, $resultsCount),
            'category_slug' => $categorySlug ? mb_substr($categorySlug, 0, 120) : null,
            'session_id' => $sessionId ? mb_substr($sessionId, 0, 100) : null,
            'user_id' => $userId,
        ]);
    }

    /** @return list<string> */
    public function expandQueryWithSynonyms(string $rawTerm): array
    {
        $normalized = Str::ascii(mb_strtolower(trim($rawTerm)));
        if ($normalized === '') {
            return [];
        }

        $terms = [$rawTerm];

        $defaultManicureSynonyms = [
            'broca' => ['motor', 'lixadeira', 'caneta', 'lixa'],
            'brocas' => ['motor', 'lixadeira', 'caneta', 'lixas'],
            'lixadeira' => ['motor', 'caneta', 'broca'],
            'caneta' => ['motor', 'lixadeira'],
            'prep' => ['preparador', 'higienizador', 'any lovy'],
            'top coat' => ['finalizador', 'selante', 'top lirio'],
            'molde f1' => ['molde para unha', 'kaisa', 'unhas posticas'],
            'tips' => ['tip', 'unhas posticas', 'bailarina'],
            'tip' => ['tips', 'unhas posticas', 'bailarina'],
        ];
        if (isset($defaultManicureSynonyms[$normalized])) {
            foreach ($defaultManicureSynonyms[$normalized] as $t) {
                $terms[] = $t;
            }
        }

        $synonyms = SearchSynonym::query()->where('is_active', true)->get();
        foreach ($synonyms as $syn) {
            $synTerm = Str::ascii(mb_strtolower($syn->term));
            $synList = array_map(fn (string $s): string => Str::ascii(mb_strtolower($s)), $syn->synonyms);
            if ($normalized === $synTerm || str_contains($normalized, $synTerm)) {
                foreach ($syn->synonyms as $target) {
                    $terms[] = $target;
                }
            } elseif (in_array($normalized, $synList, true)) {
                $terms[] = $syn->term;
            }
        }

        return array_values(array_unique(array_filter(array_map('trim', $terms))));
    }

    /** @return array<string, mixed> */
    public function zeroResultSearches(CarbonInterface $from, CarbonInterface $to, ?string $filterSearch = null): array
    {
        $query = SearchQueryLog::query()
            ->where('results_count', 0)
            ->whereBetween('created_at', [$from, $to]);

        if ($filterSearch !== null && trim($filterSearch) !== '') {
            $like = '%'.Str::ascii(mb_strtolower(trim($filterSearch))).'%';
            $query->where('normalized_term', 'like', $like);
        }

        $rows = $query
            ->selectRaw('normalized_term, MIN(raw_term) as sample_term, COUNT(*) as occurrences, MAX(created_at) as last_searched_at, MAX(category_slug) as category_slug')
            ->groupBy('normalized_term')
            ->orderByDesc('occurrences')
            ->limit(100)
            ->get();

        $synonyms = SearchSynonym::query()->where('is_active', true)->get()->keyBy(fn (SearchSynonym $s): string => Str::ascii(mb_strtolower($s->term)));

        $items = $rows->map(function ($row) use ($synonyms): array {
            $norm = (string) $row->normalized_term;
            $firstWord = explode(' ', $norm)[0];
            $similar = mb_strlen($firstWord) >= 3
                ? Product::query()->where('is_active', true)->where('name', 'like', "%{$firstWord}%")->limit(3)->get(['id', 'name', 'slug'])
                : collect();

            /** @var SearchSynonym|null $matchedSyn */
            $matchedSyn = $synonyms->get($norm);

            return [
                'normalized_term' => $norm,
                'sample_term' => (string) $row->getAttribute('sample_term'),
                'occurrences' => (int) $row->getAttribute('occurrences'),
                'last_searched_at' => (string) $row->getAttribute('last_searched_at'),
                'category_slug' => $row->getAttribute('category_slug'),
                'synonym' => $matchedSyn ? ['id' => $matchedSyn->id, 'synonyms' => $matchedSyn->synonyms] : null,
                'similar_products' => $similar->map(fn (Product $p): array => [
                    'id' => $p->id,
                    'name' => $p->name,
                    'slug' => $p->slug,
                ])->values()->all(),
            ];
        })->values()->all();

        return [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'total_unique_terms' => count($items),
            'total_searches' => array_sum(array_column($items, 'occurrences')),
            'items' => $items,
        ];
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function demandedShadesReport(array $filters = []): array
    {
        $query = DB::table('restock_requests')
            ->join('products', 'restock_requests.product_id', '=', 'products.id')
            ->leftJoin('product_variants', 'restock_requests.product_variant_id', '=', 'product_variants.id')
            ->leftJoin('brands', 'products.brand_id', '=', 'brands.id');

        if (! empty($filters['brand_id'])) {
            $query->where('products.brand_id', (int) $filters['brand_id']);
        }
        if (! empty($filters['product_id'])) {
            $query->where('products.id', (int) $filters['product_id']);
        }
        if (! empty($filters['from']) && ! empty($filters['to'])) {
            $query->whereBetween('restock_requests.created_at', [
                now()->parse((string) $filters['from'])->startOfDay(),
                now()->parse((string) $filters['to'])->endOfDay(),
            ]);
        }
        if (! empty($filters['category_id'])) {
            $catId = (int) $filters['category_id'];
            $query->whereExists(function ($sub) use ($catId): void {
                $sub->select(DB::raw(1))
                    ->from('category_product')
                    ->whereColumn('category_product.product_id', 'products.id')
                    ->where('category_product.category_id', $catId);
            });
        }
        if (($filters['availability'] ?? '') === 'out_of_stock') {
            $query->whereRaw('(COALESCE(product_variants.stock_qty, 0) - COALESCE(product_variants.reserved_qty, 0)) <= 0');
        } elseif (($filters['availability'] ?? '') === 'in_stock') {
            $query->whereRaw('(COALESCE(product_variants.stock_qty, 0) - COALESCE(product_variants.reserved_qty, 0)) > 0');
        }

        $rows = $query
            ->selectRaw("
                products.id as product_id,
                products.name as product_name,
                products.slug as product_slug,
                product_variants.id as product_variant_id,
                COALESCE(product_variants.name, 'Padrão') as variant_name,
                product_variants.shade_code,
                COALESCE(product_variants.sku, products.sku) as sku,
                brands.name as brand_name,
                CASE WHEN (COALESCE(product_variants.stock_qty, 0) - COALESCE(product_variants.reserved_qty, 0)) > 0 THEN (COALESCE(product_variants.stock_qty, 0) - COALESCE(product_variants.reserved_qty, 0)) ELSE 0 END as available_stock,
                SUM(CASE WHEN restock_requests.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                COUNT(*) as total_historical_count,
                MAX(restock_requests.created_at) as last_requested_at
            ")
            ->groupBy(
                'products.id',
                'products.name',
                'products.slug',
                'product_variants.id',
                'product_variants.name',
                'product_variants.shade_code',
                'product_variants.sku',
                'products.sku',
                'brands.name',
                'product_variants.stock_qty',
                'product_variants.reserved_qty'
            )
            ->orderByDesc('pending_count')
            ->orderByDesc('total_historical_count')
            ->limit(100)
            ->get()
            ->map(fn (object $r): array => [
                'product_id' => (int) $r->product_id,
                'product_name' => (string) $r->product_name,
                'product_slug' => (string) $r->product_slug,
                'product_variant_id' => $r->product_variant_id !== null ? (int) $r->product_variant_id : null,
                'variant_name' => (string) $r->variant_name,
                'shade_code' => $r->shade_code ? (string) $r->shade_code : null,
                'sku' => (string) $r->sku,
                'brand_name' => $r->brand_name ? (string) $r->brand_name : null,
                'available_stock' => (int) $r->available_stock,
                'pending_count' => (int) $r->pending_count,
                'total_historical_count' => (int) $r->total_historical_count,
                'last_requested_at' => (string) $r->last_requested_at,
            ])
            ->values()
            ->all();

        return [
            'items' => $rows,
            'kpis' => $this->restock->demandSummary()['kpis'],
        ];
    }

    /** @return array<string, mixed> */
    public function boughtTogether(CarbonInterface $from, CarbonInterface $to): array
    {
        $paidStatuses = [
            OrderStatus::Paid->value,
            OrderStatus::Preparing->value,
            OrderStatus::Shipped->value,
            OrderStatus::Delivered->value,
        ];

        $items = OrderItem::query()
            ->whereHas('order', fn ($q) => $q->whereBetween('created_at', [$from, $to])->whereIn('status', $paidStatuses))
            ->get(['order_id', 'product_id', 'product_name_snapshot', 'total_cents']);

        $ordersByProduct = [];
        $orderProductTotals = [];
        $orderSets = [];

        foreach ($items as $item) {
            $oid = (int) $item->order_id;
            $pid = (int) $item->product_id;
            $orderSets[$oid][$pid] = true;
            $ordersByProduct[$pid][$oid] = true;
            $orderProductTotals[$oid][$pid] = ($orderProductTotals[$oid][$pid] ?? 0) + (int) $item->total_cents;
        }

        $pairCounts = [];
        $pairRevenue = [];
        foreach ($orderSets as $oid => $prodMap) {
            $pids = array_keys($prodMap);
            sort($pids);
            $count = count($pids);
            if ($count < 2) {
                continue;
            }
            for ($i = 0; $i < $count; $i++) {
                for ($j = $i + 1; $j < $count; $j++) {
                    $a = $pids[$i];
                    $b = $pids[$j];
                    $key = "{$a}_{$b}";
                    $pairCounts[$key] = ($pairCounts[$key] ?? 0) + 1;
                    $pairRevenue[$key] = ($pairRevenue[$key] ?? 0) + ($orderProductTotals[$oid][$a] ?? 0) + ($orderProductTotals[$oid][$b] ?? 0);
                }
            }
        }

        arsort($pairCounts);
        $topKeys = array_slice(array_keys($pairCounts), 0, 30);

        $allPids = [];
        foreach ($topKeys as $k) {
            [$a, $b] = array_map('intval', explode('_', $k));
            $allPids[] = $a;
            $allPids[] = $b;
        }
        $products = Product::query()
            ->whereIn('id', array_unique($allPids))
            ->with('images')
            ->get()
            ->keyBy('id');

        $pairs = [];
        foreach ($topKeys as $k) {
            [$a, $b] = array_map('intval', explode('_', $k));
            /** @var Product|null $prodA */
            $prodA = $products->get($a);
            /** @var Product|null $prodB */
            $prodB = $products->get($b);
            if (! $prodA || ! $prodB) {
                continue;
            }
            $joint = $pairCounts[$k];
            $totalA = max(1, count($ordersByProduct[$a] ?? []));
            $totalB = max(1, count($ordersByProduct[$b] ?? []));
            $pctAinB = round(($joint / $totalA) * 100, 1);
            $pctBinA = round(($joint / $totalB) * 100, 1);
            $imgA = $prodA->images->firstWhere('is_primary', true) ?? $prodA->images->first();
            $imgB = $prodB->images->firstWhere('is_primary', true) ?? $prodB->images->first();

            $pairs[] = [
                'product_a' => [
                    'id' => $prodA->id,
                    'name' => $prodA->name,
                    'slug' => $prodA->slug,
                    'sku' => $prodA->sku,
                    'image_url' => $imgA?->path,
                ],
                'product_b' => [
                    'id' => $prodB->id,
                    'name' => $prodB->name,
                    'slug' => $prodB->slug,
                    'sku' => $prodB->sku,
                    'image_url' => $imgB?->path,
                ],
                'joint_orders_count' => $joint,
                'pct_of_a_orders' => $pctAinB,
                'pct_of_b_orders' => $pctBinA,
                'associated_revenue_cents' => $pairRevenue[$k] ?? 0,
                'suggestion' => $joint >= 3 && max($pctAinB, $pctBinA) >= 50
                    ? 'Kit / Combo recomendado'
                    : 'Cross-sell em página de produto',
            ];
        }

        return [
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'pairs' => $pairs,
        ];
    }

    /** Sanitizes CSV cell against Excel formula injection (`=`, `+`, `-`, `@`, tab, CR). */
    public function safeCsvCell(string|int|float|null $value): string
    {
        $str = str_replace([';', "\r", "\n"], [',', ' ', ' '], (string) ($value ?? ''));
        if ($str !== '' && in_array($str[0], ['=', '+', '-', '@', "\t"], true)) {
            return "'".$str;
        }

        return $str;
    }
}
