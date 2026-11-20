<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $execution_id
 * @property string $event_type
 * @property string|null $tool_name
 * @property string|null $message
 * @property array<string, mixed>|null $metadata
 * @property CarbonInterface|null $created_at
 */
#[Fillable(['execution_id', 'event_type', 'tool_name', 'message', 'metadata', 'created_at'])]
class AiExecutionEvent extends Model
{
    public $timestamps = false;

    /** @return BelongsTo<AiExecution, $this> */
    public function execution(): BelongsTo
    {
        return $this->belongsTo(AiExecution::class, 'execution_id');
    }

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'created_at' => 'datetime',
        ];
    }
}
