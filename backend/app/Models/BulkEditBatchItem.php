<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $bulk_edit_batch_id
 * @property int|null $product_id
 * @property int|null $product_variant_id
 * @property string $sku
 * @property string $action
 * @property array<string, mixed>|null $old_values
 * @property array<string, mixed>|null $new_values
 * @property string|null $error_message
 */
#[Fillable([
    'bulk_edit_batch_id', 'product_id', 'product_variant_id', 'sku',
    'action', 'old_values', 'new_values', 'error_message',
])]
class BulkEditBatchItem extends Model
{
    /** @return BelongsTo<BulkEditBatch, $this> */
    public function batch(): BelongsTo
    {
        return $this->belongsTo(BulkEditBatch::class, 'bulk_edit_batch_id');
    }

    protected function casts(): array
    {
        return [
            'old_values' => 'array',
            'new_values' => 'array',
        ];
    }
}
