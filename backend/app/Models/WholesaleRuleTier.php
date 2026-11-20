<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'wholesale_rule_id',
    'min_quantity',
    'max_quantity',
    'discount_type',
    'discount_value',
])]
class WholesaleRuleTier extends Model
{
    /** @return BelongsTo<WholesaleRule, $this> */
    public function rule(): BelongsTo
    {
        return $this->belongsTo(WholesaleRule::class, 'wholesale_rule_id');
    }

    protected function casts(): array
    {
        return [
            'min_quantity' => 'integer',
            'max_quantity' => 'integer',
            'discount_value' => 'float',
        ];
    }
}
