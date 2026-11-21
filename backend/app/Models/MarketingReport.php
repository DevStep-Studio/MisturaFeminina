<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property string $title
 * @property string $period_range
 * @property CarbonInterface $period_start
 * @property CarbonInterface $period_end
 * @property string|null $summary_text
 * @property array<string, mixed>|null $metrics_payload
 * @property int|null $created_by_user_id
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 */
#[Fillable([
    'title',
    'period_range',
    'period_start',
    'period_end',
    'summary_text',
    'metrics_payload',
    'created_by_user_id',
])]
class MarketingReport extends Model
{
    /** @return BelongsTo<User, $this> */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    protected function casts(): array
    {
        return [
            'period_start' => 'date',
            'period_end' => 'date',
            'metrics_payload' => 'array',
        ];
    }
}
