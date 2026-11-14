<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $value
 * @property int $min_subtotal_cents
 * @property int|null $max_discount_cents
 * @property int|null $max_uses
 * @property int $max_uses_per_user
 * @property int $uses_count
 * @property bool $first_purchase_only
 * @property bool $is_cumulative
 * @property array<int, string>|null $allowed_states
 * @property array<int, int>|null $scope_ids
 * @property CarbonInterface|null $starts_at
 * @property CarbonInterface|null $ends_at
 * @property bool $is_active
 */
#[Fillable([
    'code', 'name', 'type', 'value', 'min_subtotal_cents', 'max_discount_cents',
    'max_uses', 'max_uses_per_user', 'uses_count', 'first_purchase_only',
    'is_cumulative', 'allowed_states', 'scope_type', 'scope_ids',
    'starts_at', 'ends_at', 'is_active',
])]
class Coupon extends Model
{
    protected function casts(): array
    {
        return [
            'value' => 'integer',
            'min_subtotal_cents' => 'integer',
            'max_discount_cents' => 'integer',
            'max_uses' => 'integer',
            'max_uses_per_user' => 'integer',
            'uses_count' => 'integer',
            'first_purchase_only' => 'boolean',
            'is_cumulative' => 'boolean',
            'allowed_states' => 'array',
            'scope_ids' => 'array',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }
}
