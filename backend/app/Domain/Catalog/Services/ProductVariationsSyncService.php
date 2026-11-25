<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Domain\Shared\Enums\InventoryMovementType;
use App\Domain\Shared\Enums\ProductType;
use App\Models\AssistedOrderItem;
use App\Models\Attribute;
use App\Models\AttributeValue;
use App\Models\GoodsReceiptItem;
use App\Models\InventoryMovement;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\StockReservation;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ProductVariationsSyncService
{
    /** @var list<array{slug: string, name: string, display_type: string, is_comparable: bool, sort_order: int}> */
    private const STANDARD_ATTRIBUTES = [
        ['slug' => 'cor', 'name' => 'Cor', 'display_type' => 'color_swatch', 'is_comparable' => false, 'sort_order' => 1],
        ['slug' => 'tamanho', 'name' => 'Tamanho', 'display_type' => 'pill', 'is_comparable' => true, 'sort_order' => 2],
        ['slug' => 'peso', 'name' => 'Peso', 'display_type' => 'pill', 'is_comparable' => true, 'sort_order' => 3],
        ['slug' => 'volume', 'name' => 'Volume', 'display_type' => 'pill', 'is_comparable' => true, 'sort_order' => 4],
        ['slug' => 'acabamento', 'name' => 'Acabamento', 'display_type' => 'pill', 'is_comparable' => true, 'sort_order' => 5],
        ['slug' => 'modelo', 'name' => 'Modelo', 'display_type' => 'pill', 'is_comparable' => true, 'sort_order' => 6],
    ];

    public function __construct(
        private readonly InventoryService $inventory,
    ) {}

    public function ensureStandardAttributes(): void
    {
        foreach (self::STANDARD_ATTRIBUTES as $def) {
            Attribute::query()->firstOrCreate(
                ['slug' => $def['slug']],
                [
                    'name' => $def['name'],
                    'display_type' => $def['display_type'],
                    'is_filterable' => true,
                    'is_comparable' => $def['is_comparable'],
                    'sort_order' => $def['sort_order'],
                ]
            );
        }
    }

    /**
     * @return array{
     *   orders_count: int,
     *   movements_count: int,
     *   receipts_count: int,
     *   assisted_count: int,
     *   reservations_count: int,
     *   has_history: bool,
     *   can_delete: bool
     * }
     */
    public function inspectVariantLinks(ProductVariant $variant): array
    {
        $ordersCount = OrderItem::query()
            ->where('product_variant_id', $variant->id)
            ->distinct('order_id')
            ->count('order_id');
        $movementsCount = InventoryMovement::query()->where('product_variant_id', $variant->id)->count();
        $receiptsCount = GoodsReceiptItem::query()->where('product_variant_id', $variant->id)->count();
        $assistedCount = AssistedOrderItem::query()->where('product_variant_id', $variant->id)->count();
        $reservationsCount = StockReservation::query()
            ->where('product_variant_id', $variant->id)
            ->where('status', 'active')
            ->count();

        $hasHistory = $ordersCount > 0 || $movementsCount > 0 || $receiptsCount > 0 || $assistedCount > 0 || $reservationsCount > 0;
        $canDelete = ! $hasHistory && (int) $variant->stock_qty === 0 && (int) $variant->reserved_qty === 0;

        return [
            'orders_count' => $ordersCount,
            'movements_count' => $movementsCount,
            'receipts_count' => $receiptsCount,
            'assisted_count' => $assistedCount,
            'reservations_count' => $reservationsCount,
            'has_history' => $hasHistory,
            'can_delete' => $canDelete,
        ];
    }

    /**
     * Validates duplicate SKUs, duplicate combinations, promo rules, and conversion safety BEFORE DB writes.
     *
     * @param  array<string, mixed>  $validated
     */
    public function validateBeforePersist(?Product $product, array $validated): void
    {
        $hasVariations = $this->resolveHasVariationsFlag($product, $validated);
        $submittedVariants = is_array($validated['variants'] ?? null) ? $validated['variants'] : [];

        if ($hasVariations && $submittedVariants === []) {
            throw ValidationException::withMessages([
                'variants' => ['Adicione ao menos uma combinação vendável ou desative a opção "Este produto tem variações".'],
            ]);
        }

        if ($product !== null && $product->usesVariations() && ! $hasVariations) {
            $existingActive = $product->variants()->whereNull('archived_at')->get();
            $reservedTotal = (int) $existingActive->sum('reserved_qty');
            if ($reservedTotal > 0) {
                throw ValidationException::withMessages([
                    'has_variants' => ["Não é possível desativar variações enquanto houver {$reservedTotal} unidade(s) reservada(s) em pedidos aguardando pagamento."],
                ]);
            }

            $stockTotal = (int) $existingActive->sum('stock_qty');
            $ordersCount = (int) OrderItem::query()
                ->whereIn('product_variant_id', $existingActive->pluck('id')->all())
                ->distinct('order_id')
                ->count('order_id');

            $isExplicitDisable = array_key_exists('has_variants', $validated) && ! (bool) $validated['has_variants'];
            if ($isExplicitDisable && ($stockTotal > 0 || $ordersCount > 0 || $existingActive->count() > 1) && empty($validated['confirm_disable_variations'])) {
                throw ValidationException::withMessages([
                    'has_variants' => ["Desativar variações impacta {$existingActive->count()} variação(ões) ({$stockTotal} un. em estoque e {$ordersCount} pedido(s)). Confirme para preservar o histórico como arquivado."],
                ]);
            }
        }

        if ($submittedVariants === []) {
            return;
        }

        $productId = $product?->id;
        $productVariants = $product ? $product->variants()->get() : collect();
        $productVariantIds = $productVariants->pluck('id')->all();
        $matchedExistingIds = [];
        foreach ($submittedVariants as $v) {
            if (! empty($v['id']) && in_array((int) $v['id'], $productVariantIds, true)) {
                $matchedExistingIds[] = (int) $v['id'];
            }
        }
        $omittedDeletableIds = [];
        foreach ($productVariants as $ev) {
            if (! in_array($ev->id, $matchedExistingIds, true) && $this->inspectVariantLinks($ev)['can_delete']) {
                $omittedDeletableIds[] = $ev->id;
            }
        }

        $seenSkus = [];
        $seenSignatures = [];
        $errors = [];

        foreach ($submittedVariants as $idx => $vData) {
            $rawSku = strtoupper(trim((string) ($vData['sku'] ?? '')));
            $vid = ! empty($vData['id']) ? (int) $vData['id'] : null;

            if ($rawSku === '') {
                $errors["variants.{$idx}.sku"] = ['Informe o SKU desta variação.'];
            } elseif (isset($seenSkus[$rawSku])) {
                $firstIdx = $seenSkus[$rawSku] + 1;
                $errors["variants.{$idx}.sku"] = ["SKU {$rawSku} duplicado na grade (já usado na linha #{$firstIdx})."];
            } else {
                $seenSkus[$rawSku] = $idx;
                $collisionQuery = ProductVariant::query()->whereRaw('UPPER(sku) = ?', [$rawSku]);
                $ignoredIds = array_values(array_filter(array_merge($vid !== null ? [$vid] : [], $omittedDeletableIds)));
                if ($ignoredIds !== []) {
                    $collisionQuery->whereNotIn('id', $ignoredIds);
                } elseif ($productId !== null && ! $product->usesVariations()) {
                    // Converting simple -> variable: allow reusing own simple default SKU if replaced cleanly
                    $simpleDefaultIds = $product->variants()->where('name', 'Padrão')->pluck('id')->all();
                    if ($simpleDefaultIds !== []) {
                        $collisionQuery->whereNotIn('id', $simpleDefaultIds);
                    }
                }
                if ($collisionQuery->exists()) {
                    $errors["variants.{$idx}.sku"] = ["O SKU {$rawSku} já está cadastrado em outro item da loja."];
                }
            }

            $isArchived = ! empty($vData['is_archived']);
            if (! $isArchived) {
                $signature = $this->extractSignatureFromInput($vData);
                if ($signature !== '') {
                    if (isset($seenSignatures[$signature])) {
                        $firstIdx = $seenSignatures[$signature] + 1;
                        $errors["variants.{$idx}.combination"] = ["Combinação repetida na grade (já existe na linha #{$firstIdx})."];
                    } else {
                        $seenSignatures[$signature] = $idx;
                    }
                }
            }

            $inheritsPrice = array_key_exists('inherits_price', $vData)
                ? (bool) $vData['inherits_price']
                : ($vData['price_cents'] === null);
            $effectiveBasePrice = $inheritsPrice ? (int) $validated['price_cents'] : (int) ($vData['price_cents'] ?? $validated['price_cents']);

            $inheritsPromo = array_key_exists('inherits_promo_price', $vData) && (bool) $vData['inherits_promo_price'];
            $promo = $inheritsPromo ? ($validated['promo_price_cents'] ?? null) : ($vData['promo_price_cents'] ?? null);
            if ($promo !== null && (int) $promo >= $effectiveBasePrice) {
                $errors["variants.{$idx}.promo_price_cents"] = ['O preço promocional deve ser menor que o preço de venda desta linha.'];
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }

    /**
     * Synchronizes images, attributes, variations, stock ledger movements, and historical archiving inside a transaction.
     *
     * @param  array<string, mixed>  $validated
     */
    public function syncProductCatalogData(Product $product, array $validated, bool $updating = false, ?User $actor = null): void
    {
        $wasVariable = $product->usesVariations();
        $hasVariations = $this->resolveHasVariationsFlag($product, $validated);

        // 1. Sync Product Images WITHOUT wiping existing rows' primary IDs unnecessarily
        if (array_key_exists('images', $validated)) {
            $this->syncImagesPreservingIds($product, $validated['images'] ?? []);
        }

        $productImagesByPath = $product->images()->get()->keyBy('path');

        // 2. Resolve & persist variation attribute metadata + catalog Attribute/AttributeValue rows
        $resolvedAttrs = $this->resolveVariationAttributes(
            is_array($validated['variation_attributes'] ?? null) ? $validated['variation_attributes'] : []
        );

        $product->update([
            'has_variants' => $hasVariations,
            'product_type' => ($validated['product_type'] ?? null) === ProductType::Kit->value
                ? ProductType::Kit->value
                : ($hasVariations ? ProductType::Variable->value : ProductType::Simple->value),
            'variation_attributes' => $hasVariations ? $resolvedAttrs['normalized'] : null,
        ]);

        // 3. Branch A: Simple product (or confirmed disable of variations)
        if (! $hasVariations) {
            $this->syncAsSimpleProduct($product, $validated, $updating, $wasVariable, $actor);

            return;
        }

        // 4. Branch B: Product with variations (created, edited, or converted from simple)
        if (! $wasVariable && $updating) {
            $this->releaseLegacySimpleVariantBeforeConversion($product, $validated['variants'] ?? [], $actor);
        }

        $existingVariants = $product->variants()->get()->keyBy('id');
        $submittedVariants = is_array($validated['variants'] ?? null) ? $validated['variants'] : [];
        $keptIds = [];
        $canWriteCost = $actor?->hasPermission('catalog.cost.write') ?? false;
        $convertedFromSimpleWithStock = ! $wasVariable && $updating;

        foreach ($submittedVariants as $idx => $vData) {
            $variant = null;
            if (! empty($vData['id'])) {
                $variant = $existingVariants->get((int) $vData['id']);
            }
            if (! $variant && ! empty($vData['sku'])) {
                $skuUpper = strtoupper(trim((string) $vData['sku']));
                $variant = $existingVariants->first(fn (ProductVariant $ev): bool => strtoupper($ev->sku) === $skuUpper);
            }

            $mappedOptions = $this->mapVariantOptions($vData, $resolvedAttrs);
            $inheritsPrice = array_key_exists('inherits_price', $vData) ? (bool) $vData['inherits_price'] : false;
            $inheritsPromo = array_key_exists('inherits_promo_price', $vData) ? (bool) $vData['inherits_promo_price'] : false;
            $inheritsWeight = array_key_exists('inherits_weight', $vData)
                ? (bool) $vData['inherits_weight']
                : (! array_key_exists('weight_grams', $vData) || $vData['weight_grams'] === null);
            $rawImagePath = trim((string) ($vData['image_path'] ?? ''));
            $inheritsImage = array_key_exists('inherits_image', $vData)
                ? (bool) $vData['inherits_image']
                : ($rawImagePath === '' && empty($vData['image_id']));

            $resolvedPriceCents = $inheritsPrice ? (int) $product->price_cents : (int) ($vData['price_cents'] ?? $product->price_cents);
            $resolvedPromoCents = $inheritsPromo ? $product->promo_price_cents : ($vData['promo_price_cents'] ?? null);
            $resolvedWeightGrams = $inheritsWeight ? null : (int) $vData['weight_grams'];

            $resolvedImagePath = $inheritsImage ? null : ($rawImagePath !== '' ? $rawImagePath : $variant?->image_path);
            $resolvedImageId = $inheritsImage
                ? null
                : ($vData['image_id'] ?? ($resolvedImagePath !== null ? $productImagesByPath->get($resolvedImagePath)?->id : null) ?? $variant?->image_id);

            $isArchived = ! empty($vData['is_archived']);
            $archivedAt = $isArchived
                ? ($variant !== null && $variant->archived_at !== null ? $variant->archived_at : now())
                : null;
            $isActive = $isArchived ? false : (bool) ($vData['is_active'] ?? true);

            $skuUpper = strtoupper(trim((string) $vData['sku']));
            $gtin = array_key_exists('gtin', $vData) ? (trim((string) $vData['gtin']) ?: null) : $variant?->gtin;

            $attrs = [
                'product_id' => $product->id,
                'sku' => $skuUpper,
                'gtin' => $gtin,
                'supplier_code' => array_key_exists('supplier_code', $vData) ? (trim((string) $vData['supplier_code']) ?: null) : $variant?->supplier_code,
                'name' => $mappedOptions['display_name'] !== '' ? $mappedOptions['display_name'] : (string) $vData['name'],
                'option_values' => $mappedOptions['option_values'] !== [] ? $mappedOptions['option_values'] : ($variant?->option_values),
                'variant_signature' => $mappedOptions['signature'] !== '' ? $mappedOptions['signature'] : ($variant?->variant_signature),
                'shade_code' => array_key_exists('shade_code', $vData) ? (trim((string) $vData['shade_code']) ?: null) : $variant?->shade_code,
                'color_family' => array_key_exists('color_family', $vData) ? (trim((string) $vData['color_family']) ?: null) : $variant?->color_family,
                'color_hex' => array_key_exists('color_hex', $vData) ? (trim((string) $vData['color_hex']) ?: null) : ($mappedOptions['first_hex'] ?? $variant?->color_hex),
                'swatch_image_path' => array_key_exists('swatch_image_path', $vData) ? (trim((string) $vData['swatch_image_path']) ?: null) : $variant?->swatch_image_path,
                'image_path' => $resolvedImagePath,
                'image_id' => $resolvedImageId,
                'inherits_image' => $inheritsImage,
                'sort_order' => (int) ($vData['sort_order'] ?? $idx),
                'price_cents' => $resolvedPriceCents,
                'promo_price_cents' => $resolvedPromoCents,
                'inherits_price' => $inheritsPrice,
                'inherits_promo_price' => $inheritsPromo,
                'cost_cents' => ($canWriteCost && array_key_exists('cost_cents', $vData))
                    ? $vData['cost_cents']
                    : $variant?->cost_cents,
                'weight_grams' => $resolvedWeightGrams,
                'inherits_weight' => $inheritsWeight,
                'min_stock_alert' => (int) ($vData['min_stock_alert'] ?? ($variant !== null ? $variant->min_stock_alert : 5)),
                'is_default' => ! $isArchived && (! empty($vData['is_default']) || $idx === 0),
                'is_active' => $isActive,
                'archived_at' => $archivedAt,
            ];

            if ($variant) {
                $oldQty = (int) $variant->stock_qty;
                $newQty = (int) ($vData['stock_qty'] ?? $oldQty);
                $variant->update($attrs);
                if ($newQty !== $oldQty) {
                    $this->inventory->adjustStock(
                        $variant,
                        $newQty - $oldQty,
                        InventoryMovementType::Adjustment,
                        $actor,
                        'Edição direta no cadastro de variações'
                    );
                }
            } else {
                $initialQty = (int) ($vData['stock_qty'] ?? 0);
                $variant = ProductVariant::query()->create(array_merge($attrs, [
                    'stock_qty' => 0,
                    'reserved_qty' => 0,
                ]));
                if ($initialQty > 0) {
                    $this->inventory->adjustStock(
                        $variant,
                        $initialQty,
                        InventoryMovementType::In,
                        $actor,
                        $convertedFromSimpleWithStock
                            ? 'Distribuição inicial de estoque por conversão em variações'
                            : 'Saldo inicial da variação'
                    );
                }
            }

            // Sync pivot variant_attribute_values combining explicit attribute_value_ids & resolved option mappings
            $pivotIds = array_values(array_unique(array_filter(array_merge(
                array_map('intval', $vData['attribute_value_ids'] ?? []),
                $mappedOptions['attribute_value_ids'],
            ))));
            if ($pivotIds !== [] || array_key_exists('option_values', $vData) || array_key_exists('attribute_value_ids', $vData)) {
                $variant->attributeValues()->sync($pivotIds);
            }

            $keptIds[] = $variant->id;
        }

        // Guarantee at least one active non-archived variant has is_default = true if any active exists
        $activeNonArchived = $product->variants()->whereNull('archived_at')->where('is_active', true)->orderBy('sort_order')->orderBy('id')->get();
        $firstActiveVariant = $activeNonArchived->first();
        if ($firstActiveVariant !== null && ! $activeNonArchived->contains('is_default', true)) {
            $firstActiveVariant->update(['is_default' => true]);
        }

        // Handle omitted variants cleanly: archive historical or stocked rows instead of breaking order references
        foreach ($existingVariants as $existingVariant) {
            if (in_array($existingVariant->id, $keptIds, true)) {
                continue;
            }
            $links = $this->inspectVariantLinks($existingVariant);
            if ($links['reservations_count'] > 0 || (int) $existingVariant->reserved_qty > 0) {
                throw ValidationException::withMessages([
                    'variants' => ["A variação {$existingVariant->name} ({$existingVariant->sku}) possui reserva ativa em checkout e não pode ser removida agora."],
                ]);
            }

            if ($links['has_history'] || (int) $existingVariant->stock_qty > 0) {
                if ((int) $existingVariant->stock_qty > 0) {
                    $this->inventory->adjustStock(
                        $existingVariant,
                        -(int) $existingVariant->stock_qty,
                        InventoryMovementType::Adjustment,
                        $actor,
                        'Arquivamento de variação na edição do produto'
                    );
                }
                $existingVariant->update([
                    'is_active' => false,
                    'is_default' => false,
                    'archived_at' => $existingVariant->archived_at ?? now(),
                ]);
            } else {
                $existingVariant->attributeValues()->detach();
                $existingVariant->delete();
            }
        }
    }

    /**
     * Archives an individual combination so it cannot be purchased while preserving all order/inventory history.
     *
     * @return array<string, mixed>
     */
    public function archiveVariant(Product $product, ProductVariant $variant, ?User $actor = null): array
    {
        if ((int) $variant->product_id !== (int) $product->id) {
            abort(404);
        }

        if ((int) $variant->reserved_qty > 0) {
            throw ValidationException::withMessages([
                'variant' => ["A variação {$variant->name} ({$variant->sku}) possui {$variant->reserved_qty} unidade(s) reservada(s) em pedidos pendentes."],
            ]);
        }

        DB::transaction(function () use ($variant, $product, $actor): void {
            if ((int) $variant->stock_qty > 0) {
                $this->inventory->adjustStock(
                    $variant,
                    -(int) $variant->stock_qty,
                    InventoryMovementType::Adjustment,
                    $actor,
                    'Combinação arquivada (saiu de linha)'
                );
            }

            $variant->update([
                'is_active' => false,
                'is_default' => false,
                'archived_at' => $variant->archived_at ?? now(),
            ]);

            $nextDefault = $product->variants()->whereNull('archived_at')->where('is_active', true)->orderBy('sort_order')->first();
            if ($nextDefault && ! $product->variants()->whereNull('archived_at')->where('is_default', true)->exists()) {
                $nextDefault->update(['is_default' => true]);
            }
        });

        return [
            'variant' => $variant->fresh(),
            'links' => $this->inspectVariantLinks($variant),
        ];
    }

    public function restoreVariant(Product $product, ProductVariant $variant): ProductVariant
    {
        if ((int) $variant->product_id !== (int) $product->id) {
            abort(404);
        }

        $variant->update([
            'archived_at' => null,
            'is_active' => true,
        ]);

        return $variant->fresh() ?? $variant;
    }

    private function resolveHasVariationsFlag(?Product $product, array $validated): bool
    {
        if (array_key_exists('has_variants', $validated)) {
            return (bool) $validated['has_variants'];
        }
        if (($validated['product_type'] ?? null) === ProductType::Variable->value) {
            return true;
        }
        if (is_array($validated['variants'] ?? null)) {
            if (count($validated['variants']) > 1) {
                return true;
            }
            $first = $validated['variants'][0] ?? null;
            if (is_array($first) && (
                trim((string) ($first['name'] ?? '')) !== '' && trim((string) ($first['name'] ?? '')) !== 'Padrão'
                || ! empty($first['option_values'])
                || ! empty($first['attribute_value_ids'])
            )) {
                return true;
            }
        }

        return $product !== null && $product->usesVariations() && ! array_key_exists('variants', $validated);
    }

    /**
     * @param  list<array<string, mixed>>  $imagesPayload
     */
    private function syncImagesPreservingIds(Product $product, array $imagesPayload): void
    {
        $existing = $product->images()->get()->keyBy('path');
        $keptIds = [];

        foreach ($imagesPayload as $index => $img) {
            $path = (string) ($img['path'] ?? '');
            if ($path === '') {
                continue;
            }
            /** @var ProductImage|null $matched */
            $matched = $existing->get($path);
            if ($matched) {
                $matched->update([
                    'alt_text' => $img['alt_text'] ?? $product->name,
                    'focal_point' => $img['focal_point'] ?? 'center',
                    'sort_order' => $index,
                    'is_primary' => ! empty($img['is_primary']) || $index === 0,
                ]);
                $keptIds[] = $matched->id;
            } else {
                $created = ProductImage::query()->create([
                    'product_id' => $product->id,
                    'disk' => 'public',
                    'path' => $path,
                    'alt_text' => $img['alt_text'] ?? $product->name,
                    'focal_point' => $img['focal_point'] ?? 'center',
                    'sort_order' => $index,
                    'is_primary' => ! empty($img['is_primary']) || $index === 0,
                ]);
                $keptIds[] = $created->id;
            }
        }

        foreach ($existing as $oldImg) {
            if (! in_array($oldImg->id, $keptIds, true)) {
                $oldImg->delete();
            }
        }
    }

    /**
     * @param  list<array<string, mixed>>  $rawAttributes
     * @return array{
     *   normalized: list<array<string, mixed>>,
     *   by_uid: array<string, array<string, mixed>>,
     *   by_slug_value: array<string, array<string, mixed>>
     * }
     */
    private function resolveVariationAttributes(array $rawAttributes): array
    {
        $normalized = [];
        $byUid = [];
        $bySlugValue = [];

        foreach ($rawAttributes as $aIdx => $rawAttr) {
            $attrName = trim((string) ($rawAttr['name'] ?? ''));
            if ($attrName === '') {
                continue;
            }

            $desiredSlug = trim((string) ($rawAttr['slug'] ?? ''));
            if ($desiredSlug === '') {
                $desiredSlug = Str::slug($attrName);
            }
            $displayType = ($rawAttr['display_type'] ?? '') === 'color_swatch' || $desiredSlug === 'cor'
                ? 'color_swatch'
                : 'pill';

            $attrModel = null;
            if (! empty($rawAttr['attribute_id'])) {
                $attrModel = Attribute::query()->find((int) $rawAttr['attribute_id']);
            }
            if (! $attrModel) {
                $attrModel = Attribute::query()->where('slug', $desiredSlug)->first();
            }
            if (! $attrModel) {
                $attrModel = Attribute::query()->create([
                    'name' => $attrName,
                    'slug' => $desiredSlug,
                    'display_type' => $displayType,
                    'is_filterable' => true,
                    'is_comparable' => $desiredSlug !== 'cor',
                    'sort_order' => (int) ($rawAttr['sort_order'] ?? ($aIdx + 1)),
                ]);
            }

            $normalizedValues = [];
            $rawValues = is_array($rawAttr['values'] ?? null) ? $rawAttr['values'] : [];
            $seenValueKeys = [];

            foreach ($rawValues as $vIdx => $rawVal) {
                $valLabel = is_array($rawVal) ? trim((string) ($rawVal['value'] ?? '')) : trim((string) $rawVal);
                if ($valLabel === '') {
                    continue;
                }
                $valSlug = Str::slug($valLabel);
                if ($valSlug === '' || isset($seenValueKeys[$valSlug])) {
                    continue;
                }
                $seenValueKeys[$valSlug] = true;

                $colorHex = is_array($rawVal) ? (trim((string) ($rawVal['color_hex'] ?? '')) ?: null) : null;
                $uid = is_array($rawVal) ? trim((string) ($rawVal['uid'] ?? '')) : '';

                $avModel = AttributeValue::query()
                    ->where('attribute_id', $attrModel->id)
                    ->where('slug', $valSlug)
                    ->first();

                if (! $avModel) {
                    $avModel = AttributeValue::query()->create([
                        'attribute_id' => $attrModel->id,
                        'value' => $valLabel,
                        'slug' => $valSlug,
                        'color_hex' => $colorHex,
                        'sort_order' => (int) (is_array($rawVal) ? ($rawVal['sort_order'] ?? ($vIdx + 1)) : ($vIdx + 1)),
                    ]);
                } elseif ($colorHex !== null && $avModel->color_hex === null) {
                    $avModel->update(['color_hex' => $colorHex]);
                }

                $entry = [
                    'attribute_id' => $attrModel->id,
                    'attribute_slug' => $attrModel->slug,
                    'attribute_name' => $attrName,
                    'display_type' => $displayType,
                    'value_id' => $avModel->id,
                    'uid' => $uid !== '' ? $uid : (string) $avModel->id,
                    'value' => $valLabel,
                    'slug' => $valSlug,
                    'color_hex' => $colorHex ?? $avModel->color_hex,
                    'sort_order' => $vIdx + 1,
                ];

                $normalizedValues[] = [
                    'value_id' => $avModel->id,
                    'uid' => $entry['uid'],
                    'value' => $valLabel,
                    'slug' => $valSlug,
                    'color_hex' => $entry['color_hex'],
                    'sort_order' => $vIdx + 1,
                ];

                $byUid[$entry['uid']] = $entry;
                $bySlugValue["{$attrModel->slug}|{$valSlug}"] = $entry;
                $bySlugValue["{$desiredSlug}|{$valSlug}"] = $entry;
            }

            if ($normalizedValues !== []) {
                $normalized[] = [
                    'attribute_id' => $attrModel->id,
                    'name' => $attrName,
                    'slug' => $attrModel->slug,
                    'display_type' => $displayType,
                    'sort_order' => (int) ($rawAttr['sort_order'] ?? ($aIdx + 1)),
                    'values' => $normalizedValues,
                ];
            }
        }

        return [
            'normalized' => $normalized,
            'by_uid' => $byUid,
            'by_slug_value' => $bySlugValue,
        ];
    }

    /**
     * @param  array<string, mixed>  $vData
     * @param  array{normalized: list<array<string, mixed>>, by_uid: array<string, array<string, mixed>>, by_slug_value: array<string, array<string, mixed>>}  $resolvedAttrs
     * @return array{display_name: string, option_values: list<array<string, mixed>>, signature: string, attribute_value_ids: list<int>, first_hex: ?string}
     */
    private function mapVariantOptions(array $vData, array $resolvedAttrs): array
    {
        $rawOpts = is_array($vData['option_values'] ?? null) ? $vData['option_values'] : [];
        $mapped = [];
        $attrValueIds = [];
        $displayParts = [];
        $firstHex = null;

        foreach ($rawOpts as $opt) {
            if (! is_array($opt)) {
                continue;
            }
            $uid = trim((string) ($opt['uid'] ?? ''));
            $attrSlug = Str::slug((string) ($opt['attribute_slug'] ?? $opt['attribute_name'] ?? ''));
            $valSlug = Str::slug((string) ($opt['value'] ?? ''));

            $resolved = ($uid !== '' && isset($resolvedAttrs['by_uid'][$uid]))
                ? $resolvedAttrs['by_uid'][$uid]
                : ($resolvedAttrs['by_slug_value']["{$attrSlug}|{$valSlug}"] ?? null);

            if ($resolved) {
                $mapped[] = [
                    'attribute_id' => $resolved['attribute_id'],
                    'attribute_slug' => $resolved['attribute_slug'],
                    'attribute_name' => $resolved['attribute_name'],
                    'value_id' => $resolved['value_id'],
                    'uid' => $resolved['uid'],
                    'value' => $resolved['value'],
                    'value_slug' => $resolved['slug'],
                    'color_hex' => $resolved['color_hex'],
                ];
                $attrValueIds[] = (int) $resolved['value_id'];
                $displayParts[] = $resolved['value'];
                if ($firstHex === null && ! empty($resolved['color_hex'])) {
                    $firstHex = (string) $resolved['color_hex'];
                }
            } elseif (! empty($opt['value'])) {
                $valStr = trim((string) $opt['value']);
                $mapped[] = [
                    'attribute_id' => $opt['attribute_id'] ?? null,
                    'attribute_slug' => $attrSlug ?: 'opcao',
                    'attribute_name' => (string) ($opt['attribute_name'] ?? 'Opção'),
                    'value_id' => $opt['value_id'] ?? null,
                    'uid' => $uid ?: $valSlug,
                    'value' => $valStr,
                    'value_slug' => $valSlug,
                    'color_hex' => $opt['color_hex'] ?? null,
                ];
                $displayParts[] = $valStr;
            }
        }

        return [
            'display_name' => $displayParts !== [] ? implode(' · ', $displayParts) : trim((string) ($vData['name'] ?? '')),
            'option_values' => $mapped,
            'signature' => $this->signatureFromMapped($mapped),
            'attribute_value_ids' => array_values(array_unique($attrValueIds)),
            'first_hex' => $firstHex,
        ];
    }

    /** @param array<string, mixed> $vData */
    private function extractSignatureFromInput(array $vData): string
    {
        if (is_array($vData['option_values'] ?? null) && $vData['option_values'] !== []) {
            $pairs = [];
            foreach ($vData['option_values'] as $opt) {
                if (! is_array($opt)) {
                    continue;
                }
                $a = Str::slug((string) ($opt['attribute_slug'] ?? $opt['attribute_name'] ?? ''));
                $v = Str::slug((string) ($opt['value'] ?? ''));
                if ($a !== '' && $v !== '') {
                    $pairs[$a] = "{$a}={$v}";
                }
            }
            if ($pairs !== []) {
                ksort($pairs);

                return implode('|', $pairs);
            }
        }

        $name = Str::slug((string) ($vData['name'] ?? ''));

        return $name !== '' ? "nome={$name}" : '';
    }

    /** @param list<array<string, mixed>> $mapped */
    private function signatureFromMapped(array $mapped): string
    {
        if ($mapped === []) {
            return '';
        }
        $pairs = [];
        foreach ($mapped as $entry) {
            $a = (string) ($entry['attribute_slug'] ?? '');
            $v = (string) ($entry['value_slug'] ?? Str::slug((string) ($entry['value'] ?? '')));
            if ($a !== '' && $v !== '') {
                $pairs[$a] = "{$a}={$v}";
            }
        }
        ksort($pairs);

        return implode('|', $pairs);
    }

    /**
     * @param  array<string, mixed>  $validated
     */
    private function syncAsSimpleProduct(Product $product, array $validated, bool $updating, bool $wasVariable, ?User $actor): void
    {
        $canWriteCost = $actor?->hasPermission('catalog.cost.write') ?? false;
        $submitted = is_array($validated['variants'] ?? null) ? ($validated['variants'][0] ?? null) : null;
        $targetStock = (int) ($validated['stock_qty'] ?? ($submitted['stock_qty'] ?? 0));

        if ($wasVariable && $updating) {
            $existingActive = $product->variants()->whereNull('archived_at')->get();
            if (! array_key_exists('stock_qty', $validated) && $submitted === null) {
                $targetStock = (int) $existingActive->sum('stock_qty');
            }

            foreach ($existingActive as $oldVar) {
                if ((int) $oldVar->stock_qty > 0) {
                    $this->inventory->adjustStock(
                        $oldVar,
                        -(int) $oldVar->stock_qty,
                        InventoryMovementType::Adjustment,
                        $actor,
                        'Consolidação ao desativar variações'
                    );
                }
                $links = $this->inspectVariantLinks($oldVar);
                if ($links['has_history']) {
                    $oldVar->update([
                        'is_active' => false,
                        'is_default' => false,
                        'archived_at' => $oldVar->archived_at ?? now(),
                    ]);
                } else {
                    $oldVar->attributeValues()->detach();
                    $oldVar->delete();
                }
            }
        }

        // Reuse existing non-archived simple 'Padrão' variant if present
        $defaultVariant = $product->variants()
            ->whereNull('archived_at')
            ->orderBy('id')
            ->first();

        $primaryImgPath = $product->images()->where('is_primary', true)->value('path')
            ?? $product->images()->value('path');

        // Guarantee SKU availability if an archived variant already owns $product->sku
        $simpleSku = strtoupper($product->sku);
        $skuConflictArchived = ProductVariant::query()
            ->where('product_id', $product->id)
            ->whereRaw('UPPER(sku) = ?', [$simpleSku])
            ->whereNotNull('archived_at')
            ->first();
        if ($skuConflictArchived && (! $defaultVariant || $defaultVariant->id !== $skuConflictArchived->id)) {
            $simpleSku = $simpleSku.'-UN';
        }

        if ($defaultVariant) {
            $oldQty = (int) $defaultVariant->stock_qty;
            $defaultVariant->update([
                'sku' => $simpleSku,
                'gtin' => $product->gtin,
                'supplier_code' => $product->supplier_code,
                'name' => 'Padrão',
                'option_values' => null,
                'variant_signature' => null,
                'shade_code' => null,
                'color_family' => null,
                'color_hex' => null,
                'image_path' => $primaryImgPath,
                'inherits_image' => true,
                'price_cents' => $product->price_cents,
                'promo_price_cents' => $product->promo_price_cents,
                'inherits_price' => true,
                'inherits_promo_price' => true,
                'cost_cents' => $canWriteCost ? $product->cost_cents : $defaultVariant->cost_cents,
                'weight_grams' => null,
                'inherits_weight' => true,
                'is_default' => true,
                'is_active' => true,
                'archived_at' => null,
            ]);
            $defaultVariant->attributeValues()->detach();
            if ($targetStock !== $oldQty && ($wasVariable || array_key_exists('stock_qty', $validated) || $submitted !== null)) {
                $this->inventory->adjustStock(
                    $defaultVariant,
                    $targetStock - $oldQty,
                    InventoryMovementType::Adjustment,
                    $actor,
                    $wasVariable ? 'Consolidação de estoque ao converter para produto simples' : 'Edição direta no cadastro do produto'
                );
            }
        } else {
            $defaultVariant = ProductVariant::query()->create([
                'product_id' => $product->id,
                'sku' => $simpleSku,
                'gtin' => $product->gtin,
                'supplier_code' => $product->supplier_code,
                'name' => 'Padrão',
                'image_path' => $primaryImgPath,
                'inherits_image' => true,
                'price_cents' => $product->price_cents,
                'promo_price_cents' => $product->promo_price_cents,
                'inherits_price' => true,
                'inherits_promo_price' => true,
                'cost_cents' => $canWriteCost ? $product->cost_cents : null,
                'weight_grams' => null,
                'inherits_weight' => true,
                'stock_qty' => 0,
                'reserved_qty' => 0,
                'min_stock_alert' => 5,
                'is_default' => true,
                'is_active' => true,
            ]);
            if ($targetStock > 0) {
                $this->inventory->adjustStock(
                    $defaultVariant,
                    $targetStock,
                    InventoryMovementType::In,
                    $actor,
                    $wasVariable ? 'Consolidação de estoque ao converter para produto simples' : 'Saldo inicial do produto'
                );
            }
        }
    }

    /**
     * Converts a previously simple product's single 'Padrão' variant safely before creating split variations.
     *
     * @param  list<array<string, mixed>>  $incomingVariants
     */
    private function releaseLegacySimpleVariantBeforeConversion(Product $product, array $incomingVariants, ?User $actor): void
    {
        /** @var Collection<int, ProductVariant> $oldSimpleVariants */
        $oldSimpleVariants = $product->variants()->whereNull('archived_at')->get();
        $incomingIds = array_values(array_filter(array_map(fn (array $v): int => (int) ($v['id'] ?? 0), $incomingVariants)));

        foreach ($oldSimpleVariants as $oldVar) {
            if (in_array($oldVar->id, $incomingIds, true)) {
                continue;
            }
            if ((int) $oldVar->reserved_qty > 0) {
                throw ValidationException::withMessages([
                    'variants' => ["O produto possui {$oldVar->reserved_qty} unidade(s) reservada(s) em checkout ativo; aguarde liberação antes de converter."],
                ]);
            }

            if ((int) $oldVar->stock_qty > 0) {
                $this->inventory->adjustStock(
                    $oldVar,
                    -(int) $oldVar->stock_qty,
                    InventoryMovementType::Adjustment,
                    $actor,
                    'Conversão de produto simples para variações'
                );
            }

            $links = $this->inspectVariantLinks($oldVar);
            if ($links['has_history']) {
                // Free the product SKU if a newly added variation reuses it while preserving OrderItem sku_snapshot
                $incomingSkus = array_map(fn (array $v): string => strtoupper(trim((string) ($v['sku'] ?? ''))), $incomingVariants);
                $updatedSku = in_array(strtoupper($oldVar->sku), $incomingSkus, true)
                    ? strtoupper($oldVar->sku).'-ARC-'.$oldVar->id
                    : $oldVar->sku;

                $oldVar->update([
                    'sku' => $updatedSku,
                    'is_active' => false,
                    'is_default' => false,
                    'archived_at' => now(),
                ]);
            } else {
                $oldVar->attributeValues()->detach();
                $oldVar->delete();
            }
        }
    }
}
