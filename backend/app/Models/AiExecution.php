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
 * @property int $agent_id
 * @property int|null $user_id
 * @property string $status
 * @property string $execution_mode
 * @property string $provider
 * @property string|null $model_name
 * @property string|null $context_type
 * @property int|null $context_id
 * @property string|null $input_reference
 * @property string|null $result_reference
 * @property array<string, mixed>|null $input_payload
 * @property array<string, mixed>|null $output_payload
 * @property array<int, array<string, mixed>>|null $tool_calls
 * @property int $prompt_tokens
 * @property int $completion_tokens
 * @property int $total_tokens
 * @property float $estimated_cost_usd
 * @property int|null $duration_ms
 * @property string|null $error_code
 * @property string|null $error_message
 * @property CarbonInterface|null $started_at
 * @property CarbonInterface|null $finished_at
 * @property CarbonInterface|null $created_at
 */
#[Fillable([
    'agent_id', 'user_id', 'status', 'execution_mode', 'provider', 'model_name',
    'context_type', 'context_id', 'input_reference', 'result_reference',
    'input_payload', 'output_payload', 'tool_calls',
    'prompt_tokens', 'completion_tokens', 'total_tokens', 'estimated_cost_usd',
    'duration_ms', 'error_code', 'error_message', 'started_at', 'finished_at',
])]
class AiExecution extends Model
{
    /** @return BelongsTo<AiAgent, $this> */
    public function agent(): BelongsTo
    {
        return $this->belongsTo(AiAgent::class, 'agent_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return HasMany<AiExecutionEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(AiExecutionEvent::class, 'execution_id')->orderBy('id');
    }

    protected function casts(): array
    {
        return [
            'input_payload' => 'array',
            'output_payload' => 'array',
            'tool_calls' => 'array',
            'prompt_tokens' => 'integer',
            'completion_tokens' => 'integer',
            'total_tokens' => 'integer',
            'estimated_cost_usd' => 'float',
            'duration_ms' => 'integer',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }
}
