<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int|null $execution_id
 * @property string $channel
 * @property string $type
 * @property string $title
 * @property string $description
 * @property array<string, mixed>|null $evidence_payload
 * @property array<string, mixed>|null $proposed_action
 * @property array<string, mixed>|null $before_state
 * @property array<string, mixed>|null $after_state
 * @property string $status
 * @property int|null $approved_by_user_id
 * @property CarbonInterface|null $applied_at
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 */
#[Fillable([
    'execution_id',
    'channel',
    'type',
    'title',
    'description',
    'evidence_payload',
    'proposed_action',
    'before_state',
    'after_state',
    'status',
    'approved_by_user_id',
    'applied_at',
])]
class MarketingRecommendation extends Model
{
    /** @return BelongsTo<AiExecution, $this> */
    public function execution(): BelongsTo
    {
        return $this->belongsTo(AiExecution::class, 'execution_id');
    }

    /** @return BelongsTo<User, $this> */
    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    protected function casts(): array
    {
        return [
            'evidence_payload' => 'array',
            'proposed_action' => 'array',
            'before_state' => 'array',
            'after_state' => 'array',
            'applied_at' => 'datetime',
        ];
    }
}
