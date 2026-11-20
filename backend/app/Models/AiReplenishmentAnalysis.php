<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int|null $execution_id
 * @property int|null $user_id
 * @property string $trigger_type
 * @property int $analysis_period
 * @property int $default_lead_time_days
 * @property int $safety_stock_days
 * @property int $target_coverage_days
 * @property string $status
 * @property array<string, mixed>|null $summary_kpis
 * @property CarbonInterface|null $created_at
 */
#[Fillable([
    'execution_id', 'user_id', 'trigger_type', 'analysis_period',
    'default_lead_time_days', 'safety_stock_days', 'target_coverage_days',
    'status', 'summary_kpis',
])]
class AiReplenishmentAnalysis extends Model
{
    /** @return BelongsTo<AiExecution, $this> */
    public function execution(): BelongsTo
    {
        return $this->belongsTo(AiExecution::class, 'execution_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return HasMany<AiReplenishmentSuggestion, $this> */
    public function suggestions(): HasMany
    {
        return $this->hasMany(AiReplenishmentSuggestion::class, 'analysis_id');
    }

    protected function casts(): array
    {
        return [
            'analysis_period' => 'integer',
            'default_lead_time_days' => 'integer',
            'safety_stock_days' => 'integer',
            'target_coverage_days' => 'integer',
            'summary_kpis' => 'array',
        ];
    }
}
