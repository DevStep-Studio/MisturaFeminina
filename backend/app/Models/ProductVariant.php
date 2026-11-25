<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $price_cents
 * @property int|null $promo_price_cents
 * @property int|null $cost_cents
 * @property int $stock_qty
 * @property int $reserved_qty
 * @property int $min_stock_alert
 * @property int|null $weight_grams
 * @property string|null $shade_code
 * @property string|null $color_family
 * @property string|null $color_hex
 * @property string|null $swatch_image_path
 * @property string|null $image_path
 * @property array<int, array<string, mixed>>|null $option_values
 * @property string|null $variant_signature
 * @property bool $inherits_price
 * @property bool $inherits_promo_price
 * @property bool $inherits_weight
 * @property bool $inherits_image
 * @property int $sort_order
 * @property bool $is_default
 * @property bool $is_active
 * @property CarbonInterface|null $archived_at
 * @property-read Product|null $product
 * @property-read ProductImage|null $image
 */
#[Fillable(['product_id', 'sku', 'gtin', 'supplier_code', 'name', 'option_values', 'variant_signature', 'shade_code', 'color_family', 'color_hex', 'swatch_image_path', 'image_path', 'price_cents', 'promo_price_cents', 'inherits_price', 'inherits_promo_price', 'cost_cents', 'stock_qty', 'reserved_qty', 'min_stock_alert', 'weight_grams', 'inherits_weight', 'width_cm', 'height_cm', 'length_cm', 'image_id', 'inherits_image', 'is_default', 'is_active', 'archived_at', 'sort_order'])]
#[Hidden(['cost_cents'])]
class ProductVariant extends Model
{
    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** @return BelongsTo<ProductImage, $this> */
    public function image(): BelongsTo
    {
        return $this->belongsTo(ProductImage::class, 'image_id');
    }

    /** @return BelongsToMany<AttributeValue, $this> */
    public function attributeValues(): BelongsToMany
    {
        return $this->belongsToMany(AttributeValue::class, 'variant_attribute_values')->with('attribute');
    }

    /** @return HasMany<InventoryMovement, $this> */
    public function inventoryMovements(): HasMany
    {
        return $this->hasMany(InventoryMovement::class);
    }

    /** @return HasMany<RestockRequest, $this> */
    public function restockRequests(): HasMany
    {
        return $this->hasMany(RestockRequest::class, 'product_variant_id');
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    public function availableStock(): int
    {
        return max(0, (int) $this->stock_qty - (int) $this->reserved_qty);
    }

    public function isSellable(): bool
    {
        return $this->is_active && $this->archived_at === null && $this->availableStock() > 0;
    }

    public function effectiveWeightGrams(): int
    {
        $product = $this->product;

        return (int) ($this->weight_grams ?? ($product !== null ? $product->weight_grams : 200));
    }

    public function effectiveImagePath(): ?string
    {
        return $this->image_path ?: $this->image?->path ?: null;
    }

    public function effectivePriceCents(): int
    {
        $product = $this->product;
        if ($this->promo_price_cents !== null && $this->promo_price_cents > 0 && $this->promo_price_cents < $this->price_cents) {
            if (! $product) {
                return (int) $this->promo_price_cents;
            }
            $now = now();
            $afterStart = $product->promo_starts_at === null || $now->greaterThanOrEqualTo($product->promo_starts_at);
            $beforeEnd = $product->promo_ends_at === null || $now->lessThanOrEqualTo($product->promo_ends_at);
            if ($afterStart && $beforeEnd) {
                return (int) $this->promo_price_cents;
            }
        }

        return (int) $this->price_cents;
    }

    public function effectiveCostCents(): ?int
    {
        if ($this->cost_cents !== null) {
            return (int) $this->cost_cents;
        }

        if ($this->product?->cost_cents !== null) {
            return (int) $this->product->cost_cents;
        }

        return null;
    }

    public function effectiveCostSource(): string
    {
        if ($this->cost_cents !== null) {
            return 'variant_cost';
        }

        if ($this->product?->cost_cents !== null) {
            return 'product_cost';
        }

        return 'missing';
    }

    protected function casts(): array
    {
        return [
            'option_values' => 'array',
            'price_cents' => 'integer',
            'promo_price_cents' => 'integer',
            'inherits_price' => 'boolean',
            'inherits_promo_price' => 'boolean',
            'cost_cents' => 'integer',
            'stock_qty' => 'integer',
            'reserved_qty' => 'integer',
            'min_stock_alert' => 'integer',
            'weight_grams' => 'integer',
            'inherits_weight' => 'boolean',
            'width_cm' => 'integer',
            'height_cm' => 'integer',
            'length_cm' => 'integer',
            'inherits_image' => 'boolean',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
            'archived_at' => 'datetime',
            'sort_order' => 'integer',
        ];
    }
}
