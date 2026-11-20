<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $import_id
 * @property int $row_index
 * @property string $group_key
 * @property string $product_reference
 * @property string|null $sku
 * @property string|null $gtin
 * @property string $action_type
 * @property int|null $matched_product_id
 * @property int|null $matched_variant_id
 * @property array<string, mixed> $proposed_data
 * @property array<string, mixed>|null $source_evidence
 * @property array<string, mixed>|null $validation_result
 * @property array<string, mixed>|null $duplicate_comparison
 * @property string $resolution_choice
 * @property string $approval_status
 */
#[Fillable([
    'import_id', 'row_index', 'group_key', 'product_reference', 'sku', 'gtin',
    'action_type', 'matched_product_id', 'matched_variant_id',
    'proposed_data', 'source_evidence', 'validation_result',
    'duplicate_comparison', 'resolution_choice', 'approval_status',
])]
class AiProductImportItem extends Model
{
    /** @return BelongsTo<AiProductImport, $this> */
    public function import(): BelongsTo
    {
        return $this->belongsTo(AiProductImport::class, 'import_id');
    }

    /** @return BelongsTo<Product, $this> */
    public function matchedProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'matched_product_id');
    }

    /** @return BelongsTo<ProductVariant, $this> */
    public function matchedVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'matched_variant_id');
    }

    protected function casts(): array
    {
        return [
            'row_index' => 'integer',
            'proposed_data' => 'array',
            'source_evidence' => 'array',
            'validation_result' => 'array',
            'duplicate_comparison' => 'array',
        ];
    }
}
