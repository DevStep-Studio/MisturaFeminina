<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $assisted_order_id
 * @property int|null $user_id
 * @property string $event_type
 * @property string $description
 * @property array<string, mixed>|null $payload
 */
#[Fillable(['assisted_order_id', 'user_id', 'event_type', 'description', 'payload'])]
class AssistedOrderEvent extends Model
{
    /** @return BelongsTo<AssistedOrder, $this> */
    public function assistedOrder(): BelongsTo
    {
        return $this->belongsTo(AssistedOrder::class);
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    protected function casts(): array
    {
        return ['payload' => 'array'];
    }
}
