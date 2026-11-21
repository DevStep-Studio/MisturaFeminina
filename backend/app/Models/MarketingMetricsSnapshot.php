<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property string $platform
 * @property CarbonInterface $period_date
 * @property int $impressions
 * @property int $clicks
 * @property int $spend_cents
 * @property int $attributed_revenue_cents
 * @property int $conversions_count
 * @property float $cpc
 * @property float $ctr
 * @property float $roas
 * @property int $store_orders_count
 * @property int $store_revenue_cents
 * @property array<string, mixed>|null $breakdown_payload
 * @property CarbonInterface|null $created_at
 * @property CarbonInterface|null $updated_at
 */
#[Fillable([
    'platform',
    'period_date',
    'impressions',
    'clicks',
    'spend_cents',
    'attributed_revenue_cents',
    'conversions_count',
    'cpc',
    'ctr',
    'roas',
    'store_orders_count',
    'store_revenue_cents',
    'breakdown_payload',
])]
class MarketingMetricsSnapshot extends Model
{
    protected function casts(): array
    {
        return [
            'period_date' => 'date',
            'impressions' => 'integer',
            'clicks' => 'integer',
            'spend_cents' => 'integer',
            'attributed_revenue_cents' => 'integer',
            'conversions_count' => 'integer',
            'cpc' => 'float',
            'ctr' => 'float',
            'roas' => 'float',
            'store_orders_count' => 'integer',
            'store_revenue_cents' => 'integer',
            'breakdown_payload' => 'array',
        ];
    }
}
