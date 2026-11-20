<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['wholesale_group_id', 'product_id', 'product_variant_id'])]
class WholesaleGroupItem extends Model
{
    /** @return BelongsTo<WholesaleGroup, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(WholesaleGroup::class, 'wholesale_group_id');
    }

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }
}
