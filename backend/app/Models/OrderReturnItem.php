<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $order_return_id
 * @property int $order_item_id
 * @property int|null $product_variant_id
 * @property int $returned_qty
 * @property int $restocked_qty
 * @property int|null $unit_cost_cents_snapshot
 * @property int $revenue_reversed_cents
 * @property int|null $cogs_reversed_cents
 */
#[Fillable([
    'order_return_id',
    'order_item_id',
    'product_variant_id',
    'returned_qty',
    'restocked_qty',
    'unit_cost_cents_snapshot',
    'revenue_reversed_cents',
    'cogs_reversed_cents',
])]
class OrderReturnItem extends Model
{
    /** @return BelongsTo<OrderReturn, $this> */
    public function orderReturn(): BelongsTo
    {
        return $this->belongsTo(OrderReturn::class);
    }

    /** @return BelongsTo<OrderItem, $this> */
    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class);
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    protected function casts(): array
    {
        return [
            'returned_qty' => 'integer',
            'restocked_qty' => 'integer',
            'unit_cost_cents_snapshot' => 'integer',
            'revenue_reversed_cents' => 'integer',
            'cogs_reversed_cents' => 'integer',
        ];
    }
}
