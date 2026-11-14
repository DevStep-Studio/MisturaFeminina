<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['order_id', 'product_id', 'product_variant_id', 'product_name_snapshot', 'variant_name_snapshot', 'sku_snapshot', 'quantity', 'unit_price_cents', 'discount_cents', 'total_cents', 'weight_grams_snapshot'])]
class OrderItem extends Model
{
    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price_cents' => 'integer',
            'discount_cents' => 'integer',
            'total_cents' => 'integer',
            'weight_grams_snapshot' => 'integer',
        ];
    }
}
