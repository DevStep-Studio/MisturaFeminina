<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $order_id
 * @property int|null $order_occurrence_id
 * @property int $user_id
 * @property string $note_type
 * @property string $body
 * @property string|null $next_action
 */
#[Fillable(['order_id', 'order_occurrence_id', 'user_id', 'note_type', 'body', 'next_action'])]
class OrderOccurrenceNote extends Model
{
    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return BelongsTo<OrderOccurrence, $this> */
    public function occurrence(): BelongsTo
    {
        return $this->belongsTo(OrderOccurrence::class, 'order_occurrence_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
