<?php

declare(strict_types=1);

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $product_id
 * @property int $product_variant_id
 * @property int|null $supplier_id
 * @property int|null $goods_receipt_id
 * @property string $lot_code
 * @property CarbonInterface|null $manufactured_at
 * @property CarbonInterface|null $expires_at
 * @property int $initial_qty
 * @property int $remaining_qty
 * @property CarbonInterface $received_at
 */
#[Fillable([
    'product_id', 'product_variant_id', 'supplier_id', 'goods_receipt_id',
    'lot_code', 'manufactured_at', 'expires_at', 'initial_qty',
    'remaining_qty', 'received_at',
])]
class InventoryLot extends Model
{
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

    /** @return BelongsTo<Supplier, $this> */
    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    /** @return BelongsTo<GoodsReceipt, $this> */
    public function receipt(): BelongsTo
    {
        return $this->belongsTo(GoodsReceipt::class, 'goods_receipt_id');
    }

    protected function casts(): array
    {
        return [
            'manufactured_at' => 'date',
            'expires_at' => 'date',
            'initial_qty' => 'integer',
            'remaining_qty' => 'integer',
            'received_at' => 'datetime',
        ];
    }
}
