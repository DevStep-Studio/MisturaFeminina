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
 * @property string $order_code
 * @property string $token
 * @property string $token_hash
 * @property string $status
 * @property int $created_by_user_id
 * @property int|null $customer_user_id
 * @property string|null $customer_name
 * @property string|null $customer_email
 * @property string|null $customer_phone
 * @property string|null $coupon_code
 * @property string|null $notes
 * @property int $subtotal_cents
 * @property int $discount_cents
 * @property int $estimated_total_cents
 * @property int|null $converted_order_id
 * @property CarbonInterface|null $link_generated_at
 * @property CarbonInterface|null $expires_at
 * @property CarbonInterface|null $converted_at
 */
#[Fillable([
    'order_code', 'token', 'token_hash', 'status', 'created_by_user_id',
    'customer_user_id', 'customer_name', 'customer_email', 'customer_phone',
    'coupon_code', 'notes', 'subtotal_cents', 'discount_cents',
    'estimated_total_cents', 'converted_order_id', 'link_generated_at',
    'expires_at', 'converted_at',
])]
class AssistedOrder extends Model
{
    /** @return BelongsTo<User, $this> */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function customerUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'customer_user_id');
    }

    /** @return BelongsTo<Order, $this> */
    public function convertedOrder(): BelongsTo
    {
        return $this->belongsTo(Order::class, 'converted_order_id');
    }

    /** @return HasMany<AssistedOrderItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(AssistedOrderItem::class);
    }

    /** @return HasMany<AssistedOrderEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(AssistedOrderEvent::class)->orderByDesc('id');
    }

    protected function casts(): array
    {
        return [
            'subtotal_cents' => 'integer',
            'discount_cents' => 'integer',
            'estimated_total_cents' => 'integer',
            'link_generated_at' => 'datetime',
            'expires_at' => 'datetime',
            'converted_at' => 'datetime',
        ];
    }
}
