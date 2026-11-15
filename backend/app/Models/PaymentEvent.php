<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** @property array{resource_id:string,environment:string} $payload */
#[Fillable(['payment_id', 'provider', 'external_event_id', 'topic', 'action', 'deduplication_key', 'signature_valid', 'payload', 'status', 'error_message', 'processed_at'])]
class PaymentEvent extends Model
{
    /** @return BelongsTo<Payment, $this> */
    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }

    protected function casts(): array
    {
        return [
            'signature_valid' => 'boolean',
            'payload' => 'array',
            'processed_at' => 'datetime',
        ];
    }
}
