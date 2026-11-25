<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $price_cents
 * @property int|null $promo_price_cents
 * @property int $stock_qty
 * @property int $reserved_qty
 * @property int $min_stock_alert
 * @property int|null $weight_grams
 * @property string|null $shade_code
 * @property string|null $color_family
 * @property string|null $color_hex
 * @property string|null $swatch_image_path
 * @property int $sort_order
 * @property bool $is_default
 * @property bool $is_active
 * @property-read Product|null $product
 * @property-read ProductImage|null $image
 */
#[Fillable(['product_id', 'sku', 'gtin', 'supplier_code', 'name', 'shade_code', 'color_family', 'color_hex', 'swatch_image_path', 'price_cents', 'promo_price_cents', 'stock_qty', 'reserved_qty', 'min_stock_alert', 'weight_grams', 'width_cm', 'height_cm', 'length_cm', 'image_id', 'is_default', 'is_active', 'sort_order'])]
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

    public function availableStock(): int
    {
        return max(0, (int) $this->stock_qty - (int) $this->reserved_qty);
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

    protected function casts(): array
    {
        return [
            'price_cents' => 'integer',
            'promo_price_cents' => 'integer',
            'stock_qty' => 'integer',
            'reserved_qty' => 'integer',
            'min_stock_alert' => 'integer',
            'weight_grams' => 'integer',
            'width_cm' => 'integer',
            'height_cm' => 'integer',
            'length_cm' => 'integer',
            'is_default' => 'boolean',
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
