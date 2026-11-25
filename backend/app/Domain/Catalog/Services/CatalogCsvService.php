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
        private readonly CategoryPathResolver $categoryResolver,
        private readonly CategoryHierarchyService $categoryHierarchy,
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

    /**
     * @param  array<string, int|string>  $categoryOverrides
     * @return array{dry_run: bool, total_rows: int, created: int, updated: int, errors: list<array{row: int, message: string}>, preview: list<array<string, mixed>>}
     */
    public function importXlsxFile(string $filePath, bool $dryRun = true, ?User $actor = null, array $categoryOverrides = []): array
    {
        $matrix = $this->parseXlsxToMatrix($filePath);
        if (count($matrix) < 2) {
            return [
                'dry_run' => true,
                'total_rows' => 0,
                'created' => 0,
                'updated' => 0,
                'errors' => [['row' => 1, 'message' => 'Planilha Excel (.xlsx) vazia ou sem cabeçalho.']],
                'preview' => [],
            ];
        }

        return $this->importMatrix($matrix, $dryRun, $actor, $categoryOverrides);
    }

    /**
     * @param  array<string, int|string>  $categoryOverrides
     * @return array{dry_run: bool, total_rows: int, created: int, updated: int, errors: list<array{row: int, message: string}>, preview: list<array<string, mixed>>}
     */
    public function importCsv(string $csvContent, bool $dryRun = true, ?User $actor = null, array $categoryOverrides = []): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($csvContent)) ?: [];
        if (count($lines) < 2) {
            return [
                'dry_run' => $dryRun,
                'total_rows' => 0,
                'created' => 0,
                'updated' => 0,
                'errors' => [['row' => 1, 'message' => 'Arquivo CSV vazio ou sem cabeçalho.']],
                'preview' => [],
            ];
        }

        $delimiter = str_contains($lines[0], "\t") ? "\t" : (str_contains($lines[0], ';') ? ';' : ',');
        $matrix = [];
        foreach ($lines as $line) {
            if (trim($line) === '') {
                continue;
            }
            $matrix[] = array_map(fn ($v): string => trim((string) $v), str_getcsv($line, $delimiter));
        }

        return $this->importMatrix($matrix, $dryRun, $actor, $categoryOverrides);
    }

    /**
     * @param  list<list<string>>  $matrix
     * @param  array<string, int|string>  $categoryOverrides
     * @return array{dry_run: bool, total_rows: int, created: int, updated: int, errors: list<array{row: int, message: string}>, preview: list<array<string, mixed>>}
     */
    public function importMatrix(array $matrix, bool $dryRun = true, ?User $actor = null, array $categoryOverrides = []): array
    {
        if (count($matrix) < 2) {
            return [
                'dry_run' => true,
                'total_rows' => 0,
                'created' => 0,
                'updated' => 0,
                'errors' => [['row' => 1, 'message' => 'Planilha vazia ou sem cabeçalho.']],
                'preview' => [],
            ];
        }

        $headers = array_map(fn (string $h): string => Str::ascii(mb_strtolower(trim($h))), $matrix[0]);

        $costColumnCents = $this->findHeaderKey($headers, ['cost_cents']);
        $costColumnBrl = $this->findHeaderKey($headers, ['custo_unitario', 'custo unitario (r$)', 'custo unitario', 'cost_brl', 'custo', 'cost']);
        $nameCol = $this->findHeaderKey($headers, ['name', 'nome', 'produto', 'nome_produto', 'nome do produto']);
        $catCol = $this->findHeaderKey($headers, ['categories', 'categoria', 'category', 'categorias']);
        $skuCol = $this->findHeaderKey($headers, ['sku', 'codigo', 'cod', 'referencia']);

        $allCategories = Category::query()->orderBy('sort_order')->orderBy('name')->get();
        $categoriesById = $allCategories->keyBy('id');

        $errors = [];
        $preview = [];
        $seenVariantSkus = [];
        $created = 0;
        $updated = 0;
        $anyCostProvided = false;

        $rows = [];
        for ($i = 1, $len = count($matrix); $i < $len; $i++) {
            $cols = $matrix[$i];
            if (array_filter($cols, fn (string $c): bool => trim($c) !== '') === []) {
                continue;
            }
            $assoc = [];
            foreach ($headers as $idx => $key) {
                $assoc[$key] = trim((string) ($cols[$idx] ?? ''));
            }
            $rowNum = $i + 1;

            $rawName = $nameCol !== null ? ($assoc[$nameCol] ?? '') : ($assoc['name'] ?? '');
            $rawSku = $skuCol !== null ? ($assoc[$skuCol] ?? '') : ($assoc['sku'] ?? '');
            $sku = $rawSku !== '' ? strtoupper($rawSku) : '';

            if ($sku === '' && $rawName !== '') {
                // Allow simplified sheets with (Nome, Valor, Categoria) without manual SKU column
                $skuPrefix = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', Str::ascii($rawName)) ?: 'PRD', 0, 6));
                $sku = "{$skuPrefix}-".str_pad((string) $rowNum, 3, '0', STR_PAD_LEFT);
            }

            $variantSku = strtoupper(($assoc['variant_sku'] ?? '') ?: $sku);
            $priceCents = $this->parsePriceField($assoc);

            $existingProduct = $sku !== '' ? Product::query()->where('sku', $sku)->first() : null;
            $existingVariant = $variantSku !== '' ? ProductVariant::query()->where('sku', $variantSku)->first() : null;

            if ($priceCents === 0 && $existingVariant) {
                $priceCents = $existingVariant->price_cents;
            } elseif ($priceCents === 0 && $existingProduct) {
                $priceCents = $existingProduct->price_cents;
            }

            $rawCategory = $catCol !== null ? ($assoc[$catCol] ?? '') : '';
            $catResolution = $this->resolveCategoriesForRow($rawCategory, $rowNum, $allCategories, $categoriesById, $categoryOverrides);

            $rowErrors = [];
            if ($sku === '' || ($rawName === '' && ! $existingProduct) || $priceCents <= 0) {
                $rowErrors[] = 'Nome e valor (> R$ 0,00) são obrigatórios (SKU é opcional e gerado se ausente).';
            }
            if (isset($seenVariantSkus[$variantSku])) {
                $rowErrors[] = "SKU de variação duplicado no arquivo: {$variantSku}.";
            }
            if ($catResolution['has_unresolved']) {
                $rowErrors[] = $catResolution['error_message'];
            }

            // Parse cost cell independently — NEVER copy sale price to cost_cents
            $costProvided = false;
            $parsedCostCents = null;
            if ($costColumnBrl !== null && ($assoc[$costColumnBrl] ?? '') !== '') {
                $costProvided = true;
                $parsedCostCents = $this->parseBrazilianCost($assoc[$costColumnBrl]);
                if ($parsedCostCents === -1) {
                    $rowErrors[] = "Custo unitário inválido para SKU {$variantSku}: \"{$assoc[$costColumnBrl]}\".";
                }
            } elseif ($costColumnCents !== null && ($assoc[$costColumnCents] ?? '') !== '') {
                $rawCostCents = $assoc[$costColumnCents];
                if (! preg_match('/^\d+$/', $rawCostCents)) {
                    $rowErrors[] = "Valor em cost_cents inválido para SKU {$variantSku}.";
                } else {
                    $costProvided = true;
                    $parsedCostCents = (int) $rawCostCents;
                }
            }

            if ($costProvided) {
                $anyCostProvided = true;
            }

            foreach ($rowErrors as $msg) {
                $errors[] = ['row' => $rowNum, 'message' => $msg];
            }

            $seenVariantSkus[$variantSku] = true;
            $assoc['_row'] = $rowNum;
            $assoc['_sku'] = $sku;
            $assoc['_variant_sku'] = $variantSku;
            $assoc['_name'] = $rawName !== '' ? $rawName : ($existingProduct ? $existingProduct->name : '');
            $assoc['_price_cents'] = $priceCents;
            $assoc['_cost_provided'] = $costProvided;
            $assoc['_cost_cents'] = $parsedCostCents;
            $assoc['_resolved_category_ids'] = $catResolution['category_ids'];
            $assoc['_primary_category_id'] = $catResolution['primary_category_id'];

            if ($rowErrors === []) {
                $rows[] = $assoc;
            }

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
                'stock_qty' => ($assoc['stock_qty'] ?? '') !== '' ? (int) $assoc['stock_qty'] : ($existingVariant ? $existingVariant->stock_qty : 0),
                'exists' => $existingProduct !== null || $existingVariant !== null,
                'raw_category' => $rawCategory,
                'category_status' => $catResolution['status'],
                'matched_categories' => $catResolution['matched_labels'],
                'category_ids' => $catResolution['category_ids'],
                'category_suggestions' => $catResolution['suggestions'],
                'row_errors' => $rowErrors,
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
                'total_rows' => count($preview),
                'created' => count($preview) - $wouldUpdate,
                'updated' => $wouldUpdate,
                'errors' => $errors,
                'preview' => array_slice($preview, 0, 100),
            ];
        }

        DB::transaction(function () use ($rows, &$created, &$updated, $actor): void {
            foreach ($rows as $row) {
                $brandId = null;
                if (! empty($row['brand']) || ! empty($row['marca'])) {
                    $brandName = (string) ($row['brand'] ?? $row['marca']);
                    $brand = Brand::query()->firstOrCreate(
                        ['slug' => Str::slug($brandName)],
                        ['name' => $brandName, 'is_active' => true]
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

                $resolvedCatIds = $row['_resolved_category_ids'];
                if ($resolvedCatIds !== []) {
                    $existingIds = $product->categories()->pluck('categories.id')->all();
                    $merged = array_values(array_unique(array_merge($resolvedCatIds, $existingIds)));
                    $this->categoryHierarchy->syncProductCategories(
                        $product,
                        $merged,
                        $row['_primary_category_id'] ?? $resolvedCatIds[0]
                    );
                }

                $existingVariant = ProductVariant::query()->where('sku', $row['_variant_sku'])->first();
                $hasStockCol = array_key_exists('stock_qty', $row) && $row['stock_qty'] !== '';
                $newStockQty = $hasStockCol ? max(0, (int) $row['stock_qty']) : ($existingVariant ? $existingVariant->stock_qty : 0);

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
                            'Importação CSV/Excel de catálogo'
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
                            'Importação CSV/Excel (saldo inicial)'
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
            'preview' => array_slice($preview, 0, 100),
        ];
    }

    /**
     * @param  \Illuminate\Support\Collection<int, Category>  $allCategories
     * @param  \Illuminate\Support\Collection<int, Category>  $categoriesById
     * @param  array<int|string, int|string>  $overrides
     * @return array{status: string, has_unresolved: bool, error_message: string, category_ids: list<int>, primary_category_id: int|null, matched_labels: list<string>, suggestions: list<array<string, mixed>>}
     */
    private function resolveCategoriesForRow(
        string $rawCategory,
        int $rowNum,
        $allCategories,
        $categoriesById,
        array $overrides,
    ): array {
        $rowOverride = $overrides["row:{$rowNum}"] ?? $overrides[$rowNum] ?? ($rawCategory !== '' ? ($overrides[$rawCategory] ?? null) : null);
        if ($rowOverride !== null && $rowOverride !== '') {
            $overrideCat = $categoriesById->get((int) $rowOverride);
            if ($overrideCat) {
                $ancestors = $this->categoryHierarchy->getAncestors((int) $overrideCat->id);
                $label = implode(' > ', array_map(fn (array $a): string => $a['name'], $ancestors));

                return [
                    'status' => 'matched',
                    'has_unresolved' => false,
                    'error_message' => '',
                    'category_ids' => [(int) $overrideCat->id],
                    'primary_category_id' => (int) $overrideCat->id,
                    'matched_labels' => [$label],
                    'suggestions' => [],
                ];
            }
        }

        if (trim($rawCategory) === '') {
            return [
                'status' => 'empty',
                'has_unresolved' => false,
                'error_message' => '',
                'category_ids' => [],
                'primary_category_id' => null,
                'matched_labels' => [],
                'suggestions' => [],
            ];
        }

        $tokens = str_contains($rawCategory, '|') && ! str_contains($rawCategory, '>')
            ? array_values(array_filter(array_map('trim', explode('|', $rawCategory))))
            : [trim($rawCategory)];

        $matchedIds = [];
        $matchedLabels = [];
        $suggestions = [];

        foreach ($tokens as $token) {
            $res = $this->categoryResolver->resolve($token, $allCategories);
            if ($res['status'] === 'matched' && $res['matched_category'] !== null) {
                $matchedIds[] = (int) $res['matched_category']['id'];
                $matchedLabels[] = (string) $res['matched_category']['full_path'];
            } else {
                $suggestions = $res['suggestions'];
                $suggText = $suggestions !== []
                    ? ' Sugestões: '.implode(', ', array_map(fn (array $s): string => $s['full_path'], array_slice($suggestions, 0, 3))).'.'
                    : '';

                return [
                    'status' => $res['status'],
                    'has_unresolved' => true,
                    'error_message' => "Categoria \"{$token}\" não encontrada ou ambígua.{$suggText}",
                    'category_ids' => [],
                    'primary_category_id' => null,
                    'matched_labels' => [],
                    'suggestions' => $suggestions,
                ];
            }
        }

        $matchedIds = array_values(array_unique($matchedIds));

        return [
            'status' => 'matched',
            'has_unresolved' => false,
            'error_message' => '',
            'category_ids' => $matchedIds,
            'primary_category_id' => $matchedIds[0] ?? null,
            'matched_labels' => $matchedLabels,
            'suggestions' => [],
        ];
    }

    /** @return list<list<string>> */
    private function parseXlsxToMatrix(string $path): array
    {
        if (! class_exists(\ZipArchive::class)) {
            return [];
        }

        $zip = new \ZipArchive;
        if ($zip->open($path) !== true) {
            return [];
        }

        $sharedStrings = [];
        $sharedXml = $zip->getFromName('xl/sharedStrings.xml');
        if (is_string($sharedXml)) {
            $sx = @simplexml_load_string($sharedXml);
            if ($sx !== false) {
                foreach ($sx->si as $si) {
                    if (isset($si->t)) {
                        $sharedStrings[] = (string) $si->t;
                    } elseif (isset($si->r)) {
                        $buf = '';
                        foreach ($si->r as $r) {
                            $buf .= (string) ($r->t ?? '');
                        }
                        $sharedStrings[] = $buf;
                    }
                }
            }
        }

        $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
        $zip->close();

        if (! is_string($sheetXml)) {
            return [];
        }

        $sx = @simplexml_load_string($sheetXml);
        if ($sx === false || ! isset($sx->sheetData->row)) {
            return [];
        }

        $matrix = [];
        foreach ($sx->sheetData->row as $xmlRow) {
            $rowCells = [];
            foreach ($xmlRow->c as $cell) {
                $ref = (string) ($cell['r'] ?? '');
                $colIdx = $this->excelColumnToIndex($ref);
                $type = (string) ($cell['t'] ?? '');
                $val = '';
                if ($type === 's') {
                    $val = $sharedStrings[(int) $cell->v] ?? '';
                } elseif ($type === 'inlineStr') {
                    $val = (string) ($cell->is->t ?? '');
                } else {
                    $val = (string) ($cell->v ?? '');
                }
                while (count($rowCells) < $colIdx) {
                    $rowCells[] = '';
                }
                $rowCells[$colIdx] = trim($val);
            }
            if (array_filter($rowCells, fn (string $v): bool => $v !== '') !== []) {
                $matrix[] = $rowCells;
            }
        }

        return $matrix;
    }

    private function excelColumnToIndex(string $cellRef): int
    {
        if (! preg_match('/^([A-Z]+)/i', $cellRef, $m)) {
            return 0;
        }
        $letters = strtoupper($m[1]);
        $index = 0;
        for ($i = 0; $i < strlen($letters); $i++) {
            $index = $index * 26 + (ord($letters[$i]) - ord('A') + 1);
        }

        return max(0, $index - 1);
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
        foreach (['preco_venda', 'preco de venda', 'preco', 'valor', 'price_brl', 'price'] as $key) {
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
