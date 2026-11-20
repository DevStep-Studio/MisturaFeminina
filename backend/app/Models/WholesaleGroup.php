<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug', 'description', 'status'])]
class WholesaleGroup extends Model
{
    /** @return HasMany<WholesaleGroupItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(WholesaleGroupItem::class, 'wholesale_group_id');
    }

    /** @return BelongsToMany<Product, $this> */
    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'wholesale_group_items', 'wholesale_group_id', 'product_id')
            ->withPivot(['product_variant_id'])
            ->withTimestamps();
    }
}
