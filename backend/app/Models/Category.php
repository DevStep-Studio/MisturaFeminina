<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Catalog\Services\CategoryHierarchyService;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['parent_id', 'name', 'slug', 'description', 'image_path', 'banner_desktop_path', 'banner_mobile_path', 'icon', 'sort_order', 'show_in_menu', 'is_active', 'seo_title', 'seo_description'])]
class Category extends Model
{
    protected static function booted(): void
    {
        static::saved(function (): void {
            app(CategoryHierarchyService::class)->clearCaches();
        });

        static::deleted(function (): void {
            app(CategoryHierarchyService::class)->clearCaches();
        });
    }
    /** @return BelongsTo<Category, $this> */
    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    /** @return HasMany<Category, $this> */
    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('sort_order')->orderBy('name');
    }

    /** @return HasMany<Category, $this> */
    public function allChildren(): HasMany
    {
        return $this->children()->with('allChildren');
    }

    /** @return BelongsToMany<Product, $this> */
    public function products(): BelongsToMany
    {
        $rel = $this->belongsToMany(Product::class, 'category_product');

        return CategoryHierarchyService::hasPrimaryPivotColumn()
            ? $rel->withPivot('is_primary')
            : $rel;
    }

    /** @return BelongsToMany<Attribute, $this> */
    public function attributes(): BelongsToMany
    {
        return $this->belongsToMany(Attribute::class, 'category_attributes')
            ->withPivot(['is_filterable', 'is_comparable', 'sort_order'])
            ->orderByPivot('sort_order');
    }

    /** @param Builder<Category> $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    protected function casts(): array
    {
        return [
            'parent_id' => 'integer',
            'sort_order' => 'integer',
            'show_in_menu' => 'boolean',
            'is_active' => 'boolean',
        ];
    }
}
