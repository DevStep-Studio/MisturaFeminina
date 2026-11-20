<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $goods_receipt_id
 * @property int $product_id
 * @property int $product_variant_id
 * @property string $sku_snapshot
 * @property int|null $expected_qty
 * @property int $received_qty
 * @property int $accepted_qty
 * @property int $rejected_qty
 * @property string|null $discrepancy_reason
 * @property string|null $discrepancy_notes
 * @property int|null $unit_cost_cents
 * @property string|null $lot_code
 * @property CarbonInterface|null $manufactured_at
 * @property CarbonInterface|null $expires_at
 */
#[Fillable([
    'goods_receipt_id', 'product_id', 'product_variant_id', 'sku_snapshot',
    'expected_qty', 'received_qty', 'accepted_qty', 'rejected_qty',
    'discrepancy_reason', 'discrepancy_notes', 'unit_cost_cents',
    'lot_code', 'manufactured_at', 'expires_at',
])]
class GoodsReceiptItem extends Model
{
    /** @return BelongsTo<GoodsReceipt, $this> */
    public function receipt(): BelongsTo
    {
        return $this->belongsTo(GoodsReceipt::class, 'goods_receipt_id');
    }

    /** @return BelongsTo<Product, $this> */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    protected function casts(): array
    {
        return [
            'expected_qty' => 'integer',
            'received_qty' => 'integer',
            'accepted_qty' => 'integer',
            'rejected_qty' => 'integer',
            'unit_cost_cents' => 'integer',
            'manufactured_at' => 'date',
            'expires_at' => 'date',
        ];
    }
}
