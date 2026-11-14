<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property int $weight_grams
 * @property array<string, mixed>|null $dimensions
 * @property CarbonInterface|null $shipped_at
 * @property CarbonInterface|null $delivered_at
 */
#[Fillable(['order_id', 'carrier', 'service_code', 'service_name', 'tracking_code', 'tracking_url', 'label_url', 'label_status', 'weight_grams', 'dimensions', 'shipped_at', 'delivered_at'])]
class Shipment extends Model
{
    /** @return BelongsTo<Order, $this> */
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** @return HasMany<TrackingEvent, $this> */
    public function trackingEvents(): HasMany
    {
        return $this->hasMany(TrackingEvent::class)->orderByDesc('occurred_at');
    }

    protected function casts(): array
    {
        return [
            'weight_grams' => 'integer',
            'dimensions' => 'array',
            'shipped_at' => 'datetime',
            'delivered_at' => 'datetime',
        ];
    }
}
