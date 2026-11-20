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
 * @property string $occurrence_number
 * @property int $order_id
 * @property int|null $order_item_id
 * @property string $type
 * @property string $priority
 * @property string $status
 * @property int $affected_qty
 * @property string $description
 * @property string|null $resolution_type
 * @property string|null $resolution_notes
 * @property string|null $reverse_tracking_code
 * @property int|null $assigned_to_user_id
 * @property int|null $created_by_user_id
 * @property CarbonInterface|null $due_at
 * @property CarbonInterface|null $resolved_at
 * @property array<string, mixed>|null $product_snapshot
 * @property array<int, array<string, mixed>>|null $history_log
 */
#[Fillable([
    'occurrence_number', 'order_id', 'order_item_id', 'type', 'priority',
    'status', 'affected_qty', 'description', 'resolution_type',
    'resolution_notes', 'reverse_tracking_code', 'assigned_to_user_id',
    'created_by_user_id', 'due_at', 'resolved_at', 'product_snapshot',
    'history_log',
])]
class OrderOccurrence extends Model
{
    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return BelongsTo<OrderItem, $this> */
    public function orderItem(): BelongsTo
    {
        return $this->belongsTo(OrderItem::class, 'order_item_id');
    }

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

    /** @return HasMany<OrderOccurrenceNote, $this> */
    public function notes(): HasMany
    {
        return $this->hasMany(OrderOccurrenceNote::class)->orderByDesc('id');
    }

    protected function casts(): array
    {
        return [
            'affected_qty' => 'integer',
            'due_at' => 'datetime',
            'resolved_at' => 'datetime',
            'product_snapshot' => 'array',
            'history_log' => 'array',
        ];
    }
}
