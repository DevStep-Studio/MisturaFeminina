<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $assisted_order_id
 * @property int $product_id
 * @property int $product_variant_id
 * @property int $quantity
 * @property int $unit_price_cents
 */
#[Fillable(['assisted_order_id', 'product_id', 'product_variant_id', 'quantity', 'unit_price_cents'])]
class AssistedOrderItem extends Model
{
    /** @return BelongsTo<AssistedOrder, $this> */
    public function assistedOrder(): BelongsTo
    {
        return $this->belongsTo(AssistedOrder::class);
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

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price_cents' => 'integer',
        ];
    }
}
