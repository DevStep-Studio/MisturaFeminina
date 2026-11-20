<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Shared\Enums\ProductType;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property ProductType $product_type
 * @property int $price_cents
 * @property int|null $promo_price_cents
 * @property CarbonInterface|null $promo_starts_at
 * @property CarbonInterface|null $promo_ends_at
 * @property array<int, string>|null $tags
 * @property array<int, array<string, mixed>>|null $wholesale_tiers
 * @property bool $is_active
 * @property bool $is_featured
 * @property bool $is_new_arrival
 * @property bool $is_best_seller
 * @property bool $wholesale_enabled
 * @property bool $wholesale_group_variants
 * @property-read Brand|null $brand
 */
#[Fillable([
    'brand_id', 'name', 'slug', 'sku', 'gtin', 'manufacturer',
    'short_description', 'description', 'ingredients', 'usage_instructions',
    'product_type', 'cost_cents', 'price_cents', 'promo_price_cents',
    'promo_starts_at', 'promo_ends_at', 'unit_label', 'unit_quantity',
    'weight_grams', 'width_cm', 'height_cm', 'length_cm', 'video_url',
    'tags', 'is_active', 'is_featured', 'is_new_arrival', 'is_best_seller',
    'wholesale_enabled', 'wholesale_group_variants', 'wholesale_tiers', 'sales_count',
    'seo_title', 'seo_description',
])]
class Product extends Model
{
    use SoftDeletes;

    /** @return BelongsTo<Brand, $this> */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class);
    }

    /** @return BelongsToMany<Category, $this> */
    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'category_product');
    }

    /** @return HasMany<ProductImage, $this> */
    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderBy('sort_order');
    }

    /** @return HasMany<ProductVariant, $this> */
    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)->orderBy('sort_order')->orderBy('id');
    }

    /** @return BelongsToMany<AttributeValue, $this> */
    public function attributeValues(): BelongsToMany
    {
        return $this->belongsToMany(AttributeValue::class, 'product_attribute_values')->with('attribute');
    }

    /** @return HasMany<ProductKitItem, $this> */
    public function kitItems(): HasMany
    {
        return $this->hasMany(ProductKitItem::class, 'kit_product_id');
    }

    /** @return HasMany<Review, $this> */
    public function reviews(): HasMany
    {
        return $this->hasMany(Review::class);
    }

    public function effectivePriceCents(): int
    {
        if ($this->promo_price_cents !== null && $this->promo_price_cents > 0 && $this->promo_price_cents < $this->price_cents) {
            $now = now();
            $afterStart = $this->promo_starts_at === null || $now->greaterThanOrEqualTo($this->promo_starts_at);
            $beforeEnd = $this->promo_ends_at === null || $now->lessThanOrEqualTo($this->promo_ends_at);
            if ($afterStart && $beforeEnd) {
                return (int) $this->promo_price_cents;
            }
        }

        return (int) $this->price_cents;
    }

    protected function casts(): array
    {
        return [
            'product_type' => ProductType::class,
            'cost_cents' => 'integer',
            'price_cents' => 'integer',
            'promo_price_cents' => 'integer',
            'promo_starts_at' => 'datetime',
            'promo_ends_at' => 'datetime',
            'unit_quantity' => 'integer',
            'weight_grams' => 'integer',
            'width_cm' => 'integer',
            'height_cm' => 'integer',
            'length_cm' => 'integer',
            'tags' => 'array',
            'is_active' => 'boolean',
            'is_featured' => 'boolean',
            'is_new_arrival' => 'boolean',
            'is_best_seller' => 'boolean',
            'wholesale_enabled' => 'boolean',
            'wholesale_group_variants' => 'boolean',
            'wholesale_tiers' => 'array',
            'sales_count' => 'integer',
        ];
    }
}
