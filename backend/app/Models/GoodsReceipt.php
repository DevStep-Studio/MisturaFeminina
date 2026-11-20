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
 * @property string $receipt_number
 * @property int|null $supplier_id
 * @property string|null $invoice_number
 * @property string|null $purchase_reference
 * @property string $status
 * @property CarbonInterface $received_at
 * @property int $received_by_user_id
 * @property int|null $confirmed_by_user_id
 * @property CarbonInterface|null $confirmed_at
 * @property bool $has_discrepancy
 * @property string|null $notes
 */
#[Fillable([
    'receipt_number', 'supplier_id', 'invoice_number', 'purchase_reference',
    'status', 'received_at', 'received_by_user_id', 'confirmed_by_user_id',
    'confirmed_at', 'has_discrepancy', 'notes',
])]
class GoodsReceipt extends Model
{
    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /** @return BelongsTo<User, $this> */
    public function receivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'received_by_user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function confirmedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirmed_by_user_id');
    }

    /** @return HasMany<GoodsReceiptItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(GoodsReceiptItem::class);
    }

    protected function casts(): array
    {
        return [
            'received_at' => 'datetime',
            'confirmed_at' => 'datetime',
            'has_discrepancy' => 'boolean',
        ];
    }
}
