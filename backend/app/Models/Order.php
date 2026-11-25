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
 * @property bool $has_issue
 * @property string|null $issue_reason
 * @property CarbonInterface|null $shipping_deadline_at
 * @property int|null $assisted_order_id
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
    'tax_cents', 'total_cents', 'status', 'has_issue', 'issue_reason',
    'notes_customer', 'notes_internal', 'shipping_deadline_at',
    'stock_reserved_until', 'paid_at', 'cancelled_at', 'checkout_cart_id',
    'checkout_fingerprint', 'payment_provider', 'payment_environment',
    'payment_method', 'assisted_order_id',
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

    /** @return HasMany<OrderReturn, $this> */
    public function returns(): HasMany
    {
        return $this->hasMany(OrderReturn::class)->orderByDesc('occurred_at')->orderByDesc('id');
    }

    /** @return HasOne<Shipment, $this> */
    public function shipment(): HasOne
    {
        return $this->hasOne(Shipment::class)->latestOfMany();
    }

    /** @return BelongsTo<AssistedOrder, $this> */
    public function assistedOrder(): BelongsTo
    {
        return $this->belongsTo(AssistedOrder::class, 'assisted_order_id');
    }

    /** @return HasMany<OrderTimelineEvent, $this> */
    public function timelineEvents(): HasMany
    {
        return $this->hasMany(OrderTimelineEvent::class)->orderByDesc('occurred_at');
    }

    /** @return HasMany<OrderOccurrence, $this> */
    public function occurrences(): HasMany
    {
        return $this->hasMany(OrderOccurrence::class)->orderByDesc('id');
    }

    /** @return HasMany<OrderOccurrenceNote, $this> */
    public function occurrenceNotes(): HasMany
    {
        return $this->hasMany(OrderOccurrenceNote::class)->orderByDesc('id');
    }

    protected function casts(): array
    {
        return [
            'status' => OrderStatus::class,
            'has_issue' => 'boolean',
            'assisted_order_id' => 'integer',
            'checkout_cart_id' => 'integer',
            'is_guest' => 'boolean',
            'shipping_address_snapshot' => 'array',
            'shipping_service_snapshot' => 'array',
            'subtotal_cents' => 'integer',
            'discount_cents' => 'integer',
            'shipping_cents' => 'integer',
            'tax_cents' => 'integer',
            'total_cents' => 'integer',
            'shipping_deadline_at' => 'datetime',
            'stock_reserved_until' => 'datetime',
            'paid_at' => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }
}
