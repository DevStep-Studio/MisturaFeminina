<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Catalog\Services\CatalogCsvService;
use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Security\Services\AuditLogger;
use App\Domain\Shared\Enums\InventoryMovementType;
use App\Domain\Shared\Enums\ProductType;
use App\Http\Controllers\Controller;
use App\Http\Controllers\SeoController;
use App\Models\Attribute;
use App\Models\Brand;
use App\Models\Category;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\RestockRequest;
use App\Models\Review;
use App\Models\SlugRedirect;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminCatalogController extends Controller
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly CatalogCsvService $csv,
        private readonly AuditLogger $audit,
    ) {}

    public function indexProducts(Request $request): JsonResponse
    {
        $query = Product::query()
            ->with(['brand:id,name', 'categories:id,name', 'images', 'variants'])
            ->latest('id');

        if ($request->filled('search')) {
            $term = '%'.trim((string) $request->query('search')).'%';
            $query->where(fn ($q) => $q->where('name', 'like', $term)->orWhere('sku', 'like', $term));
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        return response()->json($query->paginate(20));
    }

    public function showProduct(int $id): JsonResponse
    {
        $product = Product::query()
            ->with(['brand', 'categories', 'images', 'variants.attributeValues.attribute', 'kitItems.componentVariant.product'])
            ->findOrFail($id);

        return response()->json(['data' => $product]);
    }

    public function storeProduct(Request $request): JsonResponse
    {
        $validated = $this->validateProduct($request);
        $product = DB::transaction(function () use ($validated): Product {
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
                'manufacturer' => $validated['manufacturer'] ?? null,
                'short_description' => $validated['short_description'] ?? null,
                'description' => $validated['description'] ?? null,
                'ingredients' => $validated['ingredients'] ?? null,
                'usage_instructions' => $validated['usage_instructions'] ?? null,
                'product_type' => $validated['product_type'] ?? ProductType::Simple->value,
                'cost_cents' => $validated['cost_cents'] ?? 0,
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
                'wholesale_tiers' => $validated['wholesale_tiers'] ?? null,
                'seo_title' => $validated['seo_title'] ?? $validated['name'],
                'seo_description' => $validated['seo_description'] ?? $validated['short_description'] ?? null,
            ]);

            if (! empty($validated['category_ids'])) {
                $product->categories()->sync($validated['category_ids']);
            }

            $this->syncImagesAndVariants($product, $validated);

            return $product;
        });

        $this->audit->record('catalog.product_created', $request->user(), 'product', $product->id, null, ['sku' => $product->sku, 'name' => $product->name], $request);
        SeoController::clearCaches();

        return response()->json(['data' => $product->fresh(['brand', 'categories', 'images', 'variants'])], 201);
    }

    public function updateProduct(Request $request, int $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);
        $validated = $this->validateProduct($request, $product->id);

        $oldSlug = $product->slug;
        $newSlug = ! empty($validated['slug']) ? Str::slug((string) $validated['slug']) : $oldSlug;

        DB::transaction(function () use ($product, $validated, $oldSlug, $newSlug): void {
            if ($newSlug !== $oldSlug && ! Product::query()->where('slug', $newSlug)->where('id', '!=', $product->id)->exists()) {
                SlugRedirect::query()->updateOrCreate(
                    ['entity_type' => 'product', 'old_slug' => $oldSlug],
                    ['new_slug' => $newSlug]
                );
            } else {
                $newSlug = $oldSlug;
            }

            $product->update([
                'brand_id' => $validated['brand_id'] ?? $product->brand_id,
                'name' => $validated['name'],
                'slug' => $newSlug,
                'sku' => $validated['sku'],
                'gtin' => $validated['gtin'] ?? null,
                'manufacturer' => $validated['manufacturer'] ?? null,
                'short_description' => $validated['short_description'] ?? null,
                'description' => $validated['description'] ?? null,
                'ingredients' => $validated['ingredients'] ?? null,
                'usage_instructions' => $validated['usage_instructions'] ?? null,
                'product_type' => $validated['product_type'] ?? $product->product_type->value,
                'cost_cents' => $validated['cost_cents'] ?? $product->cost_cents,
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
                'wholesale_tiers' => $validated['wholesale_tiers'] ?? $product->wholesale_tiers,
                'seo_title' => $validated['seo_title'] ?? $validated['name'],
                'seo_description' => $validated['seo_description'] ?? null,
            ]);

            if (array_key_exists('category_ids', $validated)) {
                $product->categories()->sync($validated['category_ids'] ?? []);
            }

            $this->syncImagesAndVariants($product, $validated, true);
        });

        $this->audit->record('catalog.product_updated', $request->user(), 'product', $product->id, null, ['name' => $product->name], $request);
        SeoController::clearCaches();

        return response()->json(['data' => $product->fresh(['brand', 'categories', 'images', 'variants'])]);
    }

    public function destroyProduct(Request $request, int $id): JsonResponse
    {
        $product = Product::query()->findOrFail($id);
        $product->delete();
        $this->audit->record('catalog.product_deleted', $request->user(), 'product', $product->id, null, ['sku' => $product->sku], $request);
        SeoController::clearCaches();

        return response()->json(['message' => 'Produto arquivado com sucesso.']);
    }

    public function adjustStock(Request $request, int $variantId): JsonResponse
    {
        $validated = $request->validate([
            'qty_delta' => ['required', 'integer', 'not_in:0'],
            'reason' => ['required', 'string', 'min:3', 'max:255'],
            'reference' => ['nullable', 'string', 'max:120'],
        ]);

        $variant = ProductVariant::query()->findOrFail($variantId);
        $type = (int) $validated['qty_delta'] > 0
            ? InventoryMovementType::In
            : InventoryMovementType::Adjustment;

        $updated = $this->inventory->adjustStock(
            $variant,
            (int) $validated['qty_delta'],
            $type,
            $request->user(),
            $validated['reason'],
            $validated['reference'] ?? null,
        );

        $this->audit->record('inventory.adjusted', $request->user(), 'product_variant', $updated->id, null, [
            'sku' => $updated->sku,
            'qty_delta' => $validated['qty_delta'],
            'stock_after' => $updated->stock_qty,
        ], $request);

        return response()->json(['data' => $updated]);
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
        $categories = Category::query()->with('parent:id,name')->orderBy('sort_order')->orderBy('name')->get();

        return response()->json(['data' => $categories]);
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

        $slug = Str::slug((string) ($validated['slug'] ?? $validated['name']));
        if (Category::query()->where('slug', $slug)->exists()) {
            $slug .= '-'.strtolower(Str::random(4));
        }

        $category = Category::query()->create(array_merge($validated, ['slug' => $slug]));
        SeoController::clearCaches();

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

        $oldSlug = $category->slug;
        $newSlug = ! empty($validated['slug']) ? Str::slug((string) $validated['slug']) : $oldSlug;
        if ($newSlug !== $oldSlug && ! Category::query()->where('slug', $newSlug)->where('id', '!=', $id)->exists()) {
            SlugRedirect::query()->updateOrCreate(
                ['entity_type' => 'category', 'old_slug' => $oldSlug],
                ['new_slug' => $newSlug]
            );
            $validated['slug'] = $newSlug;
        } else {
            unset($validated['slug']);
        }

        $category->update($validated);
        SeoController::clearCaches();

        return response()->json(['data' => $category->fresh()]);
    }

    public function destroyCategory(int $id): JsonResponse
    {
        $category = Category::query()->findOrFail($id);
        $category->delete();
        SeoController::clearCaches();

        return response()->json(['message' => 'Categoria removida.']);
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

    public function listAttributes(): JsonResponse
    {
        return response()->json(['data' => Attribute::query()->with('values')->orderBy('name')->get()]);
    }

    public function exportCsv(): Response
    {
        $csv = $this->csv->exportCsv();

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="catalogo-mistura-feminina-'.now()->format('Ymd-Hi').'.csv"',
        ]);
    }

    public function importCsv(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'csv_content' => ['nullable', 'string'],
            'file' => ['nullable', 'file', 'mimes:csv,txt', 'max:5120'],
            'dry_run' => ['boolean'],
        ]);

        $content = $validated['csv_content'] ?? null;
        if ($request->hasFile('file')) {
            $content = (string) file_get_contents((string) $request->file('file')->getRealPath());
        }

        if (! $content) {
            return response()->json(['message' => 'Envie um arquivo CSV ou conteúdo CSV válido.'], 422);
        }

        $dryRun = $request->boolean('dry_run', true);
        $report = $this->csv->importCsv($content, $dryRun);

        $this->audit->record('catalog.csv_import', $request->user(), 'catalog', null, null, [
            'dry_run' => $dryRun,
            'created' => $report['created'],
            'updated' => $report['updated'],
        ], $request);

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
            ->with(['product:id,name,slug', 'variant:id,name,sku,stock_qty,reserved_qty'])
            ->latest('id')
            ->paginate(30);

        return response()->json($requests);
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
            'manufacturer' => ['nullable', 'string', 'max:150'],
            'short_description' => ['nullable', 'string', 'max:500'],
            'description' => ['nullable', 'string'],
            'ingredients' => ['nullable', 'string'],
            'usage_instructions' => ['nullable', 'string'],
            'product_type' => ['nullable', Rule::in(['simple', 'variable', 'kit'])],
            'cost_cents' => ['nullable', 'integer', 'min:0'],
            'price_cents' => ['required', 'integer', 'min:1'],
            'promo_price_cents' => ['nullable', 'integer', 'min:1'],
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
            'wholesale_tiers' => ['nullable', 'array'],
            'seo_title' => ['nullable', 'string', 'max:180'],
            'seo_description' => ['nullable', 'string', 'max:320'],
            'category_ids' => ['nullable', 'array'],
            'category_ids.*' => ['integer', 'exists:categories,id'],
            'images' => ['nullable', 'array'],
            'images.*.path' => ['required_with:images', 'string', 'max:500'],
            'images.*.alt_text' => ['nullable', 'string', 'max:255'],
            'images.*.focal_point' => ['nullable', 'string', 'max:30'],
            'images.*.is_primary' => ['boolean'],
            'variants' => ['nullable', 'array'],
            'variants.*.id' => ['nullable', 'integer'],
            'variants.*.sku' => ['required_with:variants', 'string', 'max:80'],
            'variants.*.name' => ['required_with:variants', 'string', 'max:160'],
            'variants.*.price_cents' => ['required_with:variants', 'integer', 'min:1'],
            'variants.*.promo_price_cents' => ['nullable', 'integer', 'min:1'],
            'variants.*.stock_qty' => ['required_with:variants', 'integer', 'min:0'],
            'variants.*.min_stock_alert' => ['nullable', 'integer', 'min:0'],
            'variants.*.is_default' => ['boolean'],
            'variants.*.is_active' => ['boolean'],
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

    /** @param array<string, mixed> $validated */
    private function syncImagesAndVariants(Product $product, array $validated, bool $updating = false): void
    {
        if (array_key_exists('images', $validated)) {
            $product->images()->delete();
            foreach (($validated['images'] ?? []) as $index => $img) {
                ProductImage::query()->create([
                    'product_id' => $product->id,
                    'disk' => 'public',
                    'path' => (string) $img['path'],
                    'alt_text' => $img['alt_text'] ?? $product->name,
                    'focal_point' => $img['focal_point'] ?? 'center',
                    'sort_order' => $index,
                    'is_primary' => ! empty($img['is_primary']) || $index === 0,
                ]);
            }
        }

        if (! empty($validated['variants'])) {
            foreach ($validated['variants'] as $idx => $vData) {
                $variant = null;
                if (! empty($vData['id'])) {
                    $variant = $product->variants()->find((int) $vData['id']);
                }
                if (! $variant) {
                    $variant = ProductVariant::query()->where('sku', $vData['sku'])->first();
                }

                $attrs = [
                    'product_id' => $product->id,
                    'sku' => (string) $vData['sku'],
                    'name' => (string) $vData['name'],
                    'price_cents' => (int) $vData['price_cents'],
                    'promo_price_cents' => $vData['promo_price_cents'] ?? null,
                    'min_stock_alert' => (int) ($vData['min_stock_alert'] ?? 5),
                    'is_default' => ! empty($vData['is_default']) || $idx === 0,
                    'is_active' => (bool) ($vData['is_active'] ?? true),
                ];

                if ($variant) {
                    $oldQty = $variant->stock_qty;
                    $newQty = (int) $vData['stock_qty'];
                    $variant->update(array_merge($attrs, ['stock_qty' => $newQty]));
                    if ($newQty !== $oldQty) {
                        InventoryMovement::query()->create([
                            'product_variant_id' => $variant->id,
                            'type' => InventoryMovementType::Adjustment,
                            'qty_delta' => $newQty - $oldQty,
                            'physical_after' => $newQty,
                            'reserved_after' => $variant->reserved_qty,
                            'reason' => 'Edição direta no cadastro do produto',
                        ]);
                    }
                } else {
                    $initialQty = (int) $vData['stock_qty'];
                    $variant = ProductVariant::query()->create(array_merge($attrs, [
                        'stock_qty' => $initialQty,
                        'reserved_qty' => 0,
                    ]));
                    if ($initialQty > 0) {
                        InventoryMovement::query()->create([
                            'product_variant_id' => $variant->id,
                            'type' => InventoryMovementType::In,
                            'qty_delta' => $initialQty,
                            'physical_after' => $initialQty,
                            'reserved_after' => 0,
                            'reason' => 'Saldo inicial da variação',
                        ]);
                    }
                }

                if (array_key_exists('attribute_value_ids', $vData)) {
                    $variant->attributeValues()->sync($vData['attribute_value_ids'] ?? []);
                }
            }
        } elseif (! $updating || ! $product->variants()->exists()) {
            ProductVariant::query()->create([
                'product_id' => $product->id,
                'sku' => $product->sku,
                'name' => 'Padrão',
                'price_cents' => $product->price_cents,
                'promo_price_cents' => $product->promo_price_cents,
                'stock_qty' => 0,
                'reserved_qty' => 0,
                'min_stock_alert' => 5,
                'is_default' => true,
                'is_active' => true,
            ]);
        }
    }
}
