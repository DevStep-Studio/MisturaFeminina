<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'wholesale_rule_id',
    'user_id',
    'action',
    'old_values',
    'new_values',
    'description',
])]
class WholesaleRuleAudit extends Model
{
    /** @return BelongsTo<WholesaleRule, $this> */
    public function rule(): BelongsTo
    {
        return $this->belongsTo(WholesaleRule::class, 'wholesale_rule_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    protected function casts(): array
    {
        return [
            'old_values' => 'array',
            'new_values' => 'array',
        ];
    }
}
