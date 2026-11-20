<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property string $token
 * @property string $token_hash
 * @property int|null $created_by_user_id
 * @property string|null $title
 * @property array<int, array<string, mixed>> $cart_snapshot
 * @property int $views_count
 * @property int $imports_count
 * @property CarbonInterface $expires_at
 */
#[Fillable(['token', 'token_hash', 'created_by_user_id', 'title', 'cart_snapshot', 'views_count', 'imports_count', 'expires_at'])]
class SharedCart extends Model
{
    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    protected function casts(): array
    {
        return [
            'cart_snapshot' => 'array',
            'views_count' => 'integer',
            'imports_count' => 'integer',
            'expires_at' => 'datetime',
        ];
    }
}
