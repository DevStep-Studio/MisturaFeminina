<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'order_id',
    'product_id',
    'product_variant_id',
    'product_name_snapshot',
    'variant_name_snapshot',
    'sku_snapshot',
    'quantity',
    'unit_price_cents',
    'discount_cents',
    'total_cents',
    'weight_grams_snapshot',
    'wholesale_rule_id',
    'wholesale_rule_name',
    'wholesale_tier_min_qty',
    'wholesale_discount_cents',
    'wholesale_unit_price_cents',
    'original_unit_price_cents',
])]
class OrderItem extends Model
{
    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    /** @return BelongsTo<WholesaleRule, $this> */
    public function wholesaleRule(): BelongsTo
    {
        return $this->belongsTo(WholesaleRule::class, 'wholesale_rule_id');
    }

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price_cents' => 'integer',
            'discount_cents' => 'integer',
            'total_cents' => 'integer',
            'weight_grams_snapshot' => 'integer',
            'wholesale_rule_id' => 'integer',
            'wholesale_tier_min_qty' => 'integer',
            'wholesale_discount_cents' => 'integer',
            'wholesale_unit_price_cents' => 'integer',
            'original_unit_price_cents' => 'integer',
        ];
    }
}
