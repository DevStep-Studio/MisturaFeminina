<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property string|null $task_key
 * @property string $title
 * @property string|null $description
 * @property string $task_type
 * @property string $priority
 * @property string $status
 * @property string|null $entity_type
 * @property int|null $entity_id
 * @property string|null $action_url
 * @property string $required_permission
 * @property int|null $assigned_to_user_id
 * @property int|null $created_by_user_id
 * @property CarbonInterface|null $due_at
 * @property CarbonInterface|null $completed_at
 * @property array<string, mixed>|null $metadata
 */
#[Fillable([
    'task_key', 'title', 'description', 'task_type', 'priority', 'status',
    'entity_type', 'entity_id', 'action_url', 'required_permission',
    'assigned_to_user_id', 'created_by_user_id', 'due_at', 'completed_at', 'metadata',
])]
class OperationalTask extends Model
{
    /** @return BelongsTo<User, $this> */
    public function assignedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to_user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    protected function casts(): array
    {
        return [
            'entity_id' => 'integer',
            'assigned_to_user_id' => 'integer',
            'created_by_user_id' => 'integer',
            'due_at' => 'datetime',
            'completed_at' => 'datetime',
            'metadata' => 'array',
        ];
    }
}
