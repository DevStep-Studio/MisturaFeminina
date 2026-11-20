<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $analysis_id
 * @property int $product_id
 * @property int $variant_id
 * @property int|null $supplier_id
 * @property string $sku_snapshot
 * @property string $product_name_snapshot
 * @property string $variant_name_snapshot
 * @property string|null $shade_code_snapshot
 * @property int $available_stock
 * @property int $reserved_stock
 * @property int $pending_inbound_qty
 * @property int $sales_7d
 * @property int $sales_30d
 * @property int $sales_90d
 * @property int $returns_30d
 * @property float $average_demand
 * @property float|null $coverage_days
 * @property int $lead_time_days
 * @property int $safety_stock_qty
 * @property int $reorder_point_qty
 * @property int $target_stock_qty
 * @property int $suggested_quantity
 * @property int|null $adjusted_quantity
 * @property int $unit_cost_cents
 * @property int $estimated_total_cents
 * @property int $restock_waitlist_count
 * @property int $customer_lists_count
 * @property string $forecast_quality
 * @property string $priority
 * @property string $explanation
 * @property string|null $ai_explanation
 * @property string $plan_status
 */
#[Fillable([
    'analysis_id', 'product_id', 'variant_id', 'supplier_id',
    'sku_snapshot', 'product_name_snapshot', 'variant_name_snapshot', 'shade_code_snapshot',
    'available_stock', 'reserved_stock', 'pending_inbound_qty',
    'sales_7d', 'sales_30d', 'sales_90d', 'returns_30d',
    'average_demand', 'coverage_days', 'lead_time_days',
    'safety_stock_qty', 'reorder_point_qty', 'target_stock_qty',
    'suggested_quantity', 'adjusted_quantity', 'unit_cost_cents', 'estimated_total_cents',
    'restock_waitlist_count', 'customer_lists_count', 'forecast_quality',
    'priority', 'explanation', 'ai_explanation', 'plan_status',
])]
class AiReplenishmentSuggestion extends Model
{
    /** @return BelongsTo<AiReplenishmentAnalysis, $this> */
    public function analysis(): BelongsTo
    {
        return $this->belongsTo(AiReplenishmentAnalysis::class, 'analysis_id');
    }

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    protected function casts(): array
    {
        return [
            'available_stock' => 'integer',
            'reserved_stock' => 'integer',
            'pending_inbound_qty' => 'integer',
            'sales_7d' => 'integer',
            'sales_30d' => 'integer',
            'sales_90d' => 'integer',
            'returns_30d' => 'integer',
            'average_demand' => 'float',
            'coverage_days' => 'float',
            'lead_time_days' => 'integer',
            'safety_stock_qty' => 'integer',
            'reorder_point_qty' => 'integer',
            'target_stock_qty' => 'integer',
            'suggested_quantity' => 'integer',
            'adjusted_quantity' => 'integer',
            'unit_cost_cents' => 'integer',
            'estimated_total_cents' => 'integer',
            'restock_waitlist_count' => 'integer',
            'customer_lists_count' => 'integer',
        ];
    }
}
