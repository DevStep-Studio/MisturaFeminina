<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $quantity
 * @property int $returned_qty
 * @property int $restocked_qty
 * @property int $unit_price_cents
 * @property int $discount_cents
 * @property int $order_discount_allocated_cents
 * @property int $total_cents
 * @property int|null $net_revenue_cents
 * @property int $returned_revenue_cents
 * @property int|null $unit_cost_cents_snapshot
 * @property string|null $cost_source
 * @property CarbonInterface|null $cost_recorded_at
 * @property CarbonInterface|null $cost_backfilled_at
 * @property int|null $cost_backfilled_by
 */
#[Fillable([
    'order_id',
    'product_id',
    'product_variant_id',
    'product_name_snapshot',
    'variant_name_snapshot',
    'sku_snapshot',
    'quantity',
    'returned_qty',
    'restocked_qty',
    'unit_price_cents',
    'discount_cents',
    'order_discount_allocated_cents',
    'total_cents',
    'net_revenue_cents',
    'returned_revenue_cents',
    'unit_cost_cents_snapshot',
    'cost_source',
    'cost_recorded_at',
    'cost_backfilled_at',
    'cost_backfilled_by',
    'weight_grams_snapshot',
    'wholesale_rule_id',
    'wholesale_rule_name',
    'wholesale_tier_min_qty',
    'wholesale_discount_cents',
    'wholesale_unit_price_cents',
    'original_unit_price_cents',
])]
#[Hidden([
    'unit_cost_cents_snapshot',
    'cost_source',
    'cost_recorded_at',
    'cost_backfilled_at',
    'cost_backfilled_by',
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

    /** @return BelongsTo<User, $this> */
    public function costBackfilledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cost_backfilled_by');
    }

    /** @return HasMany<OrderReturnItem, $this> */
    public function returnItems(): HasMany
    {
        return $this->hasMany(OrderReturnItem::class);
    }

    public function effectiveNetRevenueCents(): int
    {
        if ($this->net_revenue_cents !== null) {
            return (int) $this->net_revenue_cents;
        }

        return max(0, (int) $this->total_cents - (int) $this->order_discount_allocated_cents);
    }

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'returned_qty' => 'integer',
            'restocked_qty' => 'integer',
            'unit_price_cents' => 'integer',
            'discount_cents' => 'integer',
            'order_discount_allocated_cents' => 'integer',
            'total_cents' => 'integer',
            'net_revenue_cents' => 'integer',
            'returned_revenue_cents' => 'integer',
            'unit_cost_cents_snapshot' => 'integer',
            'cost_recorded_at' => 'datetime',
            'cost_backfilled_at' => 'datetime',
            'cost_backfilled_by' => 'integer',
            'weight_grams_snapshot' => 'integer',
            'wholesale_rule_id' => 'integer',
            'wholesale_tier_min_qty' => 'integer',
            'wholesale_discount_cents' => 'integer',
            'wholesale_unit_price_cents' => 'integer',
            'original_unit_price_cents' => 'integer',
        ];
    }
}
