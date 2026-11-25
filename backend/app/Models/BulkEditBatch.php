<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property string $batch_code
 * @property string $idempotency_key
 * @property int $user_id
 * @property string $source
 * @property string $status
 * @property int $total_rows
 * @property string|null $operation_type
 * @property int $created_count
 * @property int $updated_count
 * @property int $skipped_count
 * @property int $pending_count
 * @property int $failed_count
 * @property array<string, mixed>|null $summary
 * @property string|null $error_message
 */
#[Fillable([
    'batch_code', 'idempotency_key', 'user_id', 'source', 'operation_type', 'status',
    'total_rows', 'created_count', 'updated_count', 'skipped_count', 'pending_count', 'failed_count',
    'summary', 'error_message',
])]
class BulkEditBatch extends Model
{
    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<BulkEditBatchItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(BulkEditBatchItem::class);
    }

    protected function casts(): array
    {
        return [
            'total_rows' => 'integer',
            'created_count' => 'integer',
            'updated_count' => 'integer',
            'skipped_count' => 'integer',
            'pending_count' => 'integer',
            'failed_count' => 'integer',
            'summary' => 'array',
        ];
    }
}
