<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Shared\Enums\InventoryMovementType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['product_variant_id', 'user_id', 'order_id', 'type', 'qty_delta', 'physical_after', 'reserved_after', 'reason', 'reference'])]
class InventoryMovement extends Model
{
    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected function casts(): array
    {
        return [
            'type' => InventoryMovementType::class,
            'qty_delta' => 'integer',
            'physical_after' => 'integer',
            'reserved_after' => 'integer',
        ];
    }
}
