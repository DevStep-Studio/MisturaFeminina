<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $price_cents
 * @property int $estimated_days
 * @property bool $is_fallback
 * @property array<string, mixed>|null $raw_response
 * @property CarbonInterface $expires_at
 */
#[Fillable(['cart_id', 'cep', 'provider', 'service_code', 'service_name', 'carrier', 'price_cents', 'estimated_days', 'is_fallback', 'raw_response', 'expires_at', 'items_fingerprint'])]
class ShippingQuote extends Model
{
    protected function casts(): array
    {
        return [
            'price_cents' => 'integer', 'cart_id' => 'integer',
            'estimated_days' => 'integer',
            'is_fallback' => 'boolean',
            'raw_response' => 'array',
            'expires_at' => 'datetime',
        ];
    }
}
