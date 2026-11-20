<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Domain\Catalog\Events\VariantRestocked;
use App\Domain\Shared\Enums\ProductType;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CatalogCsvService
{
    public function exportCsv(): string
    {
        $handle = fopen('php://temp', 'r+');
        if ($handle === false) {
            return '';
        }

        fputcsv($handle, [
            'sku', 'name', 'slug', 'brand', 'categories', 'price_cents',
            'promo_price_cents', 'stock_qty', 'weight_grams', 'is_active',
            'variant_sku', 'variant_name',
        ], ';');

        $products = Product::query()->with(['brand', 'categories', 'variants'])->orderBy('id')->get();
        foreach ($products as $product) {
            $cats = $product->categories->pluck('slug')->implode('|');
            if ($product->variants->isEmpty()) {
                fputcsv($handle, [
                    $product->sku, $product->name, $product->slug,
                    $product->brand ? $product->brand->name : '', $cats, $product->price_cents,
                    $product->promo_price_cents ?? '', 0, $product->weight_grams,
                    $product->is_active ? '1' : '0', $product->sku, 'Padrão',
                ], ';');

                continue;
            }
            foreach ($product->variants as $variant) {
                fputcsv($handle, [
                    $product->sku, $product->name, $product->slug,
                    $product->brand ? $product->brand->name : '', $cats, $variant->price_cents,
                    $variant->promo_price_cents ?? '', $variant->stock_qty,
                    $variant->weight_grams ?? $product->weight_grams,
                    $product->is_active && $variant->is_active ? '1' : '0',
                    $variant->sku, $variant->name,
                ], ';');
            }
        }

        rewind($handle);
        $csv = stream_get_contents($handle) ?: '';
        fclose($handle);

        return $csv;
    }

    /** @return array{dry_run: bool, total_rows: int, created: int, updated: int, errors: list<array{row: int, message: string}>, preview: list<array<string, mixed>>} */
    public function importCsv(string $csvContent, bool $dryRun = true): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($csvContent)) ?: [];
        if (count($lines) < 2) {
            return ['dry_run' => $dryRun, 'total_rows' => 0, 'created' => 0, 'updated' => 0, 'errors' => [['row' => 1, 'message' => 'Arquivo CSV vazio ou sem cabeçalho.']], 'preview' => []];
        }

        $delimiter = str_contains($lines[0], ';') ? ';' : ',';
        $headers = array_map(fn ($h) => strtolower(trim((string) $h)), str_getcsv($lines[0], $delimiter));

        $errors = [];
        $preview = [];
        $seenVariantSkus = [];
        $created = 0;
        $updated = 0;

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
            $sku = $assoc['sku'] ?? '';
            $variantSku = ($assoc['variant_sku'] ?? '') ?: $sku;
            $name = $assoc['name'] ?? '';
            $priceCents = (int) ($assoc['price_cents'] ?? 0);

            if ($sku === '' || $name === '' || $priceCents <= 0) {
                $errors[] = ['row' => $rowNum, 'message' => 'SKU, nome e price_cents (> 0) são obrigatórios.'];

                continue;
            }
            if (isset($seenVariantSkus[$variantSku])) {
                $errors[] = ['row' => $rowNum, 'message' => "SKU de variação duplicado no arquivo: {$variantSku}."];

                continue;
            }
            $seenVariantSkus[$variantSku] = true;
            $assoc['_row'] = $rowNum;
            $assoc['_variant_sku'] = $variantSku;
            $rows[] = $assoc;
            $preview[] = [
                'row' => $rowNum,
                'sku' => $sku,
                'variant_sku' => $variantSku,
                'name' => $name,
                'price_cents' => $priceCents,
                'stock_qty' => (int) ($assoc['stock_qty'] ?? 0),
                'exists' => Product::query()->where('sku', $sku)->exists(),
            ];
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

        $restockedEvents = [];

        DB::transaction(function () use ($rows, &$created, &$updated, &$restockedEvents): void {
            foreach ($rows as $row) {
                $brandId = null;
                if (! empty($row['brand'])) {
                    $brand = Brand::query()->firstOrCreate(
                        ['slug' => Str::slug($row['brand'])],
                        ['name' => $row['brand'], 'is_active' => true]
                    );
                    $brandId = $brand->id;
                }

                $existing = Product::query()->where('sku', $row['sku'])->first();
                $slug = ! empty($row['slug']) ? Str::slug($row['slug']) : Str::slug($row['name'].'-'.$row['sku']);
                $priceCents = (int) $row['price_cents'];
                $promoCents = ! empty($row['promo_price_cents']) ? (int) $row['promo_price_cents'] : null;
                $weightGrams = max(50, (int) ($row['weight_grams'] ?? 200));
                $isActive = ($row['is_active'] ?? '1') !== '0';

                if ($existing) {
                    $existing->update([
                        'name' => $row['name'],
                        'brand_id' => $brandId ?? $existing->brand_id,
                        'price_cents' => $priceCents,
                        'promo_price_cents' => $promoCents,
                        'weight_grams' => $weightGrams,
                        'is_active' => $isActive,
                    ]);
                    $product = $existing;
                    $updated++;
                } else {
                    $product = Product::query()->create([
                        'brand_id' => $brandId,
                        'name' => $row['name'],
                        'slug' => $slug,
                        'sku' => $row['sku'],
                        'product_type' => ProductType::Simple,
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
                $prevAvailable = $existingVariant ? $existingVariant->availableStock() : 0;
                $newStockQty = max(0, (int) ($row['stock_qty'] ?? 0));

                $savedVariant = ProductVariant::query()->updateOrCreate(
                    ['sku' => $row['_variant_sku']],
                    [
                        'product_id' => $product->id,
                        'name' => ($row['variant_name'] ?? '') ?: 'Padrão',
                        'price_cents' => $priceCents,
                        'promo_price_cents' => $promoCents,
                        'stock_qty' => $newStockQty,
                        'weight_grams' => $weightGrams,
                        'is_default' => $row['_variant_sku'] === $row['sku'],
                        'is_active' => $isActive,
                    ]
                );

                $newAvailable = $savedVariant->availableStock();
                if ($existingVariant && $prevAvailable <= 0 && $newAvailable > 0) {
                    $restockedEvents[] = new VariantRestocked($savedVariant, $prevAvailable, $newAvailable, 'Importação CSV de catálogo');
                }
            }
        });

        foreach ($restockedEvents as $event) {
            event($event);
            app(RestockNotificationService::class)->handleVariantRestocked($event);
        }

        return [
            'dry_run' => false,
            'total_rows' => count($rows),
            'created' => $created,
            'updated' => $updated,
            'errors' => $errors,
            'preview' => array_slice($preview, 0, 50),
        ];
    }
}
