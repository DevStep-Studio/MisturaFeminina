<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $value
 * @property array<int, int>|null $scope_ids
 * @property int $min_qty
 * @property int $min_subtotal_cents
 * @property int $priority
 * @property bool $is_cumulative
 * @property CarbonInterface|null $starts_at
 * @property CarbonInterface|null $ends_at
 * @property bool $is_active
 */
#[Fillable(['name', 'rule_type', 'discount_type', 'value', 'scope_type', 'scope_ids', 'min_qty', 'min_subtotal_cents', 'priority', 'is_cumulative', 'starts_at', 'ends_at', 'is_active'])]
class Promotion extends Model
{
    protected function casts(): array
    {
        return [
            'value' => 'integer',
            'scope_ids' => 'array',
            'min_qty' => 'integer',
            'min_subtotal_cents' => 'integer',
            'priority' => 'integer',
            'is_cumulative' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }
}
