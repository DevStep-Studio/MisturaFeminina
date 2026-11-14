<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property CarbonInterface|null $expires_at
 * @property-read ShippingQuote|null $shippingQuote
 * @property-read User|null $user
 */
#[Fillable(['token', 'user_id', 'coupon_code', 'shipping_cep', 'shipping_service_code', 'shipping_quote_id', 'expires_at'])]
class Cart extends Model
{
    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<CartItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(CartItem::class);
    }

    /** @return BelongsTo<ShippingQuote, $this> */
    public function shippingQuote(): BelongsTo
    {
        return $this->belongsTo(ShippingQuote::class);
    }

    protected function casts(): array
    {
        return ['expires_at' => 'datetime'];
    }
}
