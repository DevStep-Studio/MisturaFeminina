<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Shared\Enums\OrderStatus;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * @property OrderStatus $status
 * @property bool $is_guest
 * @property array<string, mixed> $shipping_address_snapshot
 * @property array<string, mixed> $shipping_service_snapshot
 * @property int $subtotal_cents
 * @property int $discount_cents
 * @property int $shipping_cents
 * @property int $tax_cents
 * @property int $total_cents
 * @property CarbonInterface|null $stock_reserved_until
 * @property CarbonInterface|null $paid_at
 * @property CarbonInterface|null $cancelled_at
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 * @property-read Payment|null $latestPayment
 * @property-read Shipment|null $shipment
 * @property-read User|null $user
 */
#[Fillable([
    'order_number', 'public_token', 'idempotency_key', 'user_id', 'is_guest',
    'customer_name', 'customer_email', 'customer_phone', 'customer_cpf_cnpj',
    'shipping_address_snapshot', 'shipping_service_snapshot',
    'subtotal_cents', 'discount_cents', 'coupon_code', 'shipping_cents',
    'tax_cents', 'total_cents', 'status', 'notes_customer', 'notes_internal',
    'stock_reserved_until', 'paid_at', 'cancelled_at', 'checkout_cart_id', 'checkout_fingerprint', 'payment_provider', 'payment_environment', 'payment_method',
])]
class Order extends Model
{
    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<OrderItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /** @return HasMany<OrderStatusHistory, $this> */
    public function statusHistories(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class)->orderByDesc('id');
    }

    /** @return HasMany<Payment, $this> */
    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->orderByDesc('id');
    }

    /** @return HasOne<Payment, $this> */
    public function latestPayment(): HasOne
    {
        return $this->hasOne(Payment::class)->latestOfMany();
    }

    /** @return HasMany<Refund, $this> */
    public function refunds(): HasMany
    {
        return $this->hasMany(Refund::class);
    }

    /** @return HasOne<Shipment, $this> */
    public function shipment(): HasOne
    {
        return $this->hasOne(Shipment::class)->latestOfMany();
    }

    protected function casts(): array
    {
        return [
            'status' => OrderStatus::class, 'checkout_cart_id' => 'integer',
            'is_guest' => 'boolean',
            'shipping_address_snapshot' => 'array',
            'shipping_service_snapshot' => 'array',
            'subtotal_cents' => 'integer',
            'discount_cents' => 'integer',
            'shipping_cents' => 'integer',
            'tax_cents' => 'integer',
            'total_cents' => 'integer',
            'stock_reserved_until' => 'datetime',
            'paid_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }
}
