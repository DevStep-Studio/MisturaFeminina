<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Domain\Security\Services\AuditLogger;
use App\Domain\Shared\Enums\InventoryMovementType;
use App\Domain\Wholesale\Services\WholesalePricingService;
use App\Http\Controllers\SeoController;
use App\Models\BulkEditBatch;
use App\Models\BulkEditBatchItem;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Promotion;
use App\Models\User;
use App\Models\WholesaleRule;
use Illuminate\Support\Facades\Cache;
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
     * Preserves empty cells as null/omitted so existing catalog values are kept unless explicitly cleared.
     * When `existingRows` are supplied, pasted rows with an SKU column match & merge by SKU regardless of row order.
     *
     * @param  list<array<string, mixed>>  $existingRows
     * @return list<array<string, mixed>>
     */
    public function parseTabularText(string $rawText, ?int $defaultProductId = null, array $existingRows = []): array
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
                            str_contains($norm, 'custo') || $norm === 'cost' || $norm === 'cost_brl' || $norm === 'cost_cents' => 'cost',
                            str_contains($norm, 'promo') => 'promo_price',
                            str_contains($norm, 'preco') || str_contains($norm, 'valor') => 'price',
                            str_contains($norm, 'estoq') || str_contains($norm, 'qtd') || str_contains($norm, 'saldo') => 'stock',
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
                'name' => null,
                'shade_code' => null,
                'color_family' => null,
                'color_hex' => null,
                'sku' => '',
                'price_brl' => null,
                'price_cents' => null,
                'promo_price_brl' => null,
                'promo_price_cents' => null,
                'clear_promo' => false,
                'cost_brl' => null,
                'cost_cents' => null,
                'clear_cost' => false,
                'stock_qty' => null,
                'is_active' => true,
                'provided_fields' => [],
            ];

            foreach ($cells as $colIdx => $cell) {
                $field = $columnMap[$colIdx] ?? null;
                if ($field === null) {
                    continue;
                }
                if ($cell === '') {
                    continue;
                }

                if ($field === 'name') {
                    $parsed['name'] = $cell;
                    $parsed['provided_fields'][] = 'name';
                } elseif ($field === 'sku') {
                    $parsed['sku'] = strtoupper($cell);
                    $parsed['provided_fields'][] = 'sku';
                } elseif ($field === 'shade_code') {
                    $parsed['shade_code'] = $cell;
                    $parsed['provided_fields'][] = 'shade_code';
                } elseif ($field === 'color_family') {
                    $parsed['color_family'] = $cell;
                    $parsed['provided_fields'][] = 'color_family';
                } elseif ($field === 'color_hex') {
                    $parsed['color_hex'] = $cell;
                    $parsed['provided_fields'][] = 'color_hex';
                } elseif ($field === 'product_sku' && $defaultProductId === null) {
                    $prod = Product::query()->where('sku', strtoupper($cell))->first();
                    $parsed['product_id'] = $prod?->id;
                } elseif ($field === 'price') {
                    $parsed['price_brl'] = $cell;
                    $parsed['price_cents'] = $this->parseBrazilianCents($cell);
                    $parsed['provided_fields'][] = 'price';
                } elseif ($field === 'promo_price') {
                    if (in_array(mb_strtoupper($cell), ['[LIMPAR]', 'LIMPAR', 'REMOVER', '-'], true)) {
                        $parsed['clear_promo'] = true;
                        $parsed['promo_price_brl'] = null;
                        $parsed['promo_price_cents'] = null;
                    } else {
                        $parsed['promo_price_brl'] = $cell;
                        $parsed['promo_price_cents'] = $this->parseBrazilianCents($cell);
                    }
                    $parsed['provided_fields'][] = 'promo_price';
                } elseif ($field === 'cost') {
                    if (in_array(mb_strtoupper($cell), ['[LIMPAR]', 'LIMPAR', 'REMOVER', '-'], true)) {
                        $parsed['clear_cost'] = true;
                        $parsed['cost_brl'] = null;
                        $parsed['cost_cents'] = null;
                    } else {
                        $parsed['cost_brl'] = $cell;
                        $parsed['cost_cents'] = $this->parseBrazilianCents($cell);
                    }
                    $parsed['provided_fields'][] = 'cost';
                } elseif ($field === 'stock') {
                    $cleanStock = str_replace(['.', ' '], '', $cell);
                    $parsed['stock_qty'] = preg_match('/^-?\d+$/', $cleanStock) === 1
                        ? (int) $cleanStock
                        : -1;
                    $parsed['provided_fields'][] = 'stock';
                }
            }

            if (! $hasHeader && count($cells) >= 3 && empty($parsed['name']) && $parsed['sku'] !== '') {
                $parsed['name'] = $parsed['sku'];
            }

            $rows[] = $parsed;
        }

        // If grid already had rows loaded and paste contains SKUs, merge pasted values onto matching SKUs regardless of order
        if ($existingRows !== [] && collect($rows)->contains(fn (array $r): bool => ($r['sku'] ?? '') !== '')) {
            $bySku = [];
            foreach ($existingRows as $er) {
                $k = strtoupper(trim((string) ($er['sku'] ?? '')));
                if ($k !== '') {
                    $bySku[$k] = $er;
                }
            }

            $merged = [];
            $seenPasted = [];

            foreach ($rows as $pastedRow) {
                $sku = strtoupper(trim((string) ($pastedRow['sku'] ?? '')));
                $seenPasted[$sku] = ($seenPasted[$sku] ?? 0) + 1;
                $base = $sku !== '' && isset($bySku[$sku]) ? $bySku[$sku] : null;

                if ($base) {
                    $provided = $pastedRow['provided_fields'] ?? [];
                    $mergedRow = $base;
                    $mergedRow['dirty'] = true;
                    if (in_array('name', $provided, true) && $pastedRow['name'] !== null) {
                        $mergedRow['name'] = $pastedRow['name'];
                    }
                    if (in_array('shade_code', $provided, true)) {
                        $mergedRow['shade_code'] = $pastedRow['shade_code'];
                    }
                    if (in_array('color_family', $provided, true)) {
                        $mergedRow['color_family'] = $pastedRow['color_family'];
                    }
                    if (in_array('color_hex', $provided, true)) {
                        $mergedRow['color_hex'] = $pastedRow['color_hex'];
                    }
                    if (in_array('price', $provided, true)) {
                        $mergedRow['price_brl'] = $pastedRow['price_brl'];
                        $mergedRow['price_cents'] = $pastedRow['price_cents'];
                    }
                    if (in_array('promo_price', $provided, true)) {
                        $mergedRow['clear_promo'] = $pastedRow['clear_promo'];
                        $mergedRow['promo_price_brl'] = $pastedRow['promo_price_brl'];
                        $mergedRow['promo_price_cents'] = $pastedRow['promo_price_cents'];
                    }
                    if (in_array('cost', $provided, true)) {
                        $mergedRow['clear_cost'] = $pastedRow['clear_cost'];
                        $mergedRow['cost_brl'] = $pastedRow['cost_brl'];
                        $mergedRow['cost_cents'] = $pastedRow['cost_cents'];
                    }
                    if (in_array('stock', $provided, true)) {
                        $mergedRow['stock_qty'] = $pastedRow['stock_qty'];
                    }
                    $mergedRow['provided_fields'] = $provided;
                    $merged[] = $mergedRow;
                } else {
                    $merged[] = $pastedRow;
                }
            }

            // Keep existing grid rows that weren't in paste untouched? No, keep untouched existing rows at the end OR return merged list with untouched rows preserved!
            foreach ($existingRows as $er) {
                $k = strtoupper(trim((string) ($er['sku'] ?? '')));
                if ($k !== '' && ! isset($seenPasted[$k])) {
                    $merged[] = $er;
                }
            }

            return array_values($merged);
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
        $clean = preg_replace('/[^0-9,.\-]/', '', $clean) ?? '';
        if ($clean === '' || str_starts_with($clean, '-')) {
            return -1;
        }
        if (str_contains($clean, ',')) {
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
            ->with(['product.categories:id', 'product.brand:id,name'])
            ->whereIn('id', array_values(array_filter(array_map(fn ($r): int => (int) ($r['variant_id'] ?? 0), $rows))))
            ->get()
            ->keyBy('id');

        $existingBySku = ProductVariant::query()
            ->with(['product.categories:id', 'product.brand:id,name'])
            ->whereIn('sku', array_unique($skus))
            ->get()
            ->keyBy(fn (ProductVariant $v): string => strtoupper($v->sku));

        $activeWholesaleRules = WholesaleRule::query()->where('status', 'active')->with('ruleProducts')->get();
        $activePromotions = Promotion::query()->where('is_active', true)->get();

        $newCount = 0;
        $updateCount = 0;
        $invalidCount = 0;
        $duplicateSkus = [];
        $unknownSkus = [];
        $annotated = [];

        foreach ($rows as $idx => $row) {
            $sku = strtoupper(trim((string) ($row['sku'] ?? '')));
            $variantId = ! empty($row['variant_id']) ? (int) $row['variant_id'] : null;

            /** @var ProductVariant|null $targetVariant */
            $targetVariant = $variantId ? $existingById->get($variantId) : ($sku !== '' ? $existingBySku->get($sku) : null);

            $productId = ! empty($row['product_id']) ? (int) $row['product_id'] : $defaultProductId;
            $provided = is_array($row['provided_fields'] ?? null) ? $row['provided_fields'] : null;

            // Blank fields keep existing variant values unless explicitly cleared
            $rawName = trim((string) ($row['name'] ?? ''));
            $name = $rawName !== '' ? $rawName : ($targetVariant?->name ?? '');

            $priceProvided = $provided === null
                ? (array_key_exists('price_cents', $row) && $row['price_cents'] !== null) || (isset($row['price_brl']) && trim((string) $row['price_brl']) !== '')
                : in_array('price', $provided, true);

            if ($priceProvided) {
                $priceCents = array_key_exists('price_cents', $row) && $row['price_cents'] !== null
                    ? (int) $row['price_cents']
                    : $this->parseBrazilianCents($row['price_brl'] ?? null);
            } else {
                $priceCents = $targetVariant ? $targetVariant->price_cents : 0;
            }

            $clearPromo = ! empty($row['clear_promo']);
            $promoProvided = $provided === null
                ? $clearPromo || (! empty($row['promo_price_cents'])) || (isset($row['promo_price_brl']) && trim((string) $row['promo_price_brl']) !== '')
                : in_array('promo_price', $provided, true);

            if ($clearPromo) {
                $promoCents = null;
            } elseif ($promoProvided) {
                $promoCents = ! empty($row['promo_price_cents'])
                    ? (int) $row['promo_price_cents']
                    : (isset($row['promo_price_brl']) && trim((string) $row['promo_price_brl']) !== ''
                        ? $this->parseBrazilianCents($row['promo_price_brl'])
                        : null);
            } else {
                // Keep existing promo when cell is empty!
                $promoCents = $targetVariant?->promo_price_cents;
            }

            $clearCost = ! empty($row['clear_cost']);
            $costProvided = $provided === null
                ? ($clearCost || (array_key_exists('cost_cents', $row) && $row['cost_cents'] !== null && $row['cost_cents'] !== '') || (isset($row['cost_brl']) && trim((string) $row['cost_brl']) !== ''))
                : in_array('cost', $provided, true);

            if ($clearCost) {
                $costCents = null;
            } elseif ($costProvided) {
                $costCents = (array_key_exists('cost_cents', $row) && $row['cost_cents'] !== null && $row['cost_cents'] !== '')
                    ? (int) $row['cost_cents']
                    : $this->parseBrazilianCents($row['cost_brl'] ?? null);
            } else {
                // Blank cell preserves existing variant/product cost verbatim!
                $costCents = $targetVariant ? $targetVariant->cost_cents : null;
            }

            $stockProvided = $provided === null
                ? (array_key_exists('stock_qty', $row) && $row['stock_qty'] !== null && $row['stock_qty'] !== '')
                : in_array('stock', $provided, true);

            if ($stockProvided) {
                $stockQty = is_numeric($row['stock_qty']) ? (int) $row['stock_qty'] : -1;
            } else {
                $stockQty = $targetVariant ? $targetVariant->stock_qty : 0;
            }

            $errors = [];
            if ($sku === '') {
                $errors[] = 'SKU obrigatório.';
            } elseif (($skuCounts[$sku] ?? 0) > 1) {
                $errors[] = "SKU {$sku} repetido na grade.";
                $duplicateSkus[] = $sku;
            }

            if ($name === '') {
                $errors[] = 'Nome da tonalidade/variante obrigatório.';
            }
            if ($priceCents <= 0) {
                $errors[] = 'Preço inválido ou não informado.';
            }
            if ($promoCents !== null && ($promoCents <= 0 || ($priceCents > 0 && $promoCents >= $priceCents))) {
                $errors[] = 'Preço promocional inválido ou maior/igual ao preço normal.';
            }
            if ($costProvided && ! $clearCost && ($costCents === null || $costCents < 0)) {
                $errors[] = 'Custo unitário inválido (informe um valor >= R$ 0,00 ou deixe vazio para manter).';
            }
            if ($stockQty < 0) {
                $errors[] = 'Estoque inválido ou negativo.';
            }

            if ($targetVariant) {
                if ($productId !== null && (int) $targetVariant->product_id !== $productId) {
                    $errors[] = "SKU {$sku} pertence a outro produto ({$targetVariant->product?->name}).";
                    $duplicateSkus[] = $sku;
                }
                if ($stockQty >= 0 && $stockQty < $targetVariant->reserved_qty) {
                    $errors[] = "Estoque ({$stockQty}) menor que o reservado ({$targetVariant->reserved_qty}).";
                }
            } elseif ($productId === null) {
                if ($sku !== '') {
                    $unknownSkus[] = $sku;
                    $errors[] = "SKU desconhecido ({$sku}): selecione um produto destino para criar ou corrija o identificador.";
                } else {
                    $errors[] = 'Selecione o produto de destino para novas variações.';
                }
            }

            $changes = [];
            $impacts = [];
            if ($targetVariant) {
                if ($name !== $targetVariant->name) {
                    $changes[] = ['field' => 'name', 'label' => 'Nome', 'old_display' => $targetVariant->name, 'new_display' => $name];
                }
                if ($priceCents > 0 && $priceCents !== $targetVariant->price_cents) {
                    $changes[] = ['field' => 'price_cents', 'label' => 'Preço', 'old_display' => $this->brl($targetVariant->price_cents), 'new_display' => $this->brl($priceCents)];
                }
                if ($promoCents !== $targetVariant->promo_price_cents) {
                    $changes[] = [
                        'field' => 'promo_price_cents',
                        'label' => 'Promo',
                        'old_display' => $targetVariant->promo_price_cents ? $this->brl($targetVariant->promo_price_cents) : '—',
                        'new_display' => $promoCents ? $this->brl($promoCents) : 'Removido',
                    ];
                }
                if ($costProvided && $costCents !== $targetVariant->cost_cents) {
                    $oldCostEff = $targetVariant->cost_cents;
                    $changes[] = [
                        'field' => 'cost_cents',
                        'label' => 'Custo unitário',
                        'old_display' => $oldCostEff !== null ? $this->brl($oldCostEff) : 'Não informado',
                        'new_display' => $clearCost || $costCents === null ? 'Não informado' : $this->brl($costCents),
                    ];
                }
                if ($stockQty >= 0 && $stockQty !== $targetVariant->stock_qty) {
                    $availBefore = $targetVariant->availableStock();
                    $availAfter = max(0, $stockQty - $targetVariant->reserved_qty);
                    $changes[] = [
                        'field' => 'stock_qty',
                        'label' => 'Estoque',
                        'old_display' => "{$targetVariant->stock_qty} un. (disp. {$availBefore})",
                        'new_display' => "{$stockQty} un. (disp. {$availAfter})",
                    ];
                }

                if ($changes !== [] && $targetVariant->product) {
                    $prod = $targetVariant->product;
                    $catIds = $prod->categories->pluck('id')->all();
                    foreach ($activeWholesaleRules as $rule) {
                        $matches = $rule->ruleProducts->contains(fn ($rp): bool => ! $rp->is_excluded && (
                            ($rp->product_id && (int) $rp->product_id === (int) $prod->id) ||
                            ($rp->category_id && in_array((int) $rp->category_id, $catIds, true)) ||
                            ($rp->product_id === null && $rp->category_id === null && $rp->wholesale_group_id === null)
                        ));
                        if ($matches && ($priceCents !== $targetVariant->price_cents || $promoCents !== $targetVariant->promo_price_cents)) {
                            $impacts[] = "Atacado ({$rule->name}) recalculará sobre o novo preço.";
                        }
                    }
                    foreach ($activePromotions as $promo) {
                        $scopeIds = array_map('intval', $promo->scope_ids ?? []);
                        if ($promo->scope_type === 'all' || ($promo->scope_type === 'product' && in_array($prod->id, $scopeIds, true))) {
                            $impacts[] = "Promoção ativa ({$promo->name}) acompanha este item.";
                        }
                    }
                }
            } elseif ($errors === []) {
                $changes[] = ['field' => 'create', 'label' => 'Novo SKU', 'old_display' => '—', 'new_display' => "{$this->brl($priceCents)} · {$stockQty} un."];
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
                'product_name' => $targetVariant?->product?->name ?? ($row['product_name'] ?? ''),
                'name' => $name,
                'shade_code' => isset($row['shade_code']) && trim((string) $row['shade_code']) !== '' ? trim((string) $row['shade_code']) : $targetVariant?->shade_code,
                'color_family' => isset($row['color_family']) && trim((string) $row['color_family']) !== '' ? trim((string) $row['color_family']) : $targetVariant?->color_family,
                'color_hex' => isset($row['color_hex']) && trim((string) $row['color_hex']) !== '' ? trim((string) $row['color_hex']) : $targetVariant?->color_hex,
                'sku' => $sku,
                'price_cents' => $priceCents,
                'promo_price_cents' => $promoCents,
                'cost_cents' => $costProvided ? ($clearCost ? null : $costCents) : ($targetVariant?->cost_cents),
                'cost_provided' => $costProvided,
                'clear_cost' => $clearCost,
                'stock_qty' => $stockQty,
                'reserved_qty' => $targetVariant?->reserved_qty ?? 0,
                'expected_updated_at' => $row['expected_updated_at'] ?? $targetVariant?->updated_at?->toIso8601String(),
                'expected_stock_qty' => array_key_exists('expected_stock_qty', $row) ? $row['expected_stock_qty'] : $targetVariant?->stock_qty,
                'sort_order' => isset($row['sort_order']) ? (int) $row['sort_order'] : ($targetVariant?->sort_order ?? $idx),
                'is_active' => array_key_exists('is_active', $row) ? (bool) $row['is_active'] : ($targetVariant?->is_active ?? true),
                'action' => $action,
                'changes' => $changes,
                'impacts' => array_values(array_unique($impacts)),
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
                'unknown_skus' => array_values(array_unique($unknownSkus)),
            ],
            'rows' => $annotated,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     * @return array<string, mixed>
     */
    public function commit(
        array $rows,
        User $actor,
        string $idempotencyKey,
        string $source = 'grid',
        ?int $defaultProductId = null,
        bool $applyValidOnly = false,
        bool $checkConcurrency = false,
    ): array {
        $existingBatch = BulkEditBatch::query()->where('idempotency_key', $idempotencyKey)->with('items')->first();
        if ($existingBatch) {
            return [
                'batch' => $existingBatch,
                'idempotent_replay' => true,
                'pending_rows' => [],
                'counts' => [
                    'completed' => $existingBatch->created_count + $existingBatch->updated_count,
                    'skipped' => $existingBatch->skipped_count,
                    'pending' => $existingBatch->pending_count,
                ],
            ];
        }

        if (count($rows) > 500) {
            throw ValidationException::withMessages(['rows' => ['Limite máximo de 500 linhas por lote.']]);
        }

        $preview = $this->preview($rows, $defaultProductId);
        if (($preview['summary']['invalid_count'] ?? 0) > 0 && ! $applyValidOnly) {
            throw ValidationException::withMessages([
                'rows' => ['Corrija as linhas inválidas destacadas antes de confirmar o lote.'],
            ]);
        }

        $canPrice = $actor->hasPermission('catalog.pricing') || $actor->hasPermission('catalog.write');
        $canCost = $actor->hasPermission('catalog.cost.write');
        $canStock = $actor->hasPermission('inventory.manage') || $actor->hasPermission('catalog.write');

        $pendingRows = [];
        $conflicts = [];
        $skippedCount = 0;

        $batch = DB::transaction(function () use (
            $preview,
            $rows,
            $actor,
            $idempotencyKey,
            $source,
            $canPrice,
            $canCost,
            $canStock,
            $applyValidOnly,
            $checkConcurrency,
            &$pendingRows,
            &$conflicts,
            &$skippedCount,
        ): ?BulkEditBatch {
            $batch = BulkEditBatch::query()->create([
                'batch_code' => 'LOTE-'.now()->format('ymd').'-'.strtoupper(Str::random(5)),
                'idempotency_key' => $idempotencyKey,
                'user_id' => $actor->id,
                'source' => $source,
                'operation_type' => 'grid_edit',
                'status' => 'completed',
                'total_rows' => (int) $preview['summary']['total_rows'],
                'created_count' => 0,
                'updated_count' => 0,
                'skipped_count' => 0,
                'pending_count' => 0,
                'failed_count' => 0,
                'summary' => $preview['summary'],
            ]);

            $createdCount = 0;
            $updatedCount = 0;

            foreach ($preview['rows'] as $idx => $row) {
                $rawRow = $rows[$idx] ?? [];
                if (empty($row['valid'])) {
                    $skippedCount++;
                    $pendingRows[] = array_merge($rawRow, $row);
                    BulkEditBatchItem::query()->create([
                        'bulk_edit_batch_id' => $batch->id,
                        'product_id' => $row['product_id'],
                        'product_variant_id' => $row['variant_id'],
                        'sku' => (string) $row['sku'],
                        'action' => 'skipped',
                        'old_values' => null,
                        'new_values' => null,
                        'error_message' => implode(' ', $row['errors'] ?? []),
                    ]);

                    continue;
                }

                $existing = ! empty($row['variant_id'])
                    ? ProductVariant::query()->lockForUpdate()->find((int) $row['variant_id'])
                    : null;

                if ($existing) {
                    if ($checkConcurrency) {
                        $expStock = $rawRow['expected_stock_qty'] ?? null;
                        $expUpdated = $rawRow['expected_updated_at'] ?? null;
                        $hasConflict = false;
                        $conflictReason = '';
                        if ($expStock !== null && (int) $expStock !== $existing->stock_qty && (int) $row['stock_qty'] !== $existing->stock_qty) {
                            $hasConflict = true;
                            $conflictReason = "Saldo alterado concorrentemente de {$expStock} para {$existing->stock_qty} un.";
                        } elseif ($expUpdated && $existing->updated_at && $existing->updated_at->toIso8601String() !== $expUpdated && ($existing->stock_qty !== (int) $row['stock_qty'] || $existing->price_cents !== (int) $row['price_cents'])) {
                            $hasConflict = true;
                            $conflictReason = 'Variação atualizada concorrentemente após abertura da prévia.';
                        }

                        if ($hasConflict) {
                            $conflicts[] = [
                                'sku' => $existing->sku,
                                'variant_id' => $existing->id,
                                'reason' => $conflictReason,
                                'live_stock_qty' => $existing->stock_qty,
                                'live_price_cents' => $existing->price_cents,
                            ];
                            if ($applyValidOnly) {
                                $skippedCount++;
                                $pendingRows[] = array_merge($rawRow, $row, ['errors' => [$conflictReason], 'valid' => false]);

                                continue;
                            }
                            continue;
                        }
                    }

                    $oldValues = [
                        'name' => $existing->name,
                        'shade_code' => $existing->shade_code,
                        'price_cents' => $existing->price_cents,
                        'promo_price_cents' => $existing->promo_price_cents,
                        'cost_cents' => $existing->cost_cents,
                        'stock_qty' => $existing->stock_qty,
                        'is_active' => $existing->is_active,
                    ];

                    if ($existing->price_cents !== $row['price_cents'] && ! $canPrice) {
                        throw ValidationException::withMessages(['permissions' => ['Você não possui permissão para alterar preços comerciais.']]);
                    }
                    $costProvided = ! empty($row['cost_provided']);
                    $targetCostCents = $row['cost_cents'] ?? null;
                    if ($costProvided && $existing->cost_cents !== $targetCostCents && ! $canCost) {
                        throw ValidationException::withMessages(['permissions' => ['Você não possui permissão para alterar custos unitários de mercadoria.']]);
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
                    if ($costProvided && $canCost) {
                        $updatePayload['cost_cents'] = ! empty($row['clear_cost']) ? null : $targetCostCents;
                    }

                    $existing->update($updatePayload);

                    if ($existing->is_default && $existing->product) {
                        $prodSync = [];
                        if ($canPrice) {
                            $prodSync['price_cents'] = $row['price_cents'];
                            $prodSync['promo_price_cents'] = $row['promo_price_cents'];
                        }
                        if ($costProvided && $canCost && $existing->product->variants()->count() <= 1) {
                            $prodSync['cost_cents'] = ! empty($row['clear_cost']) ? null : $targetCostCents;
                        }
                        if ($prodSync !== []) {
                            $existing->product->update($prodSync);
                        }
                    }

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
                    $updatedCount++;
                } else {
                    if (! $canPrice || ! $canStock) {
                        throw ValidationException::withMessages(['permissions' => ['Cadastro de novas variações exige permissão de preço e estoque.']]);
                    }
                    $product = Product::query()->findOrFail((int) $row['product_id']);
                    if (! empty($row['cost_provided']) && ! $canCost) {
                        throw ValidationException::withMessages(['permissions' => ['Você não possui permissão para definir custos de mercadoria.']]);
                    }
                    $created = ProductVariant::query()->create([
                        'product_id' => $product->id,
                        'sku' => $row['sku'],
                        'name' => $row['name'],
                        'shade_code' => $row['shade_code'],
                        'color_family' => $row['color_family'],
                        'color_hex' => $row['color_hex'],
                        'price_cents' => $row['price_cents'],
                        'promo_price_cents' => $row['promo_price_cents'],
                        'cost_cents' => (! empty($row['cost_provided']) && empty($row['clear_cost'])) ? ($row['cost_cents'] ?? null) : null,
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
                    $createdCount++;
                }
            }

            if ($conflicts !== [] && ! $applyValidOnly) {
                DB::rollBack();

                return null;
            }

            $batch->update([
                'status' => $pendingRows !== [] && ($createdCount + $updatedCount) > 0 ? 'partial' : ($pendingRows !== [] ? 'failed' : 'completed'),
                'created_count' => $createdCount,
                'updated_count' => $updatedCount,
                'skipped_count' => $skippedCount,
                'pending_count' => count($pendingRows),
                'failed_count' => count($pendingRows),
            ]);

            return $batch;
        });

        if ($batch === null && $conflicts !== []) {
            return [
                'status' => 'conflict',
                'batch' => null,
                'idempotent_replay' => false,
                'conflicts' => $conflicts,
                'pending_rows' => [],
                'counts' => ['completed' => 0, 'skipped' => 0, 'pending' => count($conflicts)],
            ];
        }

        SeoController::clearCaches();
        Cache::forget('storefront.bootstrap.v1');
        Cache::forget('storefront.catalog.filters.v1');
        app(WholesalePricingService::class)->flushCache();

        $this->audit->record(
            'catalog.bulk_variants_committed',
            $actor,
            'bulk_edit_batch',
            $batch?->id,
            null,
            array_merge($preview['summary'], [
                'completed' => ($batch->created_count ?? 0) + ($batch->updated_count ?? 0),
                'skipped' => $skippedCount,
                'pending' => count($pendingRows),
            ]),
        );

        return [
            'status' => $batch?->status ?? 'completed',
            'batch' => $batch?->fresh(['items', 'user:id,name']),
            'idempotent_replay' => false,
            'conflicts' => $conflicts,
            'pending_rows' => $pendingRows,
            'counts' => [
                'completed' => ($batch->created_count ?? 0) + ($batch->updated_count ?? 0),
                'skipped' => $skippedCount,
                'pending' => count($pendingRows),
            ],
        ];
    }

    private function brl(int $cents): string
    {
        return 'R$ '.number_format($cents / 100, 2, ',', '.');
    }
}
