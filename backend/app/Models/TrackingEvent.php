<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property CarbonInterface|null $occurred_at
 */
#[Fillable(['shipment_id', 'occurred_at', 'status', 'location', 'description'])]
class TrackingEvent extends Model
{
    /** @return BelongsTo<Shipment, $this> */
    public function shipment(): BelongsTo
    {
        return $this->belongsTo(Shipment::class);
    }

    protected function casts(): array
    {
        return ['occurred_at' => 'datetime'];
    }
}
