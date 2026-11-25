<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Admin\Services\IntelligentReportsService;
use App\Domain\Catalog\Services\ProductAttributeService;
use App\Domain\Catalog\Services\RestockNotificationService;
use App\Domain\Settings\Services\StoreSettingsService;
use App\Domain\Shipping\Services\ShippingQuoteService;
use App\Domain\Wholesale\Services\WholesalePricingService;
use App\Domain\Wholesale\Services\WholesaleResellerService;
use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Review;
use App\Models\SlugRedirect;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class CatalogController extends Controller
{
    public function __construct(
        private readonly StoreSettingsService $settings,
        private readonly ShippingQuoteService $shipping,
        private readonly ProductAttributeService $attributes,
        private readonly RestockNotificationService $restock,
        private readonly IntelligentReportsService $reports,
    ) {}

    public function categories(): JsonResponse
    {
        $categories = Category::query()
            ->where('is_active', true)
            ->whereNull('parent_id')
            ->with(['children' => fn ($q) => $q->where('is_active', true)->orderBy('sort_order')->with('children')])
            ->orderBy('sort_order')
            ->get();

        return response()->json(['data' => $categories]);
    }

    public function categoryShow(Request $request, string $slug): JsonResponse
    {
        $category = Category::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->with([
                'parent:id,name,slug',
                'children' => fn ($q) => $q->where('is_active', true)->orderBy('sort_order')->with([
                    'children' => fn ($q2) => $q2->where('is_active', true)->orderBy('sort_order'),
                ]),
            ])
            ->first();
        if (! $category) {
            $redirect = SlugRedirect::query()->where('entity_type', 'category')->where('old_slug', $slug)->first();
            if ($redirect) {
                return response()->json(['redirect_to' => '/categoria/'.$redirect->new_slug], 301);
            }
            abort(404, 'Categoria não encontrada.');
        }

        $categoryIds = [$category->id];
        foreach ($category->children as $child) {
            $categoryIds[] = $child->id;
            foreach ($child->children as $grandChild) {
                $categoryIds[] = $grandChild->id;
            }
        }
        $query = Product::query()
            ->where('is_active', true)
            ->whereHas('categories', fn (Builder $q) => $q->whereIn('categories.id', $categoryIds));

        $result = $this->applyProductFiltersAndPaginate($request, $query, $category);

        return response()->json([
            'data' => [
                'category' => $category,
                'products' => $result['products'],
                'meta' => $result['meta'],
                'facets' => $result['facets'],
            ],
        ]);
    }

    public function brands(): JsonResponse
    {
        $brands = Brand::query()
            ->where('is_active', true)
            ->withCount(['products' => fn ($q) => $q->where('is_active', true)])
            ->orderBy('name')
            ->get();

        return response()->json(['data' => $brands]);
    }

    public function brandShow(Request $request, string $slug): JsonResponse
    {
        $brand = Brand::query()->where('slug', $slug)->where('is_active', true)->first();
        if (! $brand) {
            $redirect = SlugRedirect::query()->where('entity_type', 'brand')->where('old_slug', $slug)->first();
            if ($redirect) {
                return response()->json(['redirect_to' => '/marca/'.$redirect->new_slug], 301);
            }
            abort(404, 'Marca não encontrada.');
        }

        $query = Product::query()->where('is_active', true)->where('brand_id', $brand->id);
        $result = $this->applyProductFiltersAndPaginate($request, $query);

        return response()->json([
            'data' => [
                'brand' => $brand,
                'products' => $result['products'],
                'meta' => $result['meta'],
                'facets' => $result['facets'],
            ],
        ]);
    }

    public function products(Request $request): JsonResponse
    {
        $query = Product::query()->where('is_active', true);

        $collection = (string) $request->query('collection', '');
        if ($collection === 'ofertas' || $collection === 'promocoes') {
            $query->whereNotNull('promo_price_cents')->whereColumn('promo_price_cents', '<', 'price_cents');
        } elseif ($collection === 'novidades') {
            $query->where('is_new_arrival', true);
        } elseif ($collection === 'mais-vendidos') {
            $query->where('is_best_seller', true);
        }

        $result = $this->applyProductFiltersAndPaginate($request, $query);

        return response()->json([
            'data' => [
                'products' => $result['products'],
                'meta' => $result['meta'],
                'facets' => $result['facets'],
            ],
        ]);
    }

    public function search(Request $request): JsonResponse
    {
        $rawQ = trim((string) $request->query('q', ''));
        $autocomplete = $request->boolean('autocomplete');

        $query = Product::query()->where('is_active', true);

        if ($rawQ !== '') {
            $expandedTerms = $this->reports->expandQueryWithSynonyms($rawQ);
            $normalized = Str::ascii(mb_strtolower($rawQ));
            $terms = array_values(array_filter(preg_split('/\s+/', $normalized) ?: []));

            $query->where(function (Builder $outer) use ($expandedTerms, $terms): void {
                foreach ($expandedTerms as $searchCandidate) {
                    $outer->orWhere('sku', 'like', "%{$searchCandidate}%")
                        ->orWhere('name', 'like', "%{$searchCandidate}%")
                        ->orWhereHas('variants', fn ($vq) => $vq->where('sku', 'like', "%{$searchCandidate}%")->orWhere('name', 'like', "%{$searchCandidate}%")->orWhere('shade_code', 'like', "%{$searchCandidate}%"))
                        ->orWhereHas('brand', fn ($bq) => $bq->where('name', 'like', "%{$searchCandidate}%"));
                }

                if (count($terms) > 0) {
                    $outer->orWhere(function (Builder $termQ) use ($terms): void {
                        foreach ($terms as $term) {
                            $termQ->where(function (Builder $inner) use ($term): void {
                                $inner->whereRaw('LOWER(name) LIKE ?', ["%{$term}%"])
                                    ->orWhereRaw('LOWER(COALESCE(short_description, "")) LIKE ?', ["%{$term}%"])
                                    ->orWhereRaw('LOWER(COALESCE(tags, "")) LIKE ?', ["%{$term}%"]);
                            });
                        }
                    });
                }
            });
        }

        if ($autocomplete) {
            $suggestions = $query->with(['brand:id,name', 'images', 'variants' => fn ($q) => $q->where('is_active', true)->whereNull('archived_at')])
                ->orderByDesc('sales_count')
                ->limit(6)
                ->get()
                ->map(fn (Product $p): array => self::serializeProductCard($p))
                ->values();

            return response()->json(['data' => ['query' => $rawQ, 'suggestions' => $suggestions]]);
        }

        $result = $this->applyProductFiltersAndPaginate($request, $query);

        if ($rawQ !== '') {
            $totalFound = (int) ($result['meta']['total'] ?? count($result['products']));
            $this->reports->logSearchQuery(
                $rawQ,
                $totalFound,
                $request->filled('category') ? (string) $request->query('category') : null,
                $request->header('X-Cart-Token'),
                $request->user()?->id,
            );
        }

        return response()->json([
            'data' => [
                'query' => $rawQ,
                'products' => $result['products'],
                'meta' => $result['meta'],
                'facets' => $result['facets'],
            ],
        ]);
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        $product = Product::query()
            ->where('slug', $slug)
            ->where('is_active', true)
            ->with([
                'brand',
                'categories:id,name,slug,parent_id',
                'images',
                'attributeValues.attribute',
                'variants' => fn ($q) => $q->where('is_active', true)
                    ->whereNull('archived_at')
                    ->orderBy('sort_order')
                    ->orderBy('id')
                    ->with(['attributeValues.attribute', 'image'])
                    ->withCount(['restockRequests as pending_restock_count' => fn ($rq) => $rq->where('status', 'pending')]),
                'kitItems.componentProduct:id,name,slug',
                'kitItems.componentVariant:id,name,sku,stock_qty,reserved_qty',
                'reviews' => fn ($q) => $q->where('status', 'approved')->latest('id')->limit(20),
            ])
            ->first();

        if (! $product) {
            $redirect = SlugRedirect::query()->where('entity_type', 'product')->where('old_slug', $slug)->first();
            if ($redirect) {
                return response()->json(['redirect_to' => '/produto/'.$redirect->new_slug], 301);
            }
            abort(404, 'Produto não encontrado.');
        }

        $categoryIds = $product->categories->pluck('id')->all();
        $related = Product::query()
            ->where('is_active', true)
            ->where('id', '!=', $product->id)
            ->when(count($categoryIds) > 0, fn ($q) => $q->whereHas('categories', fn ($cq) => $cq->whereIn('categories.id', $categoryIds)))
            ->with(['brand:id,name,slug', 'images', 'variants' => fn ($q) => $q->where('is_active', true)->whereNull('archived_at')])
            ->orderByDesc('sales_count')
            ->limit(8)
            ->get()
            ->map(fn (Product $p): array => self::serializeProductCard($p))
            ->values();

        $config = $this->settings->getPublicConfig();
        $card = self::serializeProductCard($product, (int) ($config['max_installments'] ?? 6));

        $approvedReviews = $product->reviews;
        $avgRating = $approvedReviews->count() > 0 ? round((float) $approvedReviews->avg('rating'), 1) : 0.0;

        return response()->json([
            'data' => [
                ...$card,
                'gtin' => $product->gtin,
                'manufacturer' => $product->manufacturer,
                'short_description' => $product->short_description,
                'description' => $product->description,
                'ingredients' => $product->ingredients,
                'usage_instructions' => $product->usage_instructions,
                'unit_label' => $product->unit_label,
                'unit_quantity' => $product->unit_quantity,
                'weight_grams' => $product->weight_grams,
                'dimensions' => [
                    'width_cm' => $product->width_cm,
                    'height_cm' => $product->height_cm,
                    'length_cm' => $product->length_cm,
                ],
                'video_url' => $product->video_url,
                'tags' => $product->tags ?? [],
                'wholesale_enabled' => (bool) ($config['wholesale_enabled'] ?? false) && $product->wholesale_enabled,
                'wholesale_group_variants' => (bool) $product->wholesale_group_variants,
                'wholesale_tiers' => $product->wholesale_tiers ?? [],
                'wholesale_condition' => app(WholesalePricingService::class)->calculateForProduct($product, $request->user()),
                'comparison_group' => $this->attributes->resolveComparisonGroup($product),
                'specs' => $this->attributes->extractComparableSpecs($product),
                'has_variants' => $product->usesVariations(),
                'variation_axes' => self::buildVariationAxes($product, $product->variants),
                'categories' => $product->categories,
                'images' => $product->images,
                'variants' => $product->variants->map(fn (ProductVariant $v): array => self::serializeVariant($v))->values(),
                'kit_items' => $product->kitItems,
                'reviews' => $approvedReviews,
                'rating_avg' => $avgRating,
                'rating_count' => $approvedReviews->count(),
                'seo_title' => $product->seo_title ?: $product->name,
                'seo_description' => $product->seo_description ?: $product->short_description,
                'related_products' => $related,
            ],
        ]);
    }

    public function compare(Request $request): JsonResponse
    {
        $rawIds = $request->query('ids', '');
        $rawSlugs = $request->query('slugs', '');

        $identifiers = [];
        if (is_array($rawIds)) {
            $identifiers = $rawIds;
        } elseif (trim($rawIds) !== '') {
            $identifiers = explode(',', $rawIds);
        } elseif (is_array($rawSlugs)) {
            $identifiers = $rawSlugs;
        } elseif (trim($rawSlugs) !== '') {
            $identifiers = explode(',', $rawSlugs);
        }

        $clean = array_values(array_unique(array_filter(array_map(fn ($v) => trim((string) $v), $identifiers))));

        return response()->json([
            'data' => $this->attributes->compareProducts($clean),
        ]);
    }

    public function quoteProductShipping(Request $request, string $slug): JsonResponse
    {
        $validated = $request->validate([
            'cep' => ['required', 'string', 'max:12'],
            'quantity' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);
        $product = Product::query()->where('slug', $slug)->where('is_active', true)->firstOrFail();

        return response()->json([
            'data' => $this->shipping->quoteForProduct($validated['cep'], $product, (int) ($validated['quantity'] ?? 1)),
        ]);
    }

    public function restockAlert(Request $request, string $slug): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['nullable', 'string', 'email:rfc', 'max:190'],
            'phone' => ['nullable', 'string', 'max:30'],
            'channel' => ['nullable', 'in:email,whatsapp'],
            'name' => ['nullable', 'string', 'max:120'],
            'variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'consent_given' => ['nullable', 'boolean'],
        ]);

        $product = Product::query()->where('slug', $slug)->where('is_active', true)->firstOrFail();
        $variant = ! empty($validated['variant_id'])
            ? ProductVariant::query()->find((int) $validated['variant_id'])
            : null;

        $result = $this->restock->subscribe($product, $variant, $validated, $request->user());
        if ($result['duplicate']) {
            return response()->json([
                'message' => 'Você já possui uma solicitação ativa para esta tonalidade.',
                'duplicate' => true,
                'data' => $result['request'],
            ], 409);
        }

        return response()->json([
            'message' => 'Pronto! Sua solicitação foi registrada. Avisaremos quando esta tonalidade voltar ao estoque.',
            'duplicate' => false,
            'data' => $result['request'],
        ], 201);
    }

    public function cancelRestockAlert(string $token): JsonResponse
    {
        $req = $this->restock->cancelByToken($token);

        return response()->json([
            'message' => 'Solicitação de aviso cancelada com sucesso.',
            'data' => $req,
        ]);
    }

    public function storeReview(Request $request, string $slug): JsonResponse
    {
        $validated = $request->validate([
            'rating' => ['required', 'integer', 'min:1', 'max:5'],
            'title' => ['nullable', 'string', 'max:160'],
            'body' => ['required', 'string', 'min:5', 'max:1500'],
        ]);

        $user = $request->user();
        $product = Product::query()->where('slug', $slug)->where('is_active', true)->firstOrFail();

        $verified = $user ? Order::query()
            ->where('user_id', $user->id)
            ->whereIn('status', ['paid', 'preparing', 'shipped', 'delivered'])
            ->whereHas('items', fn ($q) => $q->where('product_id', $product->id))
            ->exists() : false;

        $review = Review::query()->create([
            'product_id' => $product->id,
            'user_id' => $user ? $user->id : null,
            'author_name' => $user ? $user->name : 'Cliente',
            'rating' => (int) $validated['rating'],
            'title' => $validated['title'] ?? null,
            'body' => $validated['body'],
            'is_verified_purchase' => $verified,
            'status' => 'pending',
        ]);

        return response()->json([
            'message' => 'Avaliação enviada para moderação.',
            'data' => $review,
        ], 201);
    }

    /**
     * @param  Builder<Product>  $query
     * @return array{products: list<array<string, mixed>>, meta: array<string, mixed>, facets: array<string, mixed>}
     */
    private function applyProductFiltersAndPaginate(Request $request, Builder $query, ?Category $category = null): array
    {
        $baseIds = $query->clone()->pluck('products.id')->map(fn ($id): int => (int) $id)->values()->all();

        $this->attributes->applyAttributeFilters($query, $request);

        if ($request->filled('brand')) {
            $brands = array_filter(explode(',', (string) $request->query('brand')));
            $query->whereHas('brand', fn (Builder $bq) => $bq->whereIn('slug', $brands));
        }

        if ($request->filled('category')) {
            $catSlugs = array_filter(explode(',', (string) $request->query('category')));
            $query->whereHas('categories', fn (Builder $cq) => $cq->whereIn('slug', $catSlugs));
        }

        if ($request->boolean('in_stock')) {
            $query->whereHas('variants', fn (Builder $vq) => $vq->where('is_active', true)->whereNull('archived_at')->whereRaw('(stock_qty - reserved_qty) > 0'));
        }

        if ($request->filled('min_price')) {
            $minCents = (int) round((float) $request->query('min_price') * 100);
            $query->whereRaw('COALESCE(promo_price_cents, price_cents) >= ?', [$minCents]);
        }

        if ($request->filled('max_price')) {
            $maxCents = (int) round((float) $request->query('max_price') * 100);
            $query->whereRaw('COALESCE(promo_price_cents, price_cents) <= ?', [$maxCents]);
        }

        $sort = (string) $request->query('sort', 'featured');
        match ($sort) {
            'price_asc' => $query->orderByRaw('COALESCE(promo_price_cents, price_cents) ASC'),
            'price_desc' => $query->orderByRaw('COALESCE(promo_price_cents, price_cents) DESC'),
            'newest' => $query->orderByDesc('id'),
            'best_sellers' => $query->orderByDesc('sales_count')->orderByDesc('id'),
            'discount' => $query->orderByRaw('CASE WHEN promo_price_cents IS NOT NULL AND promo_price_cents < price_cents THEN (price_cents - promo_price_cents) * 100 / price_cents ELSE 0 END DESC'),
            default => $query->orderByDesc('is_featured')->orderByDesc('id'),
        };

        $perPage = max(1, min(48, (int) $request->query('per_page', 16)));
        $paginator = $query->with([
            'brand:id,name,slug',
            'categories:id,name,slug',
            'images',
            'attributeValues.attribute',
            'variants' => fn ($q) => $q->where('is_active', true)->whereNull('archived_at')->orderBy('sort_order')->orderBy('id')->with('attributeValues.attribute'),
        ])->paginate($perPage);

        $availableBrands = Brand::query()
            ->select(['id', 'name', 'slug'])
            ->where('is_active', true)
            ->whereHas('products', fn ($q) => $q->whereIn('products.id', $baseIds))
            ->withCount(['products' => fn ($q) => $q->whereIn('products.id', $baseIds)])
            ->orderBy('name')
            ->get();

        $availableCategories = Category::query()
            ->select(['id', 'name', 'slug', 'parent_id'])
            ->where('is_active', true)
            ->whereHas('products', fn ($q) => $q->whereIn('products.id', $baseIds))
            ->withCount(['products' => fn ($q) => $q->whereIn('products.id', $baseIds)])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        $attributeFacets = $this->attributes->getAttributesForCategory($category, $baseIds);

        return [
            'products' => $paginator->getCollection()->map(fn (Product $p): array => self::serializeProductCard($p))->values()->all(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
            'facets' => [
                'brands' => $availableBrands,
                'categories' => $availableCategories,
                'attributes' => $attributeFacets,
            ],
        ];
    }

    /** @return array<string, mixed> */
    public static function serializeProductCard(Product $product, int $maxInstallments = 3): array
    {
        $activeVariants = $product->variants
            ->where('is_active', true)
            ->whereNull('archived_at')
            ->values();
        $defaultVariant = $activeVariants->firstWhere('is_default', true) ?? $activeVariants->first();

        $effectivePrice = $defaultVariant ? $defaultVariant->effectivePriceCents() : $product->effectivePriceCents();
        $originalPrice = $defaultVariant ? $defaultVariant->price_cents : $product->price_cents;
        $discountPercent = ($originalPrice > 0 && $effectivePrice < $originalPrice)
            ? (int) round((($originalPrice - $effectivePrice) / $originalPrice) * 100)
            : 0;

        $totalAvailable = $activeVariants->sum(fn (ProductVariant $v): int => $v->availableStock());
        $primaryImg = $product->images->firstWhere('is_primary', true) ?? $product->images->first();

        $installmentsCount = $effectivePrice >= 450 ? $maxInstallments : 1;
        $installmentCents = $installmentsCount > 1 ? (int) round($effectivePrice / $installmentsCount) : $effectivePrice;

        $attrService = app(ProductAttributeService::class);
        $comparisonGroup = $product->relationLoaded('categories')
            ? $attrService->resolveComparisonGroup($product)
            : 'geral';
        $specs = ($product->relationLoaded('attributeValues') || $activeVariants->every(fn (ProductVariant $v): bool => $v->relationLoaded('attributeValues')))
            ? $attrService->extractComparableSpecs($product)
            : [];

        $wholesalePricing = app(WholesalePricingService::class);
        $wholesaleCondition = $wholesalePricing->calculateForProduct($product);

        return [
            'id' => $product->id,
            'name' => $product->name,
            'slug' => $product->slug,
            'sku' => $product->sku,
            'product_type' => $product->product_type->value,
            'has_variants' => $product->usesVariations(),
            'brand' => $product->brand ? ['id' => $product->brand->id, 'name' => $product->brand->name, 'slug' => $product->brand->slug] : null,
            'primary_image' => $primaryImg?->path,
            'primary_image_alt' => $primaryImg?->alt_text ?: $product->name,
            'price_cents' => $originalPrice,
            'effective_price_cents' => $effectivePrice,
            'discount_percent' => $discountPercent,
            'installments_count' => $installmentsCount,
            'installment_cents' => $installmentCents,
            'is_new_arrival' => $product->is_new_arrival,
            'is_featured' => $product->is_featured,
            'in_stock' => $totalAvailable > 0,
            'available_stock' => $totalAvailable,
            'default_variant_id' => $defaultVariant?->id,
            'has_multiple_variants' => $activeVariants->count() > 1,
            'comparison_group' => $comparisonGroup,
            'specs' => $specs,
            'wholesale_condition' => $wholesaleCondition,
        ];
    }

    /**
     * Builds storefront attribute selector axes strictly matching active non-archived variants.
     *
     * @param  Collection<int, ProductVariant>  $activeVariants
     * @return list<array<string, mixed>>
     */
    public static function buildVariationAxes(Product $product, Collection $activeVariants): array
    {
        $sellableSet = $activeVariants->filter(fn (ProductVariant $v): bool => $v->is_active && $v->archived_at === null)->values();
        if (! $product->usesVariations() && $sellableSet->count() <= 1) {
            return [];
        }
        if ($sellableSet->isEmpty()) {
            return [];
        }

        // Track option values actually used on active variants so archived options drop off cleanly
        $usedByAttrSlug = [];
        foreach ($sellableSet as $v) {
            if (is_array($v->option_values) && $v->option_values !== []) {
                foreach ($v->option_values as $opt) {
                    if (empty($opt['value'])) {
                        continue;
                    }
                    $aSlug = (string) ($opt['attribute_slug'] ?? Str::slug((string) ($opt['attribute_name'] ?? 'opcao')));
                    $vSlug = (string) ($opt['value_slug'] ?? Str::slug((string) $opt['value']));
                    $usedByAttrSlug[$aSlug][$vSlug] = [
                        'slug' => $vSlug,
                        'value' => (string) $opt['value'],
                        'color_hex' => $opt['color_hex'] ?? $v->color_hex,
                    ];
                }
            }
        }

        $declared = is_array($product->variation_attributes) ? $product->variation_attributes : [];
        if ($declared !== [] && $usedByAttrSlug !== []) {
            $axes = [];
            foreach ($declared as $axis) {
                if (empty($axis['name'])) {
                    continue;
                }
                $aSlug = (string) ($axis['slug'] ?? Str::slug((string) $axis['name']));
                $values = [];
                foreach (($axis['values'] ?? []) as $val) {
                    $vLabel = is_array($val) ? (string) ($val['value'] ?? '') : (string) $val;
                    $vSlug = is_array($val) ? (string) ($val['slug'] ?? Str::slug($vLabel)) : Str::slug($vLabel);
                    if ($vLabel === '' || ! isset($usedByAttrSlug[$aSlug][$vSlug])) {
                        continue;
                    }
                    $values[] = [
                        'slug' => $vSlug,
                        'value' => $vLabel,
                        'color_hex' => is_array($val) ? ($val['color_hex'] ?? null) : null,
                    ];
                }
                if ($values !== []) {
                    $axes[] = [
                        'slug' => $aSlug,
                        'name' => (string) $axis['name'],
                        'display_type' => (string) ($axis['display_type'] ?? ($aSlug === 'cor' ? 'color_swatch' : 'pill')),
                        'values' => $values,
                    ];
                }
            }
            if ($axes !== []) {
                return $axes;
            }
        }

        // Reconstruct from variant option_values / pivot attributeValues / variant names (supports legacy seeded data)
        if ($usedByAttrSlug !== []) {
            $axes = [];
            $firstSellable = $sellableSet->first();
            $firstOpts = is_array($firstSellable->option_values) ? $firstSellable->option_values : [];
            foreach ($firstOpts as $opt) {
                $aSlug = (string) ($opt['attribute_slug'] ?? Str::slug((string) ($opt['attribute_name'] ?? 'opcao')));
                if (! isset($usedByAttrSlug[$aSlug])) {
                    continue;
                }
                $axes[] = [
                    'slug' => $aSlug,
                    'name' => (string) ($opt['attribute_name'] ?? ucfirst($aSlug)),
                    'display_type' => $aSlug === 'cor' ? 'color_swatch' : 'pill',
                    'values' => array_values($usedByAttrSlug[$aSlug]),
                ];
            }
            if ($axes !== []) {
                return $axes;
            }
        }

        $attrBuckets = [];
        foreach ($sellableSet as $v) {
            foreach ($v->attributeValues as $av) {
                if (! $av->attribute) {
                    continue;
                }
                $aSlug = $av->attribute->slug;
                $attrBuckets[$aSlug]['name'] = $av->attribute->name;
                $attrBuckets[$aSlug]['display_type'] = $av->attribute->display_type;
                $attrBuckets[$aSlug]['values'][$av->slug] = [
                    'slug' => $av->slug,
                    'value' => $av->value,
                    'color_hex' => $av->color_hex ?: $v->color_hex,
                ];
            }
        }
        if ($attrBuckets !== []) {
            $out = [];
            foreach ($attrBuckets as $aSlug => $bucket) {
                $out[] = [
                    'slug' => (string) $aSlug,
                    'name' => (string) $bucket['name'],
                    'display_type' => (string) $bucket['display_type'],
                    'values' => array_values($bucket['values']),
                ];
            }

            return $out;
        }

        // Legacy fallback when variants only carry shade name/hex without attribute rows
        return [[
            'slug' => 'opcao',
            'name' => 'Opção',
            'display_type' => $sellableSet->contains(fn (ProductVariant $v): bool => ! empty($v->color_hex)) ? 'color_swatch' : 'pill',
            'values' => $sellableSet->map(fn (ProductVariant $v): array => [
                'slug' => Str::slug($v->name) ?: (string) $v->id,
                'value' => $v->name,
                'color_hex' => $v->color_hex,
            ])->values()->all(),
        ]];
    }

    /** @return array<string, mixed> */
    public static function serializeVariant(ProductVariant $variant): array
    {
        $attrColorHex = $variant->attributeValues->first(fn ($av): bool => ! empty($av->color_hex))?->color_hex;

        return [
            'id' => $variant->id,
            'sku' => $variant->sku,
            'gtin' => $variant->gtin,
            'name' => $variant->name,
            'option_values' => $variant->option_values ?? [],
            'variant_signature' => $variant->variant_signature,
            'shade_code' => $variant->shade_code,
            'color_family' => $variant->color_family,
            'color_hex' => $variant->color_hex ?: $attrColorHex,
            'swatch_image_path' => $variant->swatch_image_path,
            'sort_order' => $variant->sort_order,
            'price_cents' => $variant->price_cents,
            'promo_price_cents' => $variant->promo_price_cents,
            'effective_price_cents' => $variant->effectivePriceCents(),
            'weight_grams' => $variant->effectiveWeightGrams(),
            'stock_qty' => $variant->stock_qty,
            'available_stock' => $variant->availableStock(),
            'in_stock' => $variant->availableStock() > 0,
            'is_default' => $variant->is_default,
            'image_path' => $variant->effectiveImagePath(),
            'waiting_restock_count' => (int) ($variant->getAttribute('pending_restock_count') ?? 0),
            'attributes' => $variant->attributeValues->map(fn ($av): array => [
                'attribute_id' => $av->attribute_id,
                'attribute_slug' => $av->attribute->slug,
                'attribute_name' => $av->attribute->name,
                'display_type' => $av->attribute->display_type,
                'value_id' => $av->id,
                'value' => $av->value,
                'value_slug' => $av->slug,
                'color_hex' => $av->color_hex,
            ])->values()->all(),
        ];
    }

    public function wholesaleCatalog(Request $request): JsonResponse
    {
        /** @var WholesalePricingService $pricingService */
        $pricingService = app(WholesalePricingService::class);
        $rules = $pricingService->resolveActiveRules($request->user());

        $query = Product::query()->where('is_active', true);

        // If rules have explicit inclusions, filter by them
        $hasGeneralRule = $rules->contains(fn ($r) => $r->ruleProducts->where('is_excluded', false)->isEmpty());
        if (! $hasGeneralRule && $rules->isNotEmpty()) {
            $allowedProductIds = collect();
            $allowedCategoryIds = collect();
            $allowedGroupIds = collect();

            foreach ($rules as $r) {
                foreach ($r->ruleProducts->where('is_excluded', false) as $rp) {
                    if ($rp->product_id) {
                        $allowedProductIds->push($rp->product_id);
                    }
                    if ($rp->category_id) {
                        $allowedCategoryIds->push($rp->category_id);
                    }
                    if ($rp->wholesale_group_id) {
                        $allowedGroupIds->push($rp->wholesale_group_id);
                    }
                }
            }

            $query->where(function ($q) use ($allowedProductIds, $allowedCategoryIds, $allowedGroupIds): void {
                if ($allowedProductIds->isNotEmpty()) {
                    $q->orWhereIn('id', $allowedProductIds);
                }
                if ($allowedCategoryIds->isNotEmpty()) {
                    $q->orWhereHas('categories', fn ($cq) => $cq->whereIn('categories.id', $allowedCategoryIds));
                }
                if ($allowedGroupIds->isNotEmpty()) {
                    $q->orWhereHas('wholesaleGroupItems', fn ($gq) => $gq->whereIn('wholesale_group_id', $allowedGroupIds));
                }
            });
        }

        $result = $this->applyProductFiltersAndPaginate($request, $query);

        return response()->json([
            'data' => [
                'products' => $result['products'],
                'meta' => $result['meta'],
                'facets' => $result['facets'],
                'active_rules_count' => $rules->count(),
            ],
        ]);
    }

    public function requestWholesaleAccount(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:190',
            'phone' => 'nullable|string|max:30',
            'cnpj_cpf' => 'nullable|string|max:30',
            'company_name' => 'nullable|string|max:160',
            'trade_name' => 'nullable|string|max:160',
            'state_registration' => 'nullable|string|max:40',
            'notes' => 'nullable|string|max:1000',
        ]);

        /** @var WholesaleResellerService $resellerService */
        $resellerService = app(WholesaleResellerService::class);
        $member = $resellerService->requestRegistration($validated, $request->user());

        return response()->json([
            'message' => 'Solicitação de cadastro de atacado enviada com sucesso! Nossa equipe analisará e responderá em breve.',
            'data' => [
                'id' => $member->id,
                'status' => $member->status,
                'requested_at' => $member->requested_at?->toIso8601String(),
            ],
        ], 201);
    }
}
