<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Domain\Security\Services\AuditLogger;
use App\Domain\Shared\Enums\InventoryMovementType;
use App\Models\BulkEditBatch;
use App\Models\BulkEditBatchItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class BulkVariantEditService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Parses pasted tabular Excel / Google Sheets content supporting Brazilian formatting (e.g. "R$ 19,90").
     *
     * @return list<array<string, mixed>>
     */
    public function parseTabularText(string $rawText, ?int $defaultProductId = null): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($rawText)) ?: [];
        if ($lines === []) {
            return [];
        }

        $firstLine = $lines[0];
        $delimiter = str_contains($firstLine, "\t") ? "\t" : (str_contains($firstLine, ';') ? ';' : ',');

        $rows = [];
        $hasHeader = false;
        $columnMap = ['name', 'sku', 'price', 'stock', 'shade_code', 'promo_price'];

        foreach ($lines as $idx => $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $cells = array_map(fn (string $c): string => trim($c), str_getcsv($line, $delimiter));

            if ($idx === 0) {
                $normCells = array_map(fn (string $c): string => Str::ascii(mb_strtolower(trim($c))), $cells);
                $hasPriceCell = collect($normCells)->contains(fn (string $c): bool => preg_match('/^(r\$\s*)?\d+[.,]\d{2}$/', $c) === 1);
                $hasHeaderWord = collect($normCells)->contains(fn (string $c): bool => $c === 'sku' || preg_match('/\b(preco|valor|estoque|qtd|quantidade|tonalidade|codigo cor)\b/', $c) === 1);
                if ($hasHeaderWord && ! $hasPriceCell) {
                    $hasHeader = true;
                    $columnMap = array_map(function (string $h): string {
                        $norm = Str::ascii(mb_strtolower(trim($h)));

                        return match (true) {
                            str_contains($norm, 'sku') => 'sku',
                            str_contains($norm, 'promo') => 'promo_price',
                            str_contains($norm, 'preco') || str_contains($norm, 'valor') => 'price',
                            str_contains($norm, 'estoq') || str_contains($norm, 'qtd') => 'stock',
                            str_contains($norm, 'codigo') && str_contains($norm, 'cor') || str_contains($norm, 'numero') => 'shade_code',
                            str_contains($norm, 'famil') => 'color_family',
                            str_contains($norm, 'hex') => 'color_hex',
                            str_contains($norm, 'produto') => 'product_sku',
                            default => 'name',
                        };
                    }, $cells);

                    continue;
                }
            }

            $parsed = [
                'row_index' => count($rows),
                'product_id' => $defaultProductId,
                'variant_id' => null,
                'name' => '',
                'shade_code' => null,
                'color_family' => null,
                'color_hex' => null,
                'sku' => '',
                'price_brl' => null,
                'price_cents' => 0,
                'promo_price_brl' => null,
                'promo_price_cents' => null,
                'stock_qty' => 0,
                'is_active' => true,
            ];

            foreach ($cells as $colIdx => $cell) {
                $field = $columnMap[$colIdx] ?? null;
                if ($field === null) {
                    continue;
                }
                if ($field === 'name') {
                    $parsed['name'] = $cell;
                } elseif ($field === 'sku') {
                    $parsed['sku'] = strtoupper($cell);
                } elseif ($field === 'shade_code') {
                    $parsed['shade_code'] = $cell !== '' ? $cell : null;
                } elseif ($field === 'color_family') {
                    $parsed['color_family'] = $cell !== '' ? $cell : null;
                } elseif ($field === 'color_hex') {
                    $parsed['color_hex'] = $cell !== '' ? $cell : null;
                } elseif ($field === 'product_sku' && $defaultProductId === null && $cell !== '') {
                    $prod = Product::query()->where('sku', strtoupper($cell))->first();
                    $parsed['product_id'] = $prod?->id;
                } elseif ($field === 'price') {
                    $parsed['price_brl'] = $cell;
                    $parsed['price_cents'] = $this->parseBrazilianCents($cell);
                } elseif ($field === 'promo_price') {
                    $parsed['promo_price_brl'] = $cell !== '' ? $cell : null;
                    $parsed['promo_price_cents'] = $cell !== '' ? $this->parseBrazilianCents($cell) : null;
                } elseif ($field === 'stock') {
                    $parsed['stock_qty'] = is_numeric(str_replace(['.', ' '], '', $cell))
                        ? (int) str_replace(['.', ' '], '', $cell)
                        : -1;
                }
            }

            if (! $hasHeader && count($cells) >= 3 && $parsed['name'] === '' && $parsed['sku'] !== '') {
                $parsed['name'] = $parsed['sku'];
            }

            $rows[] = $parsed;
        }

        return $rows;
    }

    public function parseBrazilianCents(string|int|float|null $raw): int
    {
        if (is_int($raw)) {
            return $raw;
        }
        if (is_float($raw)) {
            return (int) round($raw * 100);
        }
        $clean = trim((string) $raw);
        if ($clean === '') {
            return 0;
        }
        // Strip currency symbols/spaces cleanly keeping digits, dot and comma
        $clean = preg_replace('/[^0-9,.\-]/', '', $clean) ?? '';
        if ($clean === '' || str_starts_with($clean, '-')) {
            return -1;
        }
        if (str_contains($clean, ',')) {
            // Brazilian format: "1.234,56" or "19,90"
            $clean = str_replace('.', '', $clean);
            $clean = str_replace(',', '.', $clean);
        }

        return is_numeric($clean) ? (int) round((float) $clean * 100) : -1;
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    public function preview(array $rows, ?int $defaultProductId = null): array
    {
        $skus = [];
        foreach ($rows as $row) {
            $sku = strtoupper(trim((string) ($row['sku'] ?? '')));
            if ($sku !== '') {
                $skus[] = $sku;
            }
        }
        $skuCounts = array_count_values($skus);

        $existingById = ProductVariant::query()
            ->whereIn('id', array_values(array_filter(array_map(fn ($r): int => (int) ($r['variant_id'] ?? 0), $rows))))
            ->get()
            ->keyBy('id');

        $existingBySku = ProductVariant::query()
            ->whereIn('sku', array_unique($skus))
            ->get()
            ->keyBy(fn (ProductVariant $v): string => strtoupper($v->sku));

        $newCount = 0;
        $updateCount = 0;
        $invalidCount = 0;
        $duplicateSkus = [];
        $annotated = [];

        foreach ($rows as $idx => $row) {
            $sku = strtoupper(trim((string) ($row['sku'] ?? '')));
            $name = trim((string) ($row['name'] ?? ''));
            $productId = ! empty($row['product_id']) ? (int) $row['product_id'] : $defaultProductId;
            $variantId = ! empty($row['variant_id']) ? (int) $row['variant_id'] : null;

            $priceCents = array_key_exists('price_cents', $row)
                ? (int) $row['price_cents']
                : $this->parseBrazilianCents($row['price_brl'] ?? null);
            $promoCents = null;
            if (! empty($row['promo_price_cents'])) {
                $promoCents = (int) $row['promo_price_cents'];
            } elseif (isset($row['promo_price_brl']) && trim((string) $row['promo_price_brl']) !== '') {
                $promoCents = $this->parseBrazilianCents($row['promo_price_brl']);
            }
            $stockQty = isset($row['stock_qty']) && is_numeric($row['stock_qty']) ? (int) $row['stock_qty'] : -1;

            /** @var ProductVariant|null $targetVariant */
            $targetVariant = $variantId ? $existingById->get($variantId) : ($sku !== '' ? $existingBySku->get($sku) : null);

            $errors = [];
            if ($sku === '') {
                $errors[] = 'SKU obrigatório.';
            } elseif (($skuCounts[$sku] ?? 0) > 1) {
                $errors[] = "SKU {$sku} duplicado no lote.";
                $duplicateSkus[] = $sku;
            }

            if ($name === '') {
                $errors[] = 'Nome da tonalidade/variante obrigatório.';
            }
            if ($priceCents <= 0) {
                $errors[] = 'Preço inválido ou negativo.';
            }
            if ($promoCents !== null && ($promoCents <= 0 || ($priceCents > 0 && $promoCents >= $priceCents))) {
                $errors[] = 'Preço promocional inválido ou maior/igual ao preço normal.';
            }
            if ($stockQty < 0) {
                $errors[] = 'Estoque inválido ou negativo.';
            }

            if ($targetVariant) {
                if ($productId !== null && (int) $targetVariant->product_id !== $productId) {
                    $errors[] = "SKU {$sku} já pertence a outro produto.";
                    $duplicateSkus[] = $sku;
                }
                if ($stockQty >= 0 && $stockQty < $targetVariant->reserved_qty) {
                    $errors[] = "Estoque ({$stockQty}) menor que o reservado ({$targetVariant->reserved_qty}).";
                }
            } elseif ($productId === null) {
                $errors[] = 'Selecione o produto de destino para novas variações.';
            }

            $action = $targetVariant ? 'update' : 'create';
            if ($errors !== []) {
                $invalidCount++;
            } elseif ($action === 'create') {
                $newCount++;
            } else {
                $updateCount++;
            }

            $annotated[] = [
                'row_index' => $idx,
                'variant_id' => $targetVariant?->id,
                'product_id' => $targetVariant->product_id ?? $productId,
                'name' => $name,
                'shade_code' => isset($row['shade_code']) ? (trim((string) $row['shade_code']) ?: null) : null,
                'color_family' => isset($row['color_family']) ? (trim((string) $row['color_family']) ?: null) : null,
                'color_hex' => isset($row['color_hex']) ? (trim((string) $row['color_hex']) ?: null) : null,
                'sku' => $sku,
                'price_cents' => $priceCents,
                'promo_price_cents' => $promoCents,
                'stock_qty' => $stockQty,
                'sort_order' => isset($row['sort_order']) ? (int) $row['sort_order'] : $idx,
                'is_active' => array_key_exists('is_active', $row) ? (bool) $row['is_active'] : true,
                'action' => $action,
                'errors' => $errors,
                'valid' => $errors === [],
            ];
        }

        return [
            'summary' => [
                'total_rows' => count($rows),
                'new_count' => $newCount,
                'update_count' => $updateCount,
                'invalid_count' => $invalidCount,
                'duplicate_skus' => array_values(array_unique($duplicateSkus)),
            ],
            'rows' => $annotated,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    public function commit(array $rows, User $actor, string $idempotencyKey, string $source = 'grid', ?int $defaultProductId = null): array
    {
        $existingBatch = BulkEditBatch::query()->where('idempotency_key', $idempotencyKey)->with('items')->first();
        if ($existingBatch) {
            return [
                'batch' => $existingBatch,
                'idempotent_replay' => true,
            ];
        }

        if (count($rows) > 500) {
            throw ValidationException::withMessages(['rows' => ['Limite máximo de 500 linhas por lote.']]);
        }

        $preview = $this->preview($rows, $defaultProductId);
        if (($preview['summary']['invalid_count'] ?? 0) > 0) {
            throw ValidationException::withMessages([
                'rows' => ['Corrija as linhas inválidas destacadas antes de confirmar o lote.'],
            ]);
        }

        $canPrice = $actor->hasPermission('catalog.pricing') || $actor->hasPermission('catalog.write');
        $canStock = $actor->hasPermission('inventory.manage') || $actor->hasPermission('catalog.write');

        $batch = DB::transaction(function () use ($preview, $actor, $idempotencyKey, $source, $canPrice, $canStock): BulkEditBatch {
            $batch = BulkEditBatch::query()->create([
                'batch_code' => 'LOTE-'.now()->format('ymd').'-'.strtoupper(Str::random(5)),
                'idempotency_key' => $idempotencyKey,
                'user_id' => $actor->id,
                'source' => $source,
                'status' => 'completed',
                'total_rows' => (int) $preview['summary']['total_rows'],
                'created_count' => (int) $preview['summary']['new_count'],
                'updated_count' => (int) $preview['summary']['update_count'],
                'failed_count' => 0,
                'summary' => $preview['summary'],
            ]);

            foreach ($preview['rows'] as $row) {
                $existing = ! empty($row['variant_id'])
                    ? ProductVariant::query()->lockForUpdate()->find((int) $row['variant_id'])
                    : null;

                if ($existing) {
                    $oldValues = [
                        'name' => $existing->name,
                        'shade_code' => $existing->shade_code,
                        'price_cents' => $existing->price_cents,
                        'promo_price_cents' => $existing->promo_price_cents,
                        'stock_qty' => $existing->stock_qty,
                        'is_active' => $existing->is_active,
                    ];

                    if ($existing->price_cents !== $row['price_cents'] && ! $canPrice) {
                        throw ValidationException::withMessages(['permissions' => ['Você não possui permissão para alterar preços comerciais.']]);
                    }
                    $deltaStock = (int) $row['stock_qty'] - $existing->stock_qty;
                    if ($deltaStock !== 0 && ! $canStock) {
                        throw ValidationException::withMessages(['permissions' => ['Você não possui permissão para alterar saldos de estoque.']]);
                    }

                    $updatePayload = [
                        'name' => $row['name'],
                        'shade_code' => $row['shade_code'] ?? $existing->shade_code,
                        'color_family' => $row['color_family'] ?? $existing->color_family,
                        'color_hex' => $row['color_hex'] ?? $existing->color_hex,
                        'sort_order' => $row['sort_order'],
                        'is_active' => $row['is_active'],
                    ];
                    if ($canPrice) {
                        $updatePayload['price_cents'] = $row['price_cents'];
                        $updatePayload['promo_price_cents'] = $row['promo_price_cents'];
                    }

                    $existing->update($updatePayload);

                    if ($deltaStock !== 0) {
                        $this->inventory->adjustStock(
                            $existing,
                            $deltaStock,
                            InventoryMovementType::Adjustment,
                            $actor,
                            "Edição em massa ({$batch->batch_code})",
                            $batch->batch_code
                        );
                    }

                    BulkEditBatchItem::query()->create([
                        'bulk_edit_batch_id' => $batch->id,
                        'product_id' => $existing->product_id,
                        'product_variant_id' => $existing->id,
                        'sku' => $existing->sku,
                        'action' => 'updated',
                        'old_values' => $oldValues,
                        'new_values' => $row,
                    ]);
                } else {
                    if (! $canPrice || ! $canStock) {
                        throw ValidationException::withMessages(['permissions' => ['Cadastro de novas variações exige permissão de preço e estoque.']]);
                    }
                    $product = Product::query()->findOrFail((int) $row['product_id']);
                    $created = ProductVariant::query()->create([
                        'product_id' => $product->id,
                        'sku' => $row['sku'],
                        'name' => $row['name'],
                        'shade_code' => $row['shade_code'],
                        'color_family' => $row['color_family'],
                        'color_hex' => $row['color_hex'],
                        'price_cents' => $row['price_cents'],
                        'promo_price_cents' => $row['promo_price_cents'],
                        'stock_qty' => 0,
                        'reserved_qty' => 0,
                        'min_stock_alert' => 5,
                        'weight_grams' => $product->weight_grams,
                        'is_default' => ! $product->variants()->exists(),
                        'is_active' => $row['is_active'],
                        'sort_order' => $row['sort_order'],
                    ]);

                    if ((int) $row['stock_qty'] > 0) {
                        $this->inventory->adjustStock(
                            $created,
                            (int) $row['stock_qty'],
                            InventoryMovementType::In,
                            $actor,
                            "Cadastro inicial em massa ({$batch->batch_code})",
                            $batch->batch_code
                        );
                    }

                    BulkEditBatchItem::query()->create([
                        'bulk_edit_batch_id' => $batch->id,
                        'product_id' => $product->id,
                        'product_variant_id' => $created->id,
                        'sku' => $created->sku,
                        'action' => 'created',
                        'old_values' => null,
                        'new_values' => $row,
                    ]);
                }
            }

            return $batch;
        });

        $this->audit->record(
            'catalog.bulk_variants_committed',
            $actor,
            'bulk_edit_batch',
            $batch->id,
            null,
            $preview['summary'],
        );

        return [
            'batch' => $batch->fresh(['items', 'user:id,name']),
            'idempotent_replay' => false,
        ];
    }
}
