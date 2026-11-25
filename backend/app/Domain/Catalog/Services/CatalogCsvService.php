<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Domain\Shared\Enums\InventoryMovementType;
use App\Domain\Shared\Enums\ProductType;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CatalogCsvService
{
    public function __construct(
        private readonly InventoryService $inventory,
    ) {}

    public function exportCsv(bool $includeCost = false): string
    {
        $handle = fopen('php://temp', 'r+');
        if ($handle === false) {
            return '';
        }

        $headers = [
            'sku', 'name', 'slug', 'brand', 'categories', 'price_cents',
            'promo_price_cents', 'stock_qty', 'weight_grams', 'is_active',
            'variant_sku', 'variant_name',
        ];
        if ($includeCost) {
            $headers[] = 'custo_unitario';
        }
        fputcsv($handle, $headers, ';');

        $products = Product::query()->with(['brand', 'categories', 'variants'])->orderBy('id')->get();
        foreach ($products as $product) {
            $cats = $product->categories->pluck('slug')->implode('|');
            if ($product->variants->isEmpty()) {
                $row = [
                    $product->sku, $product->name, $product->slug,
                    $product->brand ? $product->brand->name : '', $cats, $product->price_cents,
                    $product->promo_price_cents ?? '', 0, $product->weight_grams,
                    $product->is_active ? '1' : '0', $product->sku, 'Padrão',
                ];
                if ($includeCost) {
                    $row[] = $product->cost_cents !== null
                        ? number_format($product->cost_cents / 100, 2, ',', '')
                        : '';
                }
                fputcsv($handle, $row, ';');

                continue;
            }
            foreach ($product->variants as $variant) {
                $row = [
                    $product->sku, $product->name, $product->slug,
                    $product->brand ? $product->brand->name : '', $cats, $variant->price_cents,
                    $variant->promo_price_cents ?? '', $variant->stock_qty,
                    $variant->weight_grams ?? $product->weight_grams,
                    $product->is_active && $variant->is_active ? '1' : '0',
                    $variant->sku, $variant->name,
                ];
                if ($includeCost) {
                    $effCost = $variant->effectiveCostCents();
                    $row[] = $effCost !== null
                        ? number_format($effCost / 100, 2, ',', '')
                        : '';
                }
                fputcsv($handle, $row, ';');
            }
        }

        rewind($handle);
        $csv = stream_get_contents($handle) ?: '';
        fclose($handle);

        return $csv;
    }

    /** @return array{dry_run: bool, total_rows: int, created: int, updated: int, errors: list<array{row: int, message: string}>, preview: list<array<string, mixed>>} */
    public function importCsv(string $csvContent, bool $dryRun = true, ?User $actor = null): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($csvContent)) ?: [];
        if (count($lines) < 2) {
            return ['dry_run' => $dryRun, 'total_rows' => 0, 'created' => 0, 'updated' => 0, 'errors' => [['row' => 1, 'message' => 'Arquivo CSV vazio ou sem cabeçalho.']], 'preview' => []];
        }

        $delimiter = str_contains($lines[0], ';') ? ';' : ',';
        $headers = array_map(fn ($h) => Str::ascii(mb_strtolower(trim((string) $h))), str_getcsv($lines[0], $delimiter));

        $costColumnCents = $this->findHeaderKey($headers, ['cost_cents']);
        $costColumnBrl = $this->findHeaderKey($headers, ['custo_unitario', 'custo unitario (r$)', 'custo unitario', 'cost_brl', 'custo', 'cost']);

        $errors = [];
        $preview = [];
        $seenVariantSkus = [];
        $created = 0;
        $updated = 0;
        $anyCostProvided = false;

        $rows = [];
        for ($i = 1, $len = count($lines); $i < $len; $i++) {
            if (trim($lines[$i]) === '') {
                continue;
            }
            $cols = str_getcsv($lines[$i], $delimiter);
            $assoc = [];
            foreach ($headers as $idx => $key) {
                $assoc[$key] = trim((string) ($cols[$idx] ?? ''));
            }
            $rowNum = $i + 1;
            $sku = strtoupper($assoc['sku'] ?? '');
            $variantSku = strtoupper(($assoc['variant_sku'] ?? '') ?: $sku);
            $name = $assoc['name'] ?? '';
            $priceCents = $this->parsePriceField($assoc);

            $existingProduct = $sku !== '' ? Product::query()->where('sku', $sku)->first() : null;
            $existingVariant = $variantSku !== '' ? ProductVariant::query()->where('sku', $variantSku)->first() : null;

            // If price omitted on update of existing SKU, preserve existing price; require price on create
            if ($priceCents === 0 && $existingVariant) {
                $priceCents = $existingVariant->price_cents;
            } elseif ($priceCents === 0 && $existingProduct) {
                $priceCents = $existingProduct->price_cents;
            }

            if ($sku === '' || ($name === '' && ! $existingProduct) || $priceCents <= 0) {
                $errors[] = ['row' => $rowNum, 'message' => 'SKU, nome e preço (> 0) são obrigatórios.'];

                continue;
            }
            if (isset($seenVariantSkus[$variantSku])) {
                $errors[] = ['row' => $rowNum, 'message' => "SKU de variação duplicado no arquivo: {$variantSku}."];

                continue;
            }

            // Parse cost cell preserving the 3-state semantics: blank -> null (preserve), 0/0,00 -> 0, positive -> cents
            $costProvided = false;
            $parsedCostCents = null;
            if ($costColumnBrl !== null && ($assoc[$costColumnBrl] ?? '') !== '') {
                $costProvided = true;
                $parsedCostCents = $this->parseBrazilianCost($assoc[$costColumnBrl]);
                if ($parsedCostCents === -1) {
                    $errors[] = ['row' => $rowNum, 'message' => "Custo unitário inválido para SKU {$variantSku}: \"{$assoc[$costColumnBrl]}\"."];

                    continue;
                }
            } elseif ($costColumnCents !== null && ($assoc[$costColumnCents] ?? '') !== '') {
                $rawCostCents = $assoc[$costColumnCents];
                if (! preg_match('/^\d+$/', $rawCostCents)) {
                    $errors[] = ['row' => $rowNum, 'message' => "Valor em cost_cents inválido para SKU {$variantSku}."];

                    continue;
                }
                $costProvided = true;
                $parsedCostCents = (int) $rawCostCents;
            }

            if ($costProvided) {
                $anyCostProvided = true;
            }

            $seenVariantSkus[$variantSku] = true;
            $assoc['_row'] = $rowNum;
            $assoc['_sku'] = $sku;
            $assoc['_variant_sku'] = $variantSku;
            $assoc['_name'] = $name !== '' ? $name : ($existingProduct?->name ?? '');
            $assoc['_price_cents'] = $priceCents;
            $assoc['_cost_provided'] = $costProvided;
            $assoc['_cost_cents'] = $parsedCostCents;
            $rows[] = $assoc;

            $oldCost = $existingVariant
                ? $existingVariant->effectiveCostCents()
                : $existingProduct?->cost_cents;
            $newCost = $costProvided ? $parsedCostCents : $oldCost;

            $preview[] = [
                'row' => $rowNum,
                'sku' => $sku,
                'variant_sku' => $variantSku,
                'name' => $assoc['_name'],
                'price_cents' => $priceCents,
                'stock_qty' => ($assoc['stock_qty'] ?? '') !== '' ? (int) $assoc['stock_qty'] : ($existingVariant?->stock_qty ?? 0),
                'exists' => $existingProduct !== null || $existingVariant !== null,
                'cost_provided' => $costProvided,
                'old_cost_cents' => $oldCost,
                'new_cost_cents' => $newCost,
                'old_cost_display' => $this->formatCostDisplay($oldCost),
                'new_cost_display' => $this->formatCostDisplay($newCost),
                'cost_action' => $costProvided
                    ? ($parsedCostCents === 0 ? 'set_zero' : 'updated')
                    : 'preserved',
            ];
        }

        if ($anyCostProvided && $actor !== null && ! $actor->hasPermission('catalog.cost.write')) {
            throw ValidationException::withMessages([
                'permissions' => ['Você não possui permissão para cadastrar ou alterar custos de mercadoria.'],
            ]);
        }

        if ($dryRun || count($errors) > 0) {
            $wouldUpdate = count(array_filter($preview, fn (array $p): bool => (bool) $p['exists']));

            return [
                'dry_run' => true,
                'total_rows' => count($rows),
                'created' => count($preview) - $wouldUpdate,
                'updated' => $wouldUpdate,
                'errors' => $errors,
                'preview' => array_slice($preview, 0, 50),
            ];
        }

        DB::transaction(function () use ($rows, &$created, &$updated, $actor): void {
            foreach ($rows as $row) {
                $brandId = null;
                if (! empty($row['brand'])) {
                    $brand = Brand::query()->firstOrCreate(
                        ['slug' => Str::slug($row['brand'])],
                        ['name' => $row['brand'], 'is_active' => true]
                    );
                    $brandId = $brand->id;
                }

                $existing = Product::query()->where('sku', $row['_sku'])->first();
                $slug = ! empty($row['slug']) ? Str::slug($row['slug']) : Str::slug($row['_name'].'-'.$row['_sku']);
                $priceCents = (int) $row['_price_cents'];
                $promoCents = ! empty($row['promo_price_cents']) ? (int) $row['promo_price_cents'] : null;
                $weightGrams = max(50, (int) (($row['weight_grams'] ?? '') ?: 200));
                $isActive = ($row['is_active'] ?? '1') !== '0';
                $costProvided = (bool) $row['_cost_provided'];
                $costCents = $row['_cost_cents'];
                $isPrimaryVariantRow = $row['_variant_sku'] === $row['_sku'];

                if ($existing) {
                    $prodUpdate = [
                        'name' => $row['_name'],
                        'brand_id' => $brandId ?? $existing->brand_id,
                        'price_cents' => $priceCents,
                        'promo_price_cents' => $promoCents,
                        'weight_grams' => $weightGrams,
                        'is_active' => $isActive,
                    ];
                    if ($costProvided && $isPrimaryVariantRow) {
                        $prodUpdate['cost_cents'] = $costCents;
                    }
                    $existing->update($prodUpdate);
                    $product = $existing;
                    $updated++;
                } else {
                    $product = Product::query()->create([
                        'brand_id' => $brandId,
                        'name' => $row['_name'],
                        'slug' => $slug,
                        'sku' => $row['_sku'],
                        'product_type' => ProductType::Simple,
                        'cost_cents' => ($costProvided && $isPrimaryVariantRow) ? $costCents : null,
                        'price_cents' => $priceCents,
                        'promo_price_cents' => $promoCents,
                        'weight_grams' => $weightGrams,
                        'is_active' => $isActive,
                    ]);
                    $created++;
                }

                if (! empty($row['categories'])) {
                    $catSlugs = array_filter(array_map('trim', explode('|', $row['categories'])));
                    $catIds = Category::query()->whereIn('slug', $catSlugs)->pluck('id')->all();
                    if (count($catIds) > 0) {
                        $product->categories()->syncWithoutDetaching($catIds);
                    }
                }

                $existingVariant = ProductVariant::query()->where('sku', $row['_variant_sku'])->first();
                $hasStockCol = array_key_exists('stock_qty', $row) && $row['stock_qty'] !== '';
                $newStockQty = $hasStockCol ? max(0, (int) $row['stock_qty']) : ($existingVariant?->stock_qty ?? 0);

                if ($existingVariant) {
                    $prevStockQty = $existingVariant->stock_qty;
                    $varUpdate = [
                        'product_id' => $product->id,
                        'name' => ($row['variant_name'] ?? '') ?: $existingVariant->name,
                        'price_cents' => $priceCents,
                        'promo_price_cents' => $promoCents,
                        'weight_grams' => $weightGrams,
                        'is_default' => $existingVariant->is_default || $isPrimaryVariantRow,
                        'is_active' => $isActive,
                    ];
                    if ($costProvided) {
                        $varUpdate['cost_cents'] = $costCents;
                    }
                    $existingVariant->update($varUpdate);

                    if ($hasStockCol && $newStockQty !== $prevStockQty) {
                        $this->inventory->adjustStock(
                            $existingVariant,
                            $newStockQty - $prevStockQty,
                            InventoryMovementType::Adjustment,
                            $actor,
                            'Importação CSV de catálogo'
                        );
                    }
                } else {
                    $savedVariant = ProductVariant::query()->create([
                        'product_id' => $product->id,
                        'sku' => $row['_variant_sku'],
                        'name' => ($row['variant_name'] ?? '') ?: 'Padrão',
                        'price_cents' => $priceCents,
                        'promo_price_cents' => $promoCents,
                        'cost_cents' => $costProvided ? $costCents : null,
                        'stock_qty' => 0,
                        'reserved_qty' => 0,
                        'weight_grams' => $weightGrams,
                        'is_default' => $isPrimaryVariantRow || ! $product->variants()->exists(),
                        'is_active' => $isActive,
                    ]);
                    if ($newStockQty > 0) {
                        $this->inventory->adjustStock(
                            $savedVariant,
                            $newStockQty,
                            InventoryMovementType::In,
                            $actor,
                            'Importação CSV (saldo inicial)'
                        );
                    }
                }
            }
        });

        return [
            'dry_run' => false,
            'total_rows' => count($rows),
            'created' => $created,
            'updated' => $updated,
            'errors' => $errors,
            'preview' => array_slice($preview, 0, 50),
        ];
    }

    /**
     * @param  list<string>  $headers
     * @param  list<string>  $candidates
     */
    private function findHeaderKey(array $headers, array $candidates): ?string
    {
        foreach ($candidates as $cand) {
            if (in_array($cand, $headers, true)) {
                return $cand;
            }
        }

        return null;
    }

    /** @param array<string, string> $assoc */
    private function parsePriceField(array $assoc): int
    {
        if (isset($assoc['price_cents']) && $assoc['price_cents'] !== '' && preg_match('/^\d+$/', $assoc['price_cents'])) {
            return (int) $assoc['price_cents'];
        }
        foreach (['preco_venda', 'preco', 'price_brl', 'price'] as $key) {
            if (isset($assoc[$key]) && $assoc[$key] !== '') {
                $cents = $this->parseBrazilianCost($assoc[$key]);

                return $cents > 0 ? $cents : 0;
            }
        }

        return 0;
    }

    private function parseBrazilianCost(string $raw): int
    {
        $clean = trim(str_ireplace('R$', '', $raw));
        $clean = preg_replace('/[^0-9,.\-]/', '', $clean) ?? '';
        if ($clean === '' || str_starts_with($clean, '-')) {
            return -1;
        }
        if (str_contains($clean, ',')) {
            $clean = str_replace('.', '', $clean);
            $clean = str_replace(',', '.', $clean);
        }
        if (! is_numeric($clean)) {
            return -1;
        }

        return (int) round((float) $clean * 100);
    }

    private function formatCostDisplay(?int $cents): string
    {
        if ($cents === null) {
            return 'Não informado';
        }

        return 'R$ '.number_format($cents / 100, 2, ',', '.');
    }
}
