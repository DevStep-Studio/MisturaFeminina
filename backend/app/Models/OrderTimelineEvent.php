<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $order_id
 * @property int|null $user_id
 * @property string $category
 * @property string $event_type
 * @property string $title
 * @property string|null $description
 * @property string $origin
 * @property string|null $actor_name
 * @property array<string, mixed>|null $metadata
 * @property CarbonInterface $occurred_at
 */
#[Fillable([
    'order_id', 'user_id', 'category', 'event_type', 'title',
    'description', 'origin', 'actor_name', 'metadata', 'occurred_at',
])]
class OrderTimelineEvent extends Model
{
    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'occurred_at' => 'datetime',
        ];
    }
}
