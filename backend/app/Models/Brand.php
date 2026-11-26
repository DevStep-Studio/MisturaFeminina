<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['name', 'slug', 'description', 'logo_path', 'is_featured', 'is_active', 'seo_title', 'seo_description'])]
class Brand extends Model
{
    protected static function booted(): void
    {
        static::saved(function (): void {
            \App\Http\Controllers\SeoController::clearCaches();
        });

        static::deleted(function (): void {
            \App\Http\Controllers\SeoController::clearCaches();
        });
    }

    /** @return HasMany<Product, $this> */
    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    protected function casts(): array
    {
        return [
            'is_featured' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
