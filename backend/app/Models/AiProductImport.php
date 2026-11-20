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
 * @property int $user_id
 * @property string $source_type
 * @property string|null $file_hash
 * @property array<int, string>|null $original_filenames
 * @property array<int, array<string, mixed>>|null $conversation_messages
 * @property array<string, mixed>|null $context_parameters
 * @property string $status
 * @property int $total_records
 * @property int $grouped_products_count
 * @property int $grouped_variants_count
 * @property int $new_count
 * @property int $update_count
 * @property int $duplicate_count
 * @property int $incomplete_count
 * @property int $error_count
 * @property int|null $committed_batch_id
 * @property int|null $approved_by_user_id
 * @property CarbonInterface|null $approved_at
 * @property CarbonInterface|null $created_at
 */
#[Fillable([
    'execution_id', 'user_id', 'source_type', 'file_hash', 'original_filenames',
    'conversation_messages', 'context_parameters', 'status',
    'total_records', 'grouped_products_count', 'grouped_variants_count',
    'new_count', 'update_count', 'duplicate_count', 'incomplete_count', 'error_count',
    'committed_batch_id', 'approved_by_user_id', 'approved_at',
])]
class AiProductImport extends Model
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

    /** @return BelongsTo<User, $this> */
    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by_user_id');
    }

    /** @return HasMany<AiProductImportItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(AiProductImportItem::class, 'import_id')->orderBy('row_index')->orderBy('id');
    }

    protected function casts(): array
    {
        return [
            'original_filenames' => 'array',
            'conversation_messages' => 'array',
            'context_parameters' => 'array',
            'total_records' => 'integer',
            'grouped_products_count' => 'integer',
            'grouped_variants_count' => 'integer',
            'new_count' => 'integer',
            'update_count' => 'integer',
            'duplicate_count' => 'integer',
            'incomplete_count' => 'integer',
            'error_count' => 'integer',
            'approved_at' => 'datetime',
        ];
    }
}
