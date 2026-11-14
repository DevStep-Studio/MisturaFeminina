<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['kit_product_id', 'component_product_id', 'component_variant_id', 'quantity'])]
class ProductKitItem extends Model
{
    /** @return BelongsTo<Product, $this> */
    public function kitProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'kit_product_id');
    }

    /** @return BelongsTo<Product, $this> */
    public function componentProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'component_product_id');
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function componentVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'component_variant_id');
    }

    protected function casts(): array
    {
        return ['quantity' => 'integer'];
    }
}
