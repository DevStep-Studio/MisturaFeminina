<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Admin\Services\TodayWorkService;
use App\Domain\Catalog\Services\CatalogBulkRuleService;
use App\Domain\Catalog\Services\CatalogCsvService;
use App\Domain\Catalog\Services\CatalogLifecycleService;
use App\Domain\Catalog\Services\CategoryHierarchyService;
use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Catalog\Services\ProductVariationsSyncService;
use App\Domain\Catalog\Services\ReplenishmentService;
use App\Domain\Catalog\Services\RestockNotificationService;
use App\Domain\Security\Services\AuditLogger;
use App\Domain\Shared\Enums\InventoryMovementType;
use App\Domain\Shared\Enums\ProductType;
use App\Domain\Wholesale\Services\WholesalePricingService;
use App\Http\Controllers\Controller;
use App\Http\Controllers\SeoController;
use App\Models\Attribute;
use App\Models\AttributeValue;
use App\Models\Brand;
use App\Models\BulkEditBatch;
use App\Models\Category;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\RestockRequest;
use App\Models\Review;
use App\Models\SlugRedirect;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class AdminCatalogController extends Controller
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly CatalogCsvService $csv,
        private readonly AuditLogger $audit,
        private readonly RestockNotificationService $restock,
        private readonly ReplenishmentService $replenishment,
        private readonly TodayWorkService $todayWork,
        private readonly CatalogBulkRuleService $bulkRules,
        private readonly CatalogLifecycleService $lifecycle,
        private readonly ProductVariationsSyncService $variationsSync,
        private readonly CategoryHierarchyService $categoryHierarchy,
    ) {}

    public function indexProducts(Request $request): JsonResponse
    {
        $filter = (string) $request->query('filter', '');
        $filters = [
            'filter' => $filter,
            'search' => $request->query('search'),
            'brand_id' => $request->query('brand_id'),
            'category_id' => $request->query('category_id'),
            'status' => $request->query('status', 'all'),
            'availability' => $request->query('availability', 'all'),
            'cost_status' => $request->query('cost_status'),
            'is_active' => $request->query('is_active'),
        ];

        if ($filter === 'needs_review') {
            $query = $this->todayWork->reviewProductsQuery();
            if ($request->filled('search')) {
                $term = '%'.trim((string) $request->query('search')).'%';
                $query->where(fn ($q) => $q->where('name', 'like', $term)
                    ->orWhere('sku', 'like', $term)
                    ->orWhere('gtin', 'like', $term)
                    ->orWhereHas('variants', fn ($vq) => $vq->where('sku', 'like', $term)->orWhere('gtin', 'like', $term)));
            }
            if ($request->filled('brand_id')) {
                $query->where('brand_id', (int) $request->query('brand_id'));
            }
            if ($request->filled('category_id')) {
                $catId = (int) $request->query('category_id');
                $catIds = $this->categoryHierarchy->getDescendantIds($catId);
                $query->whereHas('categories', fn ($cq) => $cq->whereIn('categories.id', $catIds));
            }
        } else {
            $query = $this->bulkRules->buildFilteredProductsQuery($filters);
        }

        $query->with([
            'brand:id,name',
            'categories:id,name',
            'images',
            'variants' => fn ($vq) => $vq->orderBy('sort_order')->orderBy('id'),
            'attributeValues:id,value',
        ]);

        $sort = (string) $request->query('sort', 'newest');
        match ($sort) {
            'oldest' => $query->orderBy('id'),
            'name_asc' => $query->orderBy('name')->orderBy('id'),
            'name_desc' => $query->orderByDesc('name')->orderByDesc('id'),
            'price_asc' => $query->orderBy('price_cents')->orderBy('id'),
            'price_desc' => $query->orderByDesc('price_cents')->orderByDesc('id'),
            'stock_asc' => $query->withSum('variants as total_stock_sum', 'stock_qty')->orderBy('total_stock_sum')->orderBy('id'),
            'stock_desc' => $query->withSum('variants as total_stock_sum', 'stock_qty')->orderByDesc('total_stock_sum')->orderByDesc('id'),
            default => $query->latest('id'),
        };

        $perPage = min(100, max(10, (int) $request->query('per_page', 25)));
        $canViewCost = $request->user()?->hasPermission('catalog.cost.view') ?? false;
        $paginator = $query->paginate($perPage);

        $paginator->through(function (Product $product) use ($canViewCost): array {
            $allVariants = $product->variants;
            $variants = $allVariants->filter(fn (ProductVariant $v): bool => $v->archived_at === null)->values();
            $prices = $variants->isNotEmpty()
                ? $variants->pluck('price_cents')->all()
                : [$product->price_cents];
            $effectivePrices = $variants->isNotEmpty()
                ? $variants->map(function (ProductVariant $v): int {
                    $promo = $v->promo_price_cents;

                    return ($promo !== null && $promo > 0 && $promo < $v->price_cents) ? $promo : $v->price_cents;
                })->all()
                : [(($product->promo_price_cents && $product->promo_price_cents < $product->price_cents) ? $product->promo_price_cents : $product->price_cents)];

            $totalStock = (int) $variants->sum('stock_qty');
            $totalReserved = (int) $variants->sum('reserved_qty');
            $totalAvailable = (int) $variants->sum(fn (ProductVariant $v): int => max(0, $v->stock_qty - $v->reserved_qty));
            $outOfStockCount = (int) $variants->filter(fn (ProductVariant $v): bool => ($v->stock_qty - $v->reserved_qty) <= 0)->count();

            if ($canViewCost) {
                $product->makeVisible('cost_cents');
                $allVariants->each(fn (ProductVariant $v) => $v->makeVisible('cost_cents'));
            }

            $payload = $product->toArray();
            $payload['is_archived'] = $product->trashed();
            $payload['has_variants'] = $product->usesVariations();
            $payload['archived_variants_count'] = $allVariants->count() - $variants->count();
            foreach ($allVariants as $vIdx => $vModel) {
                if (isset($payload['variants'][$vIdx])) {
                    $payload['variants'][$vIdx]['is_archived'] = $vModel->isArchived();
                    $payload['variants'][$vIdx]['archived_at'] = $vModel->archived_at?->toIso8601String();
                    $payload['variants'][$vIdx]['effective_image_path'] = $vModel->effectiveImagePath();
                }
            }

            $variantSummary = [
                'count' => $variants->count(),
                'is_multi_variant' => $variants->count() > 1 || ($product->usesVariations() && $variants->isNotEmpty()),
                'price_min_cents' => $prices !== [] ? min($prices) : $product->price_cents,
                'price_max_cents' => $prices !== [] ? max($prices) : $product->price_cents,
                'effective_min_cents' => $effectivePrices !== [] ? min($effectivePrices) : $product->price_cents,
                'effective_max_cents' => $effectivePrices !== [] ? max($effectivePrices) : $product->price_cents,
                'total_stock' => $totalStock,
                'total_reserved' => $totalReserved,
                'total_available' => $totalAvailable,
                'out_of_stock_count' => $outOfStockCount,
                'has_promo' => $variants->contains(fn (ProductVariant $v): bool => $v->promo_price_cents !== null && $v->promo_price_cents > 0 && $v->promo_price_cents < $v->price_cents)
                    || ($product->promo_price_cents !== null && $product->promo_price_cents > 0 && $product->promo_price_cents < $product->price_cents),
            ];

            if ($canViewCost) {
                $resolvedCosts = $variants->isNotEmpty()
                    ? $variants->map(fn (ProductVariant $v): ?int => $v->cost_cents ?? $product->cost_cents)->filter(fn (?int $c): bool => $c !== null)->values()->all()
                    : ($product->cost_cents !== null ? [$product->cost_cents] : []);
                $missingCostCount = $variants->isNotEmpty()
                    ? $variants->filter(fn (ProductVariant $v): bool => ($v->cost_cents ?? $product->cost_cents) === null)->count()
                    : ($product->cost_cents === null ? 1 : 0);
                $variantSummary['missing_cost_count'] = $missingCostCount;
                $variantSummary['cost_min_cents'] = $resolvedCosts !== [] ? min($resolvedCosts) : null;
                $variantSummary['cost_max_cents'] = $resolvedCosts !== [] ? max($resolvedCosts) : null;

                foreach ($allVariants as $idx => $vModel) {
                    if (isset($payload['variants'][$idx])) {
                        $payload['variants'][$idx]['effective_cost_cents'] = $vModel->cost_cents ?? $product->cost_cents;
                    }
                }
            }

            $payload['variants_summary'] = $variantSummary;

            return $payload;
        });

        return response()->json($paginator);
    }

    public function showProduct(Request $request, int $id): JsonResponse
    {
        $product = Product::withTrashed()
            ->with([
                'brand',
                'categories',
                'images',
                'attributeValues.attribute',
                'variants' => fn ($q) => $q->with(['attributeValues.attribute', 'image'])
                    ->withCount(['restockRequests as pending_restock_count' => fn ($rq) => $rq->where('status', 'pending')])
                    ->orderBy('sort_order')
                    ->orderBy('id'),
                'kitItems.componentVariant.product',
            ])
            ->findOrFail($id);

        $canViewCost = $request->user()?->hasPermission('catalog.cost.view') ?? false;
        if ($canViewCost) {
            $product->makeVisible('cost_cents');
            $product->variants->each(fn (ProductVariant $v) => $v->makeVisible('cost_cents'));
        }

        $payload = $product->toArray();
        if (isset($payload['variants'])) {
            foreach ($product->variants->values() as $idx => $v) {
                if ($canViewCost) {
                    $payload['variants'][$idx]['effective_cost_cents'] = $v->effectiveCostCents();
                }
                $payload['variants'][$idx]['is_archived'] = $v->isArchived();
                $payload['variants'][$idx]['archived_at'] = $v->archived_at?->toIso8601String();
                $payload['variants'][$idx]['effective_image_path'] = $v->effectiveImagePath();
                $payload['variants'][$idx]['links'] = $this->variationsSync->inspectVariantLinks($v);
            }
        }
        $payload['is_archived'] = $product->trashed();
        $payload['has_variants'] = $product->usesVariations();
        $payload['variation_attributes'] = $product->variation_attributes ?? [];
        $payload['links'] = $this->lifecycle->inspectLinks($product);
        $payload['wholesale_condition'] = app(WholesalePricingService::class)->calculateForProduct($product);

        return response()->json(['data' => $payload]);
    }

    public function storeProduct(Request $request): JsonResponse
    {
        $actor = $request->user();
        $idempotencyKey = trim((string) ($request->header('X-Idempotency-Key') ?: $request->input('idempotency_key', '')));
        $idemCacheKey = $idempotencyKey !== '' && $actor
            ? 'mf:catalog:store:idem:'.$actor->id.':'.sha1($idempotencyKey)
            : null;
        if ($idemCacheKey !== null) {
            $existingId = Cache::get($idemCacheKey);
            if (is_int($existingId)) {
                $existingProd = Product::withTrashed()
                    ->with(['brand', 'categories', 'images', 'attributeValues.attribute', 'variants'])
                    ->find($existingId);
                if ($existingProd) {
                    if ($actor->hasPermission('catalog.cost.write')) {
                        $existingProd->makeVisible('cost_cents');
                        $existingProd->variants->each(fn (ProductVariant $v) => $v->makeVisible('cost_cents'));
                    }

                    return response()->json(['data' => $existingProd, 'idempotent_replay' => true], 200);
                }
            }
        }

        $validated = $this->validateProduct($request);
        $canWriteCost = $actor?->hasPermission('catalog.cost.write') ?? false;
        if (! $canWriteCost && (
            (array_key_exists('cost_cents', $validated) && $validated['cost_cents'] !== null)
            || collect($validated['variants'] ?? [])->contains(fn (array $v): bool => array_key_exists('cost_cents', $v) && $v['cost_cents'] !== null)
        )) {
            return response()->json(['message' => 'Você não possui permissão para definir custos de mercadoria.'], 403);
        }

        $this->variationsSync->validateBeforePersist(null, $validated);

        $product = DB::transaction(function () use ($validated, $actor, $canWriteCost): Product {
            $slug = Str::slug((string) ($validated['slug'] ?? $validated['name']));
            if (Product::withTrashed()->where('slug', $slug)->exists()) {
                $slug .= '-'.strtolower(Str::random(4));
            }

            $product = Product::query()->create([
                'brand_id' => $validated['brand_id'] ?? null,
                'name' => $validated['name'],
                'slug' => $slug,
                'sku' => $validated['sku'],
                'gtin' => $validated['gtin'] ?? null,
                'supplier_code' => $validated['supplier_code'] ?? null,
                'power_watts' => $validated['power_watts'] ?? null,
                'manufacturer' => $validated['manufacturer'] ?? null,
                'short_description' => $validated['short_description'] ?? null,
                'description' => $validated['description'] ?? null,
                'ingredients' => $validated['ingredients'] ?? null,
                'usage_instructions' => $validated['usage_instructions'] ?? null,
                'product_type' => $validated['product_type'] ?? ProductType::Simple->value,
                'cost_cents' => ($canWriteCost && array_key_exists('cost_cents', $validated)) ? $validated['cost_cents'] : null,
                'price_cents' => $validated['price_cents'],
                'promo_price_cents' => $validated['promo_price_cents'] ?? null,
                'promo_starts_at' => $validated['promo_starts_at'] ?? null,
                'promo_ends_at' => $validated['promo_ends_at'] ?? null,
                'unit_label' => $validated['unit_label'] ?? null,
                'unit_quantity' => $validated['unit_quantity'] ?? null,
                'weight_grams' => $validated['weight_grams'] ?? 200,
                'width_cm' => $validated['width_cm'] ?? 11,
                'height_cm' => $validated['height_cm'] ?? 6,
                'length_cm' => $validated['length_cm'] ?? 16,
                'video_url' => $validated['video_url'] ?? null,
                'tags' => $validated['tags'] ?? [],
                'is_active' => (bool) ($validated['is_active'] ?? true),
                'is_featured' => (bool) ($validated['is_featured'] ?? false),
                'is_new_arrival' => (bool) ($validated['is_new_arrival'] ?? false),
                'is_best_seller' => (bool) ($validated['is_best_seller'] ?? false),
                'wholesale_enabled' => (bool) ($validated['wholesale_enabled'] ?? false),
                'wholesale_group_variants' => (bool) ($validated['wholesale_group_variants'] ?? true),
                'wholesale_tiers' => $validated['wholesale_tiers'] ?? null,
                'seo_title' => $validated['seo_title'] ?? $validated['name'],
                'seo_description' => $validated['seo_description'] ?? $validated['short_description'] ?? null,
            ]);

            if (! empty($validated['category_ids']) || ! empty($validated['primary_category_id'])) {
                $this->categoryHierarchy->syncProductCategories(
                    $product,
                    array_map('intval', $validated['category_ids'] ?? []),
                    ! empty($validated['primary_category_id']) ? (int) $validated['primary_category_id'] : null
                );
            }
            if (array_key_exists('product_attribute_value_ids', $validated)) {
                $product->attributeValues()->sync($validated['product_attribute_value_ids'] ?? []);
            }

            $this->syncImagesAndVariants($product, $validated, false, $actor);

            return $product;
        });

        $this->audit->record('catalog.product_created', $request->user(), 'product', $product->id, null, ['sku' => $product->sku, 'name' => $product->name], $request);
        $this->bulkRules->flushStorefrontCaches();

        $fresh = $product->fresh(['brand', 'categories', 'images', 'attributeValues.attribute', 'variants']);
        if ($fresh && $canWriteCost) {
            $fresh->makeVisible('cost_cents');
            $fresh->variants->each(fn (ProductVariant $v) => $v->makeVisible('cost_cents'));
        }
        if ($idemCacheKey !== null) {
            Cache::put($idemCacheKey, $product->id, 600);
        }

        return response()->json(['data' => $fresh], 201);
    }

    public function updateProduct(Request $request, int $id): JsonResponse
    {
        $product = Product::withTrashed()->with('variants')->findOrFail($id);
        $validated = $this->validateProduct($request, $product->id);

        $actor = $request->user();
        $this->variationsSync->validateBeforePersist($product, $validated);
        $canWriteCost = $actor?->hasPermission('catalog.cost.write') ?? false;
        $variantsById = $product->variants->keyBy('id');
        $attemptedVariantCostChange = collect($validated['variants'] ?? [])->contains(function (array $v) use ($variantsById): bool {
            if (! array_key_exists('cost_cents', $v)) {
                return false;
            }
            $existing = ! empty($v['id']) ? $variantsById->get((int) $v['id']) : null;

            return $existing ? $v['cost_cents'] !== $existing->cost_cents : $v['cost_cents'] !== null;
        });
        if (! $canWriteCost && ((array_key_exists('cost_cents', $validated) && $validated['cost_cents'] !== $product->cost_cents) || $attemptedVariantCostChange)) {
            return response()->json(['message' => 'Você não possui permissão para alterar custos de mercadoria.'], 403);
        }

        $oldSlug = $product->slug;
        $newSlug = ! empty($validated['slug']) ? Str::slug((string) $validated['slug']) : $oldSlug;

        DB::transaction(function () use ($product, $validated, $oldSlug, $newSlug, $actor, $canWriteCost): void {
            if ($newSlug !== $oldSlug && ! Product::query()->where('slug', $newSlug)->where('id', '!=', $product->id)->exists()) {
                SlugRedirect::query()->updateOrCreate(
                    ['entity_type' => 'product', 'old_slug' => $oldSlug],
                    ['new_slug' => $newSlug]
                );
            } else {
                $newSlug = $oldSlug;
            }

            $product->update([
                'brand_id' => array_key_exists('brand_id', $validated) ? $validated['brand_id'] : $product->brand_id,
                'name' => $validated['name'],
                'slug' => $newSlug,
                'sku' => $validated['sku'],
                'gtin' => $validated['gtin'] ?? null,
                'supplier_code' => array_key_exists('supplier_code', $validated) ? $validated['supplier_code'] : $product->supplier_code,
                'power_watts' => array_key_exists('power_watts', $validated) ? $validated['power_watts'] : $product->power_watts,
                'manufacturer' => $validated['manufacturer'] ?? null,
                'short_description' => $validated['short_description'] ?? null,
                'description' => $validated['description'] ?? null,
                'ingredients' => $validated['ingredients'] ?? null,
                'usage_instructions' => $validated['usage_instructions'] ?? null,
                'product_type' => $validated['product_type'] ?? $product->product_type->value,
                'cost_cents' => ($canWriteCost && array_key_exists('cost_cents', $validated)) ? $validated['cost_cents'] : $product->cost_cents,
                'price_cents' => $validated['price_cents'],
                'promo_price_cents' => $validated['promo_price_cents'] ?? null,
                'promo_starts_at' => $validated['promo_starts_at'] ?? null,
                'promo_ends_at' => $validated['promo_ends_at'] ?? null,
                'unit_label' => $validated['unit_label'] ?? null,
                'unit_quantity' => $validated['unit_quantity'] ?? null,
                'weight_grams' => $validated['weight_grams'] ?? $product->weight_grams,
                'width_cm' => $validated['width_cm'] ?? $product->width_cm,
                'height_cm' => $validated['height_cm'] ?? $product->height_cm,
                'length_cm' => $validated['length_cm'] ?? $product->length_cm,
                'video_url' => $validated['video_url'] ?? null,
                'tags' => $validated['tags'] ?? $product->tags,
                'is_active' => (bool) ($validated['is_active'] ?? $product->is_active),
                'is_featured' => (bool) ($validated['is_featured'] ?? $product->is_featured),
                'is_new_arrival' => (bool) ($validated['is_new_arrival'] ?? $product->is_new_arrival),
                'is_best_seller' => (bool) ($validated['is_best_seller'] ?? $product->is_best_seller),
                'wholesale_enabled' => (bool) ($validated['wholesale_enabled'] ?? $product->wholesale_enabled),
                'wholesale_group_variants' => array_key_exists('wholesale_group_variants', $validated)
                    ? (bool) $validated['wholesale_group_variants']
                    : $product->wholesale_group_variants,
                'wholesale_tiers' => $validated['wholesale_tiers'] ?? $product->wholesale_tiers,
                'seo_title' => $validated['seo_title'] ?? $validated['name'],
                'seo_description' => $validated['seo_description'] ?? null,
            ]);

            if (array_key_exists('category_ids', $validated) || array_key_exists('primary_category_id', $validated)) {
                $this->categoryHierarchy->syncProductCategories(
                    $product,
                    array_map('intval', $validated['category_ids'] ?? $product->categories()->pluck('categories.id')->all()),
                    ! empty($validated['primary_category_id']) ? (int) $validated['primary_category_id'] : null
                );
            }
            if (array_key_exists('product_attribute_value_ids', $validated)) {
                $product->attributeValues()->sync($validated['product_attribute_value_ids'] ?? []);
            }

            $this->syncImagesAndVariants($product, $validated, true, $actor);
        });

        $this->audit->record('catalog.product_updated', $request->user(), 'product', $product->id, null, ['name' => $product->name], $request);
        $this->bulkRules->flushStorefrontCaches();

        $fresh = $product->fresh(['brand', 'categories', 'images', 'attributeValues.attribute', 'variants']);
        if ($fresh && $actor?->hasPermission('catalog.cost.view')) {
            $fresh->makeVisible('cost_cents');
            $fresh->variants->each(fn (ProductVariant $v) => $v->makeVisible('cost_cents'));
        }

        return response()->json(['data' => $fresh]);
    }

    public function destroyProduct(Request $request, int $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);
        $product->update(['is_active' => false]);
        $product->delete();
        $this->audit->record('catalog.product_archived', $request->user(), 'product', $product->id, null, ['sku' => $product->sku], $request);
        $this->bulkRules->flushStorefrontCaches();

        return response()->json(['message' => 'Produto arquivado com sucesso.']);
    }

    public function productLinks(int $id): JsonResponse
    {
        $product = Product::withTrashed()->with('variants')->findOrFail($id);
        $links = $this->lifecycle->inspectLinks($product);

        return response()->json([
            'data' => array_merge($links, [
                'product_id' => $product->id,
                'name' => $product->name,
                'sku' => $product->sku,
                'variants_count' => $product->variants->count(),
            ]),
        ]);
    }

    public function archiveProduct(Request $request, int $id): JsonResponse
    {
        $product = Product::withTrashed()->findOrFail($id);
        if (! $product->trashed()) {
            $product->update(['is_active' => false]);
            $product->delete();
        }
        $this->audit->record('catalog.product_archived', $request->user(), 'product', $product->id, null, ['sku' => $product->sku], $request);
        $this->bulkRules->flushStorefrontCaches();

        return response()->json(['message' => 'Produto arquivado com segurança.', 'data' => $product->fresh()]);
    }

    public function restoreProduct(Request $request, int $id): JsonResponse
    {
        $product = Product::onlyTrashed()->findOrFail($id);
        $activate = $request->boolean('activate', true);
        $product->restore();
        if ($activate) {
            $product->update(['is_active' => true]);
        }
        $this->audit->record('catalog.product_restored', $request->user(), 'product', $product->id, null, ['sku' => $product->sku, 'is_active' => $product->is_active], $request);
        $this->bulkRules->flushStorefrontCaches();

        return response()->json(['message' => 'Produto restaurado com sucesso.', 'data' => $product->fresh()]);
    }

    public function forceDestroyProduct(Request $request, int $id): JsonResponse
    {
        $product = Product::withTrashed()->with('variants')->findOrFail($id);
        $links = $this->lifecycle->inspectLinks($product);
        if (! $links['can_delete']) {
            return response()->json([
                'message' => $links['impediment_reason'],
                'links' => $links,
                'can_archive' => true,
            ], 409);
        }

        $skuSnap = $product->sku;
        $nameSnap = $product->name;
        DB::transaction(function () use ($product): void {
            $product->categories()->detach();
            $product->attributeValues()->detach();
            $product->wholesaleGroupItems()->delete();
            $product->wholesaleRuleProducts()->delete();
            $product->variants()->delete();
            $product->images()->delete();
            $product->forceDelete();
        });

        $this->audit->record('catalog.product_deleted_permanently', $request->user(), 'product', $id, ['name' => $nameSnap, 'sku' => $skuSnap], null, $request);
        $this->bulkRules->flushStorefrontCaches();

        return response()->json(['message' => 'Produto excluído permanentemente.']);
    }

    public function quickUpdatePrice(Request $request, int $id): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        if (! $actor->hasPermission('catalog.pricing') && ! $actor->hasPermission('catalog.write')) {
            return response()->json(['message' => 'Você não possui permissão para alterar preços comerciais.'], 403);
        }

        $validated = $request->validate([
            'price_cents' => ['required', 'integer', 'min:1'],
            'promo_price_cents' => ['nullable', 'integer', 'min:1'],
            'clear_promo' => ['boolean'],
            'apply_to_variants' => ['boolean'],
            'expected_updated_at' => ['nullable', 'string', 'max:60'],
        ]);

        $promoCents = ! empty($validated['clear_promo']) ? null : ($validated['promo_price_cents'] ?? null);
        if ($promoCents !== null && $promoCents >= (int) $validated['price_cents']) {
            return response()->json(['message' => 'O preço promocional deve ser menor que o preço de venda.'], 422);
        }

        $product = Product::query()->with('variants')->findOrFail($id);

        if (! empty($validated['expected_updated_at']) && $product->updated_at && $product->updated_at->toIso8601String() !== $validated['expected_updated_at']) {
            return response()->json([
                'message' => 'Este produto foi atualizado por outro operador após a abertura.',
                'conflict' => [
                    'current_price_cents' => $product->price_cents,
                    'current_promo_price_cents' => $product->promo_price_cents,
                    'updated_at' => $product->updated_at->toIso8601String(),
                ],
            ], 409);
        }

        if ($product->variants->count() > 1 && empty($validated['apply_to_variants'])) {
            return response()->json(['message' => 'Produto possui múltiplas variações: edite o preço diretamente na variação ou confirme aplicar em todas.'], 422);
        }

        $oldPrice = $product->price_cents;
        $oldPromo = $product->promo_price_cents;

        DB::transaction(function () use ($product, $validated, $promoCents): void {
            $product->update([
                'price_cents' => (int) $validated['price_cents'],
                'promo_price_cents' => $promoCents,
            ]);
            foreach ($product->variants as $v) {
                $v->update([
                    'price_cents' => (int) $validated['price_cents'],
                    'promo_price_cents' => $promoCents,
                ]);
            }
        });

        $this->audit->record('catalog.quick_price_updated', $actor, 'product', $product->id, ['price_cents' => $oldPrice, 'promo_price_cents' => $oldPromo], ['price_cents' => (int) $validated['price_cents'], 'promo_price_cents' => $promoCents], $request);
        $this->bulkRules->flushStorefrontCaches();

        return response()->json(['data' => $product->fresh(['variants'])]);
    }

    public function quickUpdateVariantPrice(Request $request, int $variantId): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        if (! $actor->hasPermission('catalog.pricing') && ! $actor->hasPermission('catalog.write')) {
            return response()->json(['message' => 'Você não possui permissão para alterar preços comerciais.'], 403);
        }

        $validated = $request->validate([
            'price_cents' => ['required', 'integer', 'min:1'],
            'promo_price_cents' => ['nullable', 'integer', 'min:1'],
            'clear_promo' => ['boolean'],
            'expected_updated_at' => ['nullable', 'string', 'max:60'],
        ]);

        $promoCents = ! empty($validated['clear_promo']) ? null : ($validated['promo_price_cents'] ?? null);
        if ($promoCents !== null && $promoCents >= (int) $validated['price_cents']) {
            return response()->json(['message' => 'O preço promocional deve ser menor que o preço de venda.'], 422);
        }

        $variant = ProductVariant::query()->with('product.variants')->findOrFail($variantId);

        if (! empty($validated['expected_updated_at']) && $variant->updated_at && $variant->updated_at->toIso8601String() !== $validated['expected_updated_at']) {
            return response()->json([
                'message' => 'Esta variação foi atualizada por outro operador após a abertura.',
                'conflict' => [
                    'current_price_cents' => $variant->price_cents,
                    'current_promo_price_cents' => $variant->promo_price_cents,
                    'updated_at' => $variant->updated_at->toIso8601String(),
                ],
            ], 409);
        }

        $oldPrice = $variant->price_cents;
        $oldPromo = $variant->promo_price_cents;

        DB::transaction(function () use ($variant, $validated, $promoCents): void {
            $variant->update([
                'price_cents' => (int) $validated['price_cents'],
                'promo_price_cents' => $promoCents,
            ]);

            $product = $variant->product;
            if ($product && ($product->variants->count() <= 1 || $variant->is_default)) {
                $product->update([
                    'price_cents' => (int) $validated['price_cents'],
                    'promo_price_cents' => $promoCents,
                ]);
            }
        });

        $this->audit->record('catalog.variant_quick_price_updated', $actor, 'product_variant', $variant->id, ['price_cents' => $oldPrice, 'promo_price_cents' => $oldPromo], ['price_cents' => (int) $validated['price_cents'], 'promo_price_cents' => $promoCents], $request);
        $this->bulkRules->flushStorefrontCaches();

        return response()->json(['data' => $variant->fresh('product.variants')]);
    }

    public function adjustStock(Request $request, int $variantId): JsonResponse
    {
        $validated = $request->validate([
            'qty_delta' => ['required_without:operation', 'integer', 'not_in:0'],
            'operation' => ['nullable', Rule::in(['set', 'add', 'subtract'])],
            'quantity' => ['required_with:operation', 'integer', 'min:0'],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'reference' => ['nullable', 'string', 'max:120'],
            'expected_stock_qty' => ['nullable', 'integer', 'min:0'],
            'expected_updated_at' => ['nullable', 'string', 'max:60'],
        ]);

        $variant = ProductVariant::query()->findOrFail($variantId);

        if (array_key_exists('expected_stock_qty', $validated) && $validated['expected_stock_qty'] !== null && (int) $validated['expected_stock_qty'] !== $variant->stock_qty) {
            return response()->json([
                'message' => "O saldo mudou de {$validated['expected_stock_qty']} para {$variant->stock_qty} un. enquanto a janela estava aberta. Revise antes de gravar.",
                'conflict' => [
                    'variant_id' => $variant->id,
                    'sku' => $variant->sku,
                    'expected_stock_qty' => (int) $validated['expected_stock_qty'],
                    'current_stock_qty' => $variant->stock_qty,
                    'current_reserved_qty' => $variant->reserved_qty,
                    'current_available_qty' => $variant->availableStock(),
                    'updated_at' => $variant->updated_at?->toIso8601String(),
                ],
            ], 409);
        }

        if (! empty($validated['expected_updated_at']) && $variant->updated_at && $variant->updated_at->toIso8601String() !== $validated['expected_updated_at']) {
            return response()->json([
                'message' => 'A variação foi modificada concorrentemente após a abertura do ajuste.',
                'conflict' => [
                    'variant_id' => $variant->id,
                    'sku' => $variant->sku,
                    'current_stock_qty' => $variant->stock_qty,
                    'current_reserved_qty' => $variant->reserved_qty,
                    'current_available_qty' => $variant->availableStock(),
                    'updated_at' => $variant->updated_at->toIso8601String(),
                ],
            ], 409);
        }

        if (! empty($validated['operation'])) {
            $op = (string) $validated['operation'];
            $qty = (int) $validated['quantity'];
            $qtyDelta = match ($op) {
                'set' => $qty - $variant->stock_qty,
                'add' => abs($qty),
                'subtract' => -abs($qty),
            };
            if ($qtyDelta === 0) {
                return response()->json(['data' => $variant->fresh()]);
            }
            $type = match ($op) {
                'add' => InventoryMovementType::In,
                'subtract' => InventoryMovementType::Out,
                default => InventoryMovementType::Adjustment,
            };
        } else {
            $qtyDelta = (int) $validated['qty_delta'];
            $type = $qtyDelta > 0
                ? InventoryMovementType::In
                : InventoryMovementType::Adjustment;
        }

        $updated = $this->inventory->adjustStock(
            $variant,
            $qtyDelta,
            $type,
            $request->user(),
            $validated['reason'],
            $validated['reference'] ?? null,
        );

        $this->audit->record('inventory.adjusted', $request->user(), 'product_variant', $updated->id, null, [
            'sku' => $updated->sku,
            'qty_delta' => $qtyDelta,
            'stock_after' => $updated->stock_qty,
        ], $request);
        $this->bulkRules->flushStorefrontCaches();

        return response()->json(['data' => $updated]);
    }

    public function bulkRulesPreview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'selection' => ['required', 'array'],
            'rules' => ['required', 'array'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $preview = $this->bulkRules->previewRules($validated['selection'], $validated['rules'], $actor);

        return response()->json(['data' => $preview]);
    }

    public function bulkRulesCommit(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'selection' => ['required', 'array'],
            'rules' => ['required', 'array'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
            'preview_snapshot' => ['nullable', 'array'],
            'apply_valid_only' => ['boolean'],
            'async' => ['boolean'],
            'conflict_resolution' => ['nullable', Rule::in(['abort', 'overwrite'])],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $idempotencyKey = trim((string) ($validated['idempotency_key'] ?? $request->header('X-Idempotency-Key') ?? Str::uuid()->toString()));
        $result = $this->bulkRules->commitRules(
            $validated['selection'],
            $validated['rules'],
            $actor,
            $idempotencyKey,
            $validated['preview_snapshot'] ?? [],
            (bool) ($validated['apply_valid_only'] ?? false),
            (bool) ($validated['async'] ?? false),
            (string) ($validated['conflict_resolution'] ?? 'abort'),
        );

        if (($result['status'] ?? '') === 'conflict') {
            return response()->json([
                'message' => 'Conflito de concorrência: saldos alterados após a prévia. Revise os itens destacados.',
                'data' => $result,
            ], 409);
        }

        return response()->json(['data' => $result], ! empty($result['queued']) ? 202 : 200);
    }

    public function bulkBatchStatus(int $id): JsonResponse
    {
        $batch = BulkEditBatch::query()->with(['user:id,name', 'items'])->findOrFail($id);

        return response()->json(['data' => $batch]);
    }

    public function bulkLifecyclePreview(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'selection' => ['required', 'array'],
            'action' => ['required', Rule::in(['archive', 'restore', 'delete'])],
        ]);

        return response()->json([
            'data' => $this->lifecycle->previewLifecycle($validated['selection'], (string) $validated['action']),
        ]);
    }

    public function bulkLifecycleCommit(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'selection' => ['required', 'array'],
            'action' => ['required', Rule::in(['archive', 'restore', 'delete'])],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
            'archive_blocked' => ['boolean'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $idempotencyKey = trim((string) ($validated['idempotency_key'] ?? $request->header('X-Idempotency-Key') ?? Str::uuid()->toString()));
        $result = $this->lifecycle->commitLifecycle(
            $validated['selection'],
            (string) $validated['action'],
            $actor,
            $idempotencyKey,
            (bool) ($validated['archive_blocked'] ?? false),
        );

        return response()->json(['data' => $result]);
    }

    public function stockMovements(Request $request): JsonResponse
    {
        $movements = InventoryMovement::query()
            ->with(['variant:id,sku,name,product_id', 'variant.product:id,name', 'user:id,name'])
            ->latest('id')
            ->paginate(30);

        return response()->json($movements);
    }

    public function listCategories(): JsonResponse
    {
        return response()->json(['data' => $this->categoryHierarchy->listAdminCategories()]);
    }

    public function seedOfficialCategories(Request $request): JsonResponse
    {
        $backupCode = \Illuminate\Support\Facades\Artisan::call('mistura:backup');
        $backupOutput = trim(\Illuminate\Support\Facades\Artisan::output());
        if ($backupCode !== 0) {
            return response()->json([
                'message' => 'Backup prévio do banco falhou; sincronização cancelada para preservar dados.',
                'backup_output' => $backupOutput,
            ], 500);
        }

        $migrated = false;
        if (! CategoryHierarchyService::hasPrimaryPivotColumn()) {
            $migCode = \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
            if ($migCode !== 0) {
                return response()->json([
                    'message' => 'Falha ao aplicar migration incremental de categorias.',
                    'migrate_output' => trim(\Illuminate\Support\Facades\Artisan::output()),
                ], 500);
            }
            CategoryHierarchyService::resetSchemaCache();
            $migrated = true;
        }

        $seeder = new \Database\Seeders\OfficialCategoriesSeeder;
        $stats = $seeder->seedOfficialCategories();
        $this->categoryHierarchy->clearCaches();

        $this->audit->record('catalog.official_categories_seeded', $request->user(), 'category', null, null, array_merge($stats, [
            'backup_output' => $backupOutput,
            'migrated' => $migrated,
        ]), $request);

        return response()->json([
            'message' => "Estrutura oficial sincronizada: {$stats['created']} criada(s), {$stats['reused']} preservada(s), {$stats['reconciled']} reconciliada(s).",
            'data' => array_merge($stats, [
                'migrated' => $migrated,
                'backup_output' => $backupOutput,
            ]),
        ]);
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'parent_id' => ['nullable', 'integer', 'exists:categories,id'],
            'name' => ['required', 'string', 'max:150'],
            'slug' => ['nullable', 'string', 'max:160'],
            'description' => ['nullable', 'string'],
            'image_path' => ['nullable', 'string', 'max:500'],
            'banner_desktop_path' => ['nullable', 'string', 'max:500'],
            'banner_mobile_path' => ['nullable', 'string', 'max:500'],
            'icon' => ['nullable', 'string', 'max:60'],
            'sort_order' => ['integer', 'min:0'],
            'show_in_menu' => ['boolean'],
            'is_active' => ['boolean'],
            'seo_title' => ['nullable', 'string', 'max:180'],
            'seo_description' => ['nullable', 'string', 'max:320'],
        ]);

        $parentId = isset($validated['parent_id']) ? (int) $validated['parent_id'] : null;
        $this->categoryHierarchy->assertSafeCreate((string) $validated['name'], $parentId);

        $manualSlug = ! empty($validated['slug']) ? Str::slug((string) $validated['slug']) : null;
        if ($manualSlug !== null) {
            if ($manualSlug === '') {
                throw ValidationException::withMessages(['slug' => ['Informe um slug válido.']]);
            }
            if (Category::query()->where('slug', $manualSlug)->exists()) {
                throw ValidationException::withMessages(['slug' => ['Este slug já está em uso por outra categoria.']]);
            }
            $slug = $manualSlug;
        } else {
            $slug = Str::slug((string) $validated['name']) ?: 'categoria';
            if (Category::query()->where('slug', $slug)->exists()) {
                $parentSlug = $parentId ? Category::query()->where('id', $parentId)->value('slug') : null;
                $base = $parentSlug ? Str::slug("{$parentSlug}-{$slug}") : $slug;
                $slug = $base;
                $suffix = 2;
                while (Category::query()->where('slug', $slug)->exists()) {
                    $slug = "{$base}-{$suffix}";
                    $suffix++;
                }
            }
        }

        if (! array_key_exists('sort_order', $validated)) {
            $maxOrder = (int) Category::query()
                ->when($parentId === null, fn ($q) => $q->whereNull('parent_id'), fn ($q) => $q->where('parent_id', $parentId))
                ->max('sort_order');
            $validated['sort_order'] = $maxOrder + 1;
        }

        $category = DB::transaction(fn () => Category::query()->create(array_merge($validated, [
            'parent_id' => $parentId,
            'slug' => $slug,
        ])));

        $this->categoryHierarchy->clearCaches();

        return response()->json(['data' => $category], 201);
    }

    public function updateCategory(Request $request, int $id): JsonResponse
    {
        $category = Category::query()->findOrFail($id);
        $validated = $request->validate([
            'parent_id' => ['nullable', 'integer', 'exists:categories,id'],
            'name' => ['required', 'string', 'max:150'],
            'slug' => ['nullable', 'string', 'max:160'],
            'description' => ['nullable', 'string'],
            'image_path' => ['nullable', 'string', 'max:500'],
            'banner_desktop_path' => ['nullable', 'string', 'max:500'],
            'banner_mobile_path' => ['nullable', 'string', 'max:500'],
            'icon' => ['nullable', 'string', 'max:60'],
            'sort_order' => ['integer', 'min:0'],
            'show_in_menu' => ['boolean'],
            'is_active' => ['boolean'],
            'seo_title' => ['nullable', 'string', 'max:180'],
            'seo_description' => ['nullable', 'string', 'max:320'],
        ]);

        $newParentId = array_key_exists('parent_id', $validated)
            ? ($validated['parent_id'] !== null ? (int) $validated['parent_id'] : null)
            : $category->parent_id;

        $this->categoryHierarchy->assertSafeUpdate($id, (string) $validated['name'], $newParentId);

        $oldSlug = $category->slug;
        $newSlug = ! empty($validated['slug']) ? Str::slug((string) $validated['slug']) : $oldSlug;
        if ($newSlug !== $oldSlug) {
            if (Category::query()->where('slug', $newSlug)->where('id', '!=', $id)->exists()) {
                throw ValidationException::withMessages(['slug' => ['Este slug já está em uso por outra categoria.']]);
            }
            $validated['slug'] = $newSlug;
        } else {
            unset($validated['slug']);
        }

        DB::transaction(function () use ($category, $validated, $oldSlug, $newSlug): void {
            if ($newSlug !== $oldSlug) {
                SlugRedirect::query()->updateOrCreate(
                    ['entity_type' => 'category', 'old_slug' => $oldSlug],
                    ['new_slug' => $newSlug]
                );
            }
            $category->update($validated);
        });

        $this->categoryHierarchy->clearCaches();

        return response()->json(['data' => $category->fresh()]);
    }

    public function reorderCategories(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1', 'max:500'],
            'items.*.id' => ['required', 'integer', 'exists:categories,id'],
            'items.*.parent_id' => ['nullable', 'integer', 'exists:categories,id'],
            'items.*.sort_order' => ['required', 'integer', 'min:0'],
        ]);

        /** @var list<array{id: int, parent_id: int|null, sort_order: int}> $items */
        $items = array_map(fn (array $item): array => [
            'id' => (int) $item['id'],
            'parent_id' => isset($item['parent_id']) ? (int) $item['parent_id'] : null,
            'sort_order' => (int) $item['sort_order'],
        ], $validated['items']);

        $this->categoryHierarchy->reorder($items);

        return response()->json([
            'message' => 'Hierarquia e ordem das categorias atualizadas.',
            'data' => $this->categoryHierarchy->listAdminCategories(),
        ]);
    }

    public function bulkCategories(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'category_ids' => ['required', 'array', 'min:1', 'max:200'],
            'category_ids.*' => ['integer', 'exists:categories,id'],
            'action' => ['required', Rule::in(['activate', 'deactivate', 'show_in_menu', 'hide_from_menu', 'move_parent', 'delete'])],
            'parent_id' => ['nullable', 'integer', 'exists:categories,id'],
            'transfer_category_id' => ['nullable', 'integer', 'exists:categories,id'],
        ]);

        $ids = array_values(array_unique(array_map('intval', $validated['category_ids'])));
        $action = (string) $validated['action'];

        if ($action === 'move_parent') {
            $targetParent = isset($validated['parent_id']) ? (int) $validated['parent_id'] : null;
            DB::transaction(function () use ($ids, $targetParent): void {
                foreach ($ids as $id) {
                    $cat = Category::query()->findOrFail($id);
                    $this->categoryHierarchy->assertSafeUpdate($id, $cat->name, $targetParent);
                    $cat->update(['parent_id' => $targetParent]);
                }
            });
            $this->categoryHierarchy->clearCaches();

            return response()->json(['message' => count($ids).' categoria(s) movida(s) na hierarquia.']);
        }

        if ($action === 'delete') {
            $deleted = 0;
            $skipped = [];
            $transferId = isset($validated['transfer_category_id']) ? (int) $validated['transfer_category_id'] : null;

            foreach ($ids as $id) {
                $cat = Category::query()->find($id);
                if (! $cat) {
                    continue;
                }
                $deps = $this->categoryHierarchy->inspectDependencies($cat);
                if (! $deps['can_delete_directly'] && $transferId === null) {
                    $skipped[] = $cat->name;

                    continue;
                }
                $this->categoryHierarchy->deleteWithStrategy(
                    $cat,
                    $deps['can_delete_directly'] ? 'block' : 'transfer',
                    $transferId,
                    'promote_to_parent'
                );
                $deleted++;
            }

            return response()->json([
                'message' => $skipped === []
                    ? "{$deleted} categoria(s) excluída(s)."
                    : "{$deleted} excluída(s); ".count($skipped).' mantida(s) por possuir produtos/subcategorias vinculados ('.implode(', ', $skipped).').',
                'deleted' => $deleted,
                'skipped' => $skipped,
            ]);
        }

        DB::transaction(function () use ($ids, $action): void {
            $patch = match ($action) {
                'activate' => ['is_active' => true],
                'deactivate' => ['is_active' => false],
                'show_in_menu' => ['show_in_menu' => true],
                'hide_from_menu' => ['show_in_menu' => false],
                default => [],
            };
            if ($patch !== []) {
                Category::query()->whereIn('id', $ids)->update($patch);
            }
        });

        $this->categoryHierarchy->clearCaches();

        return response()->json(['message' => count($ids).' categoria(s) atualizada(s).']);
    }

    public function categoryDependencies(int $id): JsonResponse
    {
        $category = Category::query()->findOrFail($id);

        return response()->json(['data' => $this->categoryHierarchy->inspectDependencies($category)]);
    }

    public function destroyCategory(Request $request, int $id): JsonResponse
    {
        $category = Category::query()->findOrFail($id);
        $validated = $request->validate([
            'strategy' => ['nullable', Rule::in(['block', 'deactivate', 'transfer'])],
            'transfer_category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'subcategory_strategy' => ['nullable', Rule::in(['promote_to_parent', 'move_to_target'])],
        ]);

        $result = $this->categoryHierarchy->deleteWithStrategy(
            $category,
            (string) ($validated['strategy'] ?? 'block'),
            isset($validated['transfer_category_id']) ? (int) $validated['transfer_category_id'] : null,
            (string) ($validated['subcategory_strategy'] ?? 'promote_to_parent')
        );

        return response()->json($result);
    }

    public function listBrands(): JsonResponse
    {
        return response()->json(['data' => Brand::query()->orderBy('name')->get()]);
    }

    public function storeBrand(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'slug' => ['nullable', 'string', 'max:160'],
            'description' => ['nullable', 'string'],
            'logo_path' => ['nullable', 'string', 'max:500'],
            'is_featured' => ['boolean'],
            'is_active' => ['boolean'],
            'seo_title' => ['nullable', 'string', 'max:180'],
            'seo_description' => ['nullable', 'string', 'max:320'],
        ]);

        $slug = Str::slug((string) ($validated['slug'] ?? $validated['name']));
        if (Brand::query()->where('slug', $slug)->exists()) {
            $slug .= '-'.strtolower(Str::random(4));
        }

        $brand = Brand::query()->create(array_merge($validated, ['slug' => $slug]));
        SeoController::clearCaches();

        return response()->json(['data' => $brand], 201);
    }

    public function updateBrand(Request $request, int $id): JsonResponse
    {
        $brand = Brand::query()->findOrFail($id);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'slug' => ['nullable', 'string', 'max:160'],
            'description' => ['nullable', 'string'],
            'logo_path' => ['nullable', 'string', 'max:500'],
            'is_featured' => ['boolean'],
            'is_active' => ['boolean'],
            'seo_title' => ['nullable', 'string', 'max:180'],
            'seo_description' => ['nullable', 'string', 'max:320'],
        ]);

        $oldSlug = $brand->slug;
        $newSlug = ! empty($validated['slug']) ? Str::slug((string) $validated['slug']) : $oldSlug;
        if ($newSlug !== $oldSlug && ! Brand::query()->where('slug', $newSlug)->where('id', '!=', $id)->exists()) {
            SlugRedirect::query()->updateOrCreate(
                ['entity_type' => 'brand', 'old_slug' => $oldSlug],
                ['new_slug' => $newSlug]
            );
            $validated['slug'] = $newSlug;
        } else {
            unset($validated['slug']);
        }

        $brand->update($validated);
        SeoController::clearCaches();

        return response()->json(['data' => $brand->fresh()]);
    }

    public function archiveVariant(Request $request, int $id, int $variantId): JsonResponse
    {
        $product = Product::withTrashed()->findOrFail($id);
        $variant = ProductVariant::query()->where('product_id', $product->id)->findOrFail($variantId);
        $result = $this->variationsSync->archiveVariant($product, $variant, $request->user());

        $this->audit->record('catalog.variant_archived', $request->user(), 'product_variant', $variant->id, null, [
            'product_id' => $product->id,
            'sku' => $variant->sku,
            'name' => $variant->name,
        ], $request);
        $this->bulkRules->flushStorefrontCaches();

        return response()->json(['message' => 'Combinação arquivada com sucesso.', 'data' => $result]);
    }

    public function restoreVariant(Request $request, int $id, int $variantId): JsonResponse
    {
        $product = Product::withTrashed()->findOrFail($id);
        $variant = ProductVariant::query()->where('product_id', $product->id)->findOrFail($variantId);
        $restored = $this->variationsSync->restoreVariant($product, $variant);

        $this->audit->record('catalog.variant_restored', $request->user(), 'product_variant', $variant->id, null, [
            'product_id' => $product->id,
            'sku' => $variant->sku,
            'name' => $variant->name,
        ], $request);
        $this->bulkRules->flushStorefrontCaches();

        return response()->json(['message' => 'Combinação restaurada com sucesso.', 'data' => $restored]);
    }

    public function listAttributes(): JsonResponse
    {
        $this->variationsSync->ensureStandardAttributes();

        return response()->json([
            'data' => Attribute::query()
                ->with(['values', 'categories:id,name,slug'])
                ->orderBy('sort_order')
                ->orderBy('name')
                ->get(),
        ]);
    }

    public function storeAttribute(Request $request): JsonResponse
    {
        $validated = $this->validateAttribute($request);

        $attribute = DB::transaction(function () use ($validated): Attribute {
            $slug = Str::slug((string) ($validated['slug'] ?? $validated['name']));
            if (Attribute::query()->where('slug', $slug)->exists()) {
                $slug .= '-'.strtolower(Str::random(4));
            }

            $attribute = Attribute::query()->create([
                'name' => $validated['name'],
                'slug' => $slug,
                'display_type' => $validated['display_type'] ?? 'pill',
                'is_filterable' => (bool) ($validated['is_filterable'] ?? true),
                'is_comparable' => (bool) ($validated['is_comparable'] ?? true),
                'unit' => $validated['unit'] ?? null,
                'sort_order' => (int) ($validated['sort_order'] ?? 0),
            ]);

            $this->syncAttributeValues($attribute, $validated['values'] ?? []);

            return $attribute;
        });

        return response()->json(['data' => $attribute->fresh(['values', 'categories'])], 201);
    }

    public function updateAttribute(Request $request, int $id): JsonResponse
    {
        $attribute = Attribute::query()->findOrFail($id);
        $validated = $this->validateAttribute($request, $attribute->id);

        DB::transaction(function () use ($attribute, $validated): void {
            $attribute->update([
                'name' => $validated['name'],
                'display_type' => $validated['display_type'] ?? $attribute->display_type,
                'is_filterable' => array_key_exists('is_filterable', $validated) ? (bool) $validated['is_filterable'] : $attribute->is_filterable,
                'is_comparable' => array_key_exists('is_comparable', $validated) ? (bool) $validated['is_comparable'] : $attribute->is_comparable,
                'unit' => $validated['unit'] ?? null,
                'sort_order' => (int) ($validated['sort_order'] ?? $attribute->sort_order),
            ]);

            if (array_key_exists('values', $validated)) {
                $this->syncAttributeValues($attribute, $validated['values'] ?? []);
            }
        });

        return response()->json(['data' => $attribute->fresh(['values', 'categories'])]);
    }

    public function destroyAttribute(int $id): JsonResponse
    {
        $attribute = Attribute::query()->findOrFail($id);
        $attribute->delete();

        return response()->json(['message' => 'Atributo removido.']);
    }

    public function syncCategoryAttributes(Request $request, int $id): JsonResponse
    {
        $category = Category::query()->findOrFail($id);
        $validated = $request->validate([
            'attributes' => ['required', 'array'],
            'attributes.*.attribute_id' => ['required', 'integer', 'exists:attributes,id'],
            'attributes.*.is_filterable' => ['boolean'],
            'attributes.*.is_comparable' => ['boolean'],
            'attributes.*.sort_order' => ['integer', 'min:0'],
        ]);

        $syncData = [];
        foreach ($validated['attributes'] as $idx => $entry) {
            $syncData[(int) $entry['attribute_id']] = [
                'is_filterable' => (bool) ($entry['is_filterable'] ?? true),
                'is_comparable' => (bool) ($entry['is_comparable'] ?? true),
                'sort_order' => (int) ($entry['sort_order'] ?? $idx),
            ];
        }

        $category->attributes()->sync($syncData);

        return response()->json(['data' => $category->fresh(['attributes:id,name,slug'])]);
    }

    /** @return array<string, mixed> */
    private function validateAttribute(Request $request, ?int $ignoreId = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'slug' => ['nullable', 'string', 'max:110', Rule::unique('attributes', 'slug')->ignore($ignoreId)],
            'display_type' => ['nullable', Rule::in(['pill', 'color_swatch'])],
            'is_filterable' => ['boolean'],
            'is_comparable' => ['boolean'],
            'unit' => ['nullable', 'string', 'max:30'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'values' => ['nullable', 'array'],
            'values.*.id' => ['nullable', 'integer'],
            'values.*.value' => ['required_with:values', 'string', 'max:100'],
            'values.*.color_hex' => ['nullable', 'string', 'max:16'],
            'values.*.sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
    }

    /** @param list<array<string, mixed>> $values */
    private function syncAttributeValues(Attribute $attribute, array $values): void
    {
        $keptIds = [];
        foreach ($values as $idx => $row) {
            $valText = trim((string) $row['value']);
            if ($valText === '') {
                continue;
            }
            $valSlug = Str::slug($valText);
            $av = null;
            if (! empty($row['id'])) {
                $av = $attribute->values()->find((int) $row['id']);
            }
            if (! $av) {
                $av = $attribute->values()->where('slug', $valSlug)->first();
            }

            if ($av) {
                $av->update([
                    'value' => $valText,
                    'color_hex' => $row['color_hex'] ?? null,
                    'sort_order' => (int) ($row['sort_order'] ?? $idx),
                ]);
            } else {
                $av = AttributeValue::query()->create([
                    'attribute_id' => $attribute->id,
                    'value' => $valText,
                    'slug' => $valSlug,
                    'color_hex' => $row['color_hex'] ?? null,
                    'sort_order' => (int) ($row['sort_order'] ?? $idx),
                ]);
            }
            $keptIds[] = $av->id;
        }
    }

    public function exportCsv(Request $request): Response
    {
        $canViewCost = $request->user()?->hasPermission('catalog.cost.view') ?? false;
        $csv = $this->csv->exportCsv($canViewCost);

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="catalogo-mistura-feminina-'.now()->format('Ymd-Hi').'.csv"',
        ]);
    }

    public function importCsv(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'csv_content' => ['nullable', 'string'],
            'file' => ['nullable', 'file', 'mimes:csv,txt,tsv,xlsx', 'max:5120'],
            'dry_run' => ['boolean'],
            'skip_invalid' => ['boolean'],
            'category_overrides' => ['nullable'],
        ]);

        $overrides = [];
        if (is_array($validated['category_overrides'] ?? null)) {
            $overrides = $validated['category_overrides'];
        } elseif (is_string($validated['category_overrides'] ?? null) && trim($validated['category_overrides']) !== '') {
            $decoded = json_decode($validated['category_overrides'], true);
            if (is_array($decoded)) {
                $overrides = $decoded;
            }
        }

        $dryRun = $request->boolean('dry_run', true);
        $skipInvalid = $request->boolean('skip_invalid', false);
        if ($request->hasFile('file')) {
            $file = $request->file('file');
            $ext = strtolower((string) ($file->getClientOriginalExtension() ?: $file->guessExtension() ?: 'csv'));
            if ($ext === 'xlsx') {
                $report = $this->csv->importXlsxFile(
                    (string) $file->getRealPath(),
                    $dryRun,
                    $request->user(),
                    $overrides,
                    $skipInvalid,
                );
            } else {
                $content = (string) file_get_contents((string) $file->getRealPath());
                $report = $this->csv->importCsv($content, $dryRun, $request->user(), $overrides, $skipInvalid);
            }
        } else {
            $content = $validated['csv_content'] ?? null;
            if (! $content) {
                return response()->json(['message' => 'Envie uma planilha (.xlsx/.csv) ou conteúdo CSV válido.'], 422);
            }
            $report = $this->csv->importCsv($content, $dryRun, $request->user(), $overrides, $skipInvalid);
        }

        $this->audit->record('catalog.csv_import', $request->user(), 'catalog', null, null, [
            'dry_run' => $dryRun,
            'skip_invalid' => $skipInvalid,
            'created' => $report['created'],
            'updated' => $report['updated'],
            'pending_count' => $report['pending_count'] ?? 0,
        ], $request);
        if (! $report['dry_run']) {
            $this->bulkRules->flushStorefrontCaches();
            $this->categoryHierarchy->clearCaches();
        }

        return response()->json(['data' => $report]);
    }

    public function listReviews(Request $request): JsonResponse
    {
        $query = Review::query()->with('product:id,name,slug')->latest('id');
        if ($request->filled('status')) {
            $query->where('status', (string) $request->query('status'));
        }

        return response()->json($query->paginate(20));
    }

    public function moderateReview(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(['approved', 'rejected', 'pending'])],
        ]);
        $review = Review::query()->findOrFail($id);
        $review->update(['status' => $validated['status']]);
        Cache::flush();

        return response()->json(['data' => $review]);
    }

    public function listRestockRequests(): JsonResponse
    {
        $requests = RestockRequest::query()
            ->with(['product:id,name,slug', 'variant:id,name,shade_code,sku,stock_qty,reserved_qty'])
            ->latest('id')
            ->paginate(30);

        return response()->json($requests);
    }

    public function restockSummary(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->restock->demandSummary([
                'status' => $request->query('status'),
                'brand_id' => $request->query('brand_id'),
                'product_id' => $request->query('product_id'),
                'variant_id' => $request->query('variant_id'),
                'search' => $request->query('search'),
            ]),
        ]);
    }

    public function replenishmentInsights(): JsonResponse
    {
        return response()->json([
            'data' => $this->replenishment->adminInsights(),
        ]);
    }

    /** @return array<string, mixed> */
    private function validateProduct(Request $request, ?int $ignoreId = null): array
    {
        $validated = $request->validate([
            'brand_id' => ['nullable', 'integer', 'exists:brands,id'],
            'name' => ['required', 'string', 'max:200'],
            'slug' => ['nullable', 'string', 'max:220'],
            'sku' => ['required', 'string', 'max:80', Rule::unique('products', 'sku')->ignore($ignoreId)],
            'gtin' => ['nullable', 'string', 'max:40'],
            'supplier_code' => ['nullable', 'string', 'max:80'],
            'power_watts' => ['nullable', 'integer', 'min:1', 'max:5000'],
            'manufacturer' => ['nullable', 'string', 'max:150'],
            'short_description' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string'],
            'ingredients' => ['nullable', 'string'],
            'usage_instructions' => ['nullable', 'string'],
            'product_type' => ['nullable', Rule::in(['simple', 'variable', 'kit'])],
            'has_variants' => ['nullable', 'boolean'],
            'confirm_disable_variations' => ['nullable', 'boolean'],
            'variation_attributes' => ['nullable', 'array'],
            'variation_attributes.*.attribute_id' => ['nullable', 'integer'],
            'variation_attributes.*.name' => ['required_with:variation_attributes', 'string', 'max:100'],
            'variation_attributes.*.slug' => ['nullable', 'string', 'max:110'],
            'variation_attributes.*.display_type' => ['nullable', Rule::in(['pill', 'color_swatch'])],
            'variation_attributes.*.sort_order' => ['nullable', 'integer', 'min:0'],
            'variation_attributes.*.values' => ['nullable', 'array'],
            'cost_cents' => ['nullable', 'integer', 'min:0'],
            'price_cents' => ['required', 'integer', 'min:1'],
            'promo_price_cents' => ['nullable', 'integer', 'min:1'],
            'stock_qty' => ['nullable', 'integer', 'min:0'],
            'promo_starts_at' => ['nullable', 'date'],
            'promo_ends_at' => ['nullable', 'date'],
            'unit_label' => ['nullable', 'string', 'max:40'],
            'unit_quantity' => ['nullable', 'integer', 'min:1'],
            'weight_grams' => ['nullable', 'integer', 'min:1'],
            'width_cm' => ['nullable', 'integer', 'min:1'],
            'height_cm' => ['nullable', 'integer', 'min:1'],
            'length_cm' => ['nullable', 'integer', 'min:1'],
            'video_url' => ['nullable', 'string', 'max:500'],
            'tags' => ['nullable', 'array'],
            'is_active' => ['boolean'],
            'is_featured' => ['boolean'],
            'is_new_arrival' => ['boolean'],
            'is_best_seller' => ['boolean'],
            'wholesale_enabled' => ['boolean'],
            'wholesale_group_variants' => ['boolean'],
            'wholesale_tiers' => ['nullable', 'array'],
            'seo_title' => ['nullable', 'string', 'max:180'],
            'seo_description' => ['nullable', 'string', 'max:320'],
            'primary_category_id' => ['nullable', 'integer', 'exists:categories,id'],
            'category_ids' => ['nullable', 'array'],
            'category_ids.*' => ['integer', 'exists:categories,id'],
            'product_attribute_value_ids' => ['nullable', 'array'],
            'product_attribute_value_ids.*' => ['integer', 'exists:attribute_values,id'],
            'images' => ['nullable', 'array'],
            'images.*.path' => ['required_with:images', 'string', 'max:500'],
            'images.*.alt_text' => ['nullable', 'string', 'max:255'],
            'images.*.focal_point' => ['nullable', 'string', 'max:30'],
            'images.*.is_primary' => ['boolean'],
            'variants' => ['nullable', 'array'],
            'variants.*.id' => ['nullable', 'integer'],
            'variants.*.sku' => ['required_with:variants', 'string', 'max:80'],
            'variants.*.gtin' => ['nullable', 'string', 'max:40'],
            'variants.*.supplier_code' => ['nullable', 'string', 'max:80'],
            'variants.*.name' => ['required_with:variants', 'string', 'max:160'],
            'variants.*.option_values' => ['nullable', 'array'],
            'variants.*.shade_code' => ['nullable', 'string', 'max:40'],
            'variants.*.color_family' => ['nullable', 'string', 'max:60'],
            'variants.*.color_hex' => ['nullable', 'string', 'max:16'],
            'variants.*.swatch_image_path' => ['nullable', 'string', 'max:500'],
            'variants.*.image_path' => ['nullable', 'string', 'max:500'],
            'variants.*.image_id' => ['nullable', 'integer', 'exists:product_images,id'],
            'variants.*.sort_order' => ['nullable', 'integer', 'min:0'],
            'variants.*.price_cents' => ['nullable', 'integer', 'min:1'],
            'variants.*.promo_price_cents' => ['nullable', 'integer', 'min:1'],
            'variants.*.inherits_price' => ['nullable', 'boolean'],
            'variants.*.inherits_promo_price' => ['nullable', 'boolean'],
            'variants.*.cost_cents' => ['nullable', 'integer', 'min:0'],
            'variants.*.weight_grams' => ['nullable', 'integer', 'min:1'],
            'variants.*.inherits_weight' => ['nullable', 'boolean'],
            'variants.*.inherits_image' => ['nullable', 'boolean'],
            'variants.*.stock_qty' => ['required_with:variants', 'integer', 'min:0'],
            'variants.*.min_stock_alert' => ['nullable', 'integer', 'min:0'],
            'variants.*.is_default' => ['boolean'],
            'variants.*.is_active' => ['boolean'],
            'variants.*.is_archived' => ['boolean'],
            'variants.*.attribute_value_ids' => ['nullable', 'array'],
        ]);

        foreach (['description', 'short_description', 'ingredients', 'usage_instructions'] as $field) {
            if (! empty($validated[$field])) {
                $validated[$field] = $this->sanitizeHtml((string) $validated[$field]);
            }
        }

        return $validated;
    }

    private function sanitizeHtml(string $html): string
    {
        $sanitized = preg_replace('#<script(.*?)>(.*?)</script>#is', '', $html);
        $sanitized = preg_replace('#<iframe(.*?)>(.*?)</iframe>#is', '', (string) $sanitized);
        $sanitized = preg_replace('#<object(.*?)>(.*?)</object>#is', '', (string) $sanitized);
        $sanitized = preg_replace('#<embed(.*?)>(.*?)</embed>#is', '', (string) $sanitized);
        $sanitized = preg_replace('#\son\w+\s*=\s*(".*?"|\'.*?\'|[^\s>]+)#is', '', (string) $sanitized);
        $sanitized = preg_replace('#href\s*=\s*["\']\s*javascript:[^"\']*["\']#is', 'href="#"', (string) $sanitized);

        return (string) $sanitized;
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function syncImagesAndVariants(Product $product, array $validated, bool $updating = false, ?User $actor = null): void
    {
        $this->variationsSync->syncProductCatalogData($product, $validated, $updating, $actor);
    }
}
