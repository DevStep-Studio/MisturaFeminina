<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $id
 * @property int $user_id
 * @property string $name
 * @property bool $is_default
 */
#[Fillable(['user_id', 'name', 'is_default'])]
class ReplenishmentList extends Model
{
    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<ReplenishmentListItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(ReplenishmentListItem::class)->orderBy('id');
    }

    protected function casts(): array
    {
        return [
            'is_default' => 'boolean',
        ];
    }
}
