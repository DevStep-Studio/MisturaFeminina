<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $replenishment_list_id
 * @property int $product_id
 * @property int $product_variant_id
 * @property int $desired_quantity
 * @property-read ReplenishmentList $replenishmentList
 * @property-read Product|null $product
 * @property-read ProductVariant|null $variant
 */
#[Fillable(['replenishment_list_id', 'product_id', 'product_variant_id', 'desired_quantity'])]
class ReplenishmentListItem extends Model
{
    /** @return BelongsTo<ReplenishmentList, $this> */
    public function replenishmentList(): BelongsTo
    {
        return $this->belongsTo(ReplenishmentList::class);
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
            'desired_quantity' => 'integer',
        ];
    }
}
