<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Shared\Enums\PaymentMethod;
use App\Domain\Shared\Enums\PaymentStatus;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property PaymentMethod $method
 * @property PaymentStatus $status
 * @property int $installments
 * @property int $gross_amount_cents
 * @property int $fee_cents
 * @property int $net_amount_cents
 * @property CarbonInterface|null $pix_expires_at
 * @property CarbonInterface|null $paid_at
 * @property array<string, mixed>|null $raw_sanitized_response
 * @property-read Order $order
 */
#[Fillable([
    'order_id', 'provider', 'environment', 'external_order_id', 'external_payment_id',
    'idempotency_key', 'method', 'installments', 'gross_amount_cents', 'fee_cents',
    'net_amount_cents', 'status', 'pix_qr_code_base64', 'pix_copy_paste',
    'pix_expires_at', 'card_last_four', 'card_brand', 'failure_reason',
    'raw_sanitized_response', 'paid_at', 'request_fingerprint', 'checkout_url', 'boleto_url', 'barcode', 'provider_updated_at',
])]
class Payment extends Model
{
    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return HasMany<PaymentEvent, $this> */
    public function events(): HasMany
    {
        return $this->hasMany(PaymentEvent::class)->orderByDesc('id');
    }

    protected function casts(): array
    {
        return [
            'method' => PaymentMethod::class,
            'status' => PaymentStatus::class,
            'installments' => 'integer',
            'gross_amount_cents' => 'integer',
            'fee_cents' => 'integer',
            'net_amount_cents' => 'integer',
            'pix_expires_at' => 'datetime',
            'raw_sanitized_response' => 'array',
            'paid_at' => 'datetime', 'provider_updated_at' => 'datetime',
        ];
    }
}
