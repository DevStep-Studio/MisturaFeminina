<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $min_subtotal_cents
 * @property int|null $max_weight_grams
 * @property array<int, string>|null $regions_ufs
 * @property int $base_price_cents
 * @property int $price_per_kg_cents
 * @property int $estimated_days
 * @property int $extra_prep_days
 * @property int|null $free_shipping_above_cents
 * @property bool $is_active
 * @property CarbonInterface|null $starts_at
 * @property CarbonInterface|null $ends_at
 */
#[Fillable(['name', 'code', 'carrier', 'mode', 'min_subtotal_cents', 'max_weight_grams', 'regions_ufs', 'cep_prefix_start', 'cep_prefix_end', 'base_price_cents', 'price_per_kg_cents', 'estimated_days', 'extra_prep_days', 'free_shipping_above_cents', 'is_active', 'starts_at', 'ends_at'])]
class ShippingRule extends Model
{
    protected function casts(): array
    {
        return [
            'min_subtotal_cents' => 'integer',
            'max_weight_grams' => 'integer',
            'regions_ufs' => 'array',
            'base_price_cents' => 'integer',
            'price_per_kg_cents' => 'integer',
            'estimated_days' => 'integer',
            'extra_prep_days' => 'integer',
            'free_shipping_above_cents' => 'integer',
            'is_active' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }
}
