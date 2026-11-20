<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $name
 * @property string $slug
 * @property string $display_type
 * @property bool $is_filterable
 * @property bool $is_comparable
 * @property string|null $unit
 * @property int $sort_order
 */
#[Fillable(['name', 'slug', 'display_type', 'is_filterable', 'is_comparable', 'unit', 'sort_order'])]
class Attribute extends Model
{
    /** @return HasMany<AttributeValue, $this> */
    public function values(): HasMany
    {
        return $this->hasMany(AttributeValue::class)->orderBy('sort_order')->orderBy('id');
    }

    /** @return BelongsToMany<Category, $this> */
    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(Category::class, 'category_attributes')
            ->withPivot(['is_filterable', 'is_comparable', 'sort_order']);
    }

    protected function casts(): array
    {
        return [
            'is_filterable' => 'boolean',
            'is_comparable' => 'boolean',
            'sort_order' => 'integer',
        ];
    }
}
