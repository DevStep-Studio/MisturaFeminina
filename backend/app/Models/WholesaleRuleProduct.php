<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'wholesale_rule_id',
    'product_id',
    'product_variant_id',
    'category_id',
    'wholesale_group_id',
    'is_excluded',
])]
class WholesaleRuleProduct extends Model
{
    /** @return BelongsTo<WholesaleRule, $this> */
    public function rule(): BelongsTo
    {
        return $this->belongsTo(WholesaleRule::class, 'wholesale_rule_id');
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

    /** @return BelongsTo<Category, $this> */
    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'category_id');
    }

    /** @return BelongsTo<WholesaleGroup, $this> */
    public function group(): BelongsTo
    {
        return $this->belongsTo(WholesaleGroup::class, 'wholesale_group_id');
    }

    protected function casts(): array
    {
        return [
            'is_excluded' => 'boolean',
        ];
    }
}
