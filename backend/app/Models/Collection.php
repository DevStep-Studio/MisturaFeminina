<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

#[Fillable(['name', 'slug', 'description', 'is_active'])]
class Collection extends Model
{
    /** @return BelongsToMany<Product, $this> */
    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'collection_items')->withPivot('sort_order')->orderBy('collection_items.sort_order');
    }

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }
}
