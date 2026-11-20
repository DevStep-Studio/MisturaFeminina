<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $product_id
 * @property int|null $product_variant_id
 * @property int|null $user_id
 * @property string $email
 * @property string|null $name
 * @property string $channel
 * @property string|null $phone
 * @property bool $consent_given
 * @property CarbonInterface|null $consented_at
 * @property string|null $unsubscribe_token
 * @property string $status
 * @property CarbonInterface|null $notified_at
 * @property int $attempts_count
 * @property string|null $last_error
 * @property CarbonInterface|null $cancelled_at
 * @property-read Product|null $product
 * @property-read ProductVariant|null $variant
 * @property-read User|null $user
 */
#[Fillable([
    'product_id',
    'product_variant_id',
    'user_id',
    'email',
    'name',
    'channel',
    'phone',
    'consent_given',
    'consented_at',
    'unsubscribe_token',
    'status',
    'notified_at',
    'attempts_count',
    'last_error',
    'cancelled_at',
])]
class RestockRequest extends Model
{
    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

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
            'consent_given' => 'boolean',
            'consented_at' => 'datetime',
            'notified_at' => 'datetime',
            'attempts_count' => 'integer',
            'cancelled_at' => 'datetime',
        ];
    }
}
