<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $order_id
 * @property int|null $refund_id
 * @property int|null $order_occurrence_id
 * @property int|null $user_id
 * @property string|null $idempotency_key
 * @property string $return_type
 * @property bool $restock_items
 * @property int $financial_refund_cents
 * @property string $reason
 * @property CarbonInterface $occurred_at
 */
#[Fillable([
    'order_id',
    'refund_id',
    'order_occurrence_id',
    'user_id',
    'idempotency_key',
    'return_type',
    'restock_items',
    'financial_refund_cents',
    'reason',
    'occurred_at',
])]
class OrderReturn extends Model
{
    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return BelongsTo<Refund, $this> */
    public function refund(): BelongsTo
    {
        return $this->belongsTo(Refund::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<OrderReturnItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(OrderReturnItem::class);
    }

    protected function casts(): array
    {
        return [
            'restock_items' => 'boolean',
            'financial_refund_cents' => 'integer',
            'occurred_at' => 'datetime',
        ];
    }
}
