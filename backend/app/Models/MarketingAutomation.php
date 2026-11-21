<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $name
 * @property string $automation_type
 * @property string $schedule
 * @property bool $is_enabled
 * @property array<string, mixed>|null $parameters
 * @property CarbonInterface|null $last_run_at
 * @property string|null $last_status
 * @property array<string, mixed>|null $last_result
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 */
#[Fillable([
    'name',
    'automation_type',
    'schedule',
    'is_enabled',
    'parameters',
    'last_run_at',
    'last_status',
    'last_result',
])]
class MarketingAutomation extends Model
{
    protected function casts(): array
    {
        return [
            'is_enabled' => 'boolean',
            'parameters' => 'array',
            'last_run_at' => 'datetime',
            'last_result' => 'array',
        ];
    }
}
