<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Str;

class ProductImportValidator
{
    public function __construct(
        private readonly AIProviderService $provider,
    ) {}

    /**
     * Groups candidate rows into parent products + variants, resolves existing brands/categories,
     * detects SKU/GTIN/product duplicates, generates grounded names/descriptions/SEO, and flags missing data.
     *
     * @param  list<array<string, mixed>>  $rawRows
     * @return array{items: list<array<string, mixed>>, stats: array<string, int>}
     */
    public function analyzeAndBuildDraftItems(array $rawRows): array
    {
        $cfg = $this->provider->getConfig();
        $marginPct = max(0.0, (float) ($cfg['default_margin_pct'] ?? 100.0));

        $brands = Brand::query()->where('is_active', true)->get();
        $categories = Category::query()->where('is_active', true)->get();
        $existingProducts = Product::query()->with(['brand:id,name', 'variants:id,product_id,sku,name'])->get();
        $existingVariantsBySku = ProductVariant::query()->with('product:id,name,sku')->get()->keyBy(fn (ProductVariant $v): string => strtoupper($v->sku));

        $seenSkusInFile = [];
        $groupCounters = [];
        $items = [];

        $newCount = 0;
        $updateCount = 0;
        $duplicateCount = 0;
        $incompleteCount = 0;
        $errorCount = 0;

        foreach ($rawRows as $idx => $row) {
            $rawName = trim((string) ($row['product_name'] ?? ''));
            $brandNameRaw = ! empty($row['brand']) ? trim((string) $row['brand']) : null;
            $volume = ! empty($row['volume']) ? trim((string) $row['volume']) : null;
            $variantNameRaw = ! empty($row['variant_name']) ? trim((string) $row['variant_name']) : 'Padrão';
            $shadeCode = ! empty($row['shade_code']) ? trim((string) $row['shade_code']) : null;
            $sku = ! empty($row['sku']) ? strtoupper(trim((string) $row['sku'])) : null;
            $gtin = ! empty($row['gtin']) ? trim((string) $row['gtin']) : null;

            $baseLineName = $this->extractProductLineName($rawName, $variantNameRaw);
            $matchedBrand = $this->matchBrand($brandNameRaw, $brands);
            $matchedCategory = $this->matchCategory(! empty($row['category']) ? (string) $row['category'] : null, "{$rawName} {$baseLineName}", $categories);

            $standardizedProductName = $this->standardizeProductName($baseLineName, $matchedBrand->name ?? $brandNameRaw, $volume);
            $groupKey = Str::slug("{$standardizedProductName}|".($matchedBrand->slug ?? $brandNameRaw ?? ''));

            // Determine price & suggestion based purely on provided values
            $salePriceCents = isset($row['sale_price_cents']) ? (int) $row['sale_price_cents'] : null;
            $costPriceCents = isset($row['cost_price_cents']) ? (int) $row['cost_price_cents'] : null;
            $suggestedPriceCents = null;
            $priceOrigin = 'missing';

            if ($salePriceCents !== null && $salePriceCents > 0) {
                $priceOrigin = 'provided';
            } elseif ($costPriceCents !== null && $costPriceCents > 0) {
                $suggestedPriceCents = (int) round($costPriceCents * (1 + ($marginPct / 100)));
                $priceOrigin = 'ai_suggestion_from_cost';
            }

            $stockQty = array_key_exists('stock_qty', $row) && $row['stock_qty'] !== null ? (int) $row['stock_qty'] : null;

            // SKU rule: never replace existing supplier SKU, only suggest internal code if absent
            $skuOrigin = 'provided';
            if ($sku === null || $sku === '') {
                $sku = $this->suggestInternalSku($standardizedProductName, $shadeCode ?: $variantNameRaw, $idx);
                $skuOrigin = 'ai_suggestion';
            }

            $errors = [];
            $warnings = [];
            if ($rawName === '' || str_contains($rawName, 'Informação não identificada')) {
                $warnings[] = 'Nome comercial ausente ou não identificado na fonte — revisar.';
            }
            if ($priceOrigin === 'missing') {
                $warnings[] = 'Preço de venda não informado na fonte.';
            }
            if ($priceOrigin === 'ai_suggestion_from_cost') {
                $warnings[] = "Preço sugerido a partir do custo (+{$marginPct}% margem) — requer aprovação.";
            }
            if ($stockQty === null) {
                $warnings[] = 'Quantidade em estoque não informada.';
            } elseif ($stockQty < 0) {
                $errors[] = 'Quantidade em estoque negativa ou inválida.';
            }
            if (isset($seenSkusInFile[$sku])) {
                $errors[] = "SKU {$sku} duplicado dentro do mesmo envio.";
            }
            $seenSkusInFile[$sku] = true;

            // Duplicate check against real catalog
            $matchedVariant = $existingVariantsBySku->get($sku);
            $matchedProduct = $matchedVariant?->product;
            $duplicateComparison = null;
            $actionType = 'new_product';
            $resolutionChoice = 'create_new';

            if ($matchedVariant && $matchedProduct) {
                $actionType = 'update_variant';
                $resolutionChoice = 'update_existing';
                $updateCount++;
                $duplicateComparison = [
                    'reason' => 'SKU já cadastrado no catálogo oficial',
                    'existing' => [
                        'product_id' => $matchedProduct->id,
                        'product_name' => $matchedProduct->name,
                        'variant_id' => $matchedVariant->id,
                        'variant_name' => $matchedVariant->name,
                        'sku' => $matchedVariant->sku,
                        'price_cents' => $matchedVariant->price_cents,
                        'stock_qty' => $matchedVariant->stock_qty,
                    ],
                ];
            } else {
                // Compare Brand + Name/Line/Volume/GTIN
                $candidateProd = $this->findSimilarExistingProduct($standardizedProductName, $matchedBrand?->id, $gtin, $existingProducts);
                if ($candidateProd) {
                    $actionType = 'possible_duplicate';
                    $resolutionChoice = 'update_existing';
                    $matchedProduct = $candidateProd;
                    $duplicateCount++;
                    $duplicateComparison = [
                        'reason' => $gtin && $candidateProd->gtin === $gtin
                            ? 'Mesmo GTIN/EAN cadastrado'
                            : 'Nome comercial e marca semelhantes a produto existente',
                        'existing' => [
                            'product_id' => $candidateProd->id,
                            'product_name' => $candidateProd->name,
                            'sku' => $candidateProd->sku,
                            'price_cents' => $candidateProd->price_cents,
                        ],
                    ];
                } elseif (isset($groupCounters[$groupKey])) {
                    $actionType = 'new_variant';
                    $newCount++;
                } else {
                    $actionType = 'new_product';
                    $newCount++;
                }
            }

            $groupCounters[$groupKey] = ($groupCounters[$groupKey] ?? 0) + 1;

            if ($errors !== []) {
                $errorCount++;
            } elseif ($warnings !== []) {
                $incompleteCount++;
                if ($actionType === 'new_product' && $rawName === '') {
                    $actionType = 'insufficient_info';
                }
            }

            $slug = Str::slug($standardizedProductName);
            $shortDesc = $this->buildGroundedShortDescription($standardizedProductName, $matchedCategory?->name, $volume);
            $description = $this->buildGroundedDescription(
                $standardizedProductName,
                $matchedBrand->name ?? $brandNameRaw,
                $matchedCategory?->name,
                $volume,
                $row
            );

            $items[] = [
                'row_index' => $idx,
                'group_key' => $groupKey,
                'product_reference' => $standardizedProductName,
                'sku' => $sku,
                'gtin' => $gtin,
                'action_type' => $actionType,
                'matched_product_id' => $matchedProduct?->id,
                'matched_variant_id' => $matchedVariant?->id,
                'resolution_choice' => $resolutionChoice,
                'approval_status' => 'pending',
                'proposed_data' => [
                    'product_name' => $standardizedProductName,
                    'slug' => $slug,
                    'brand_id' => $matchedBrand?->id,
                    'brand_name' => $matchedBrand->name ?? $brandNameRaw,
                    'category_id' => $matchedCategory?->id,
                    'category_name' => $matchedCategory->name ?? (! empty($row['category']) ? (string) $row['category'] : null),
                    'variant_name' => $variantNameRaw,
                    'shade_code' => $shadeCode,
                    'color_family' => ! empty($row['color_family']) ? (string) $row['color_family'] : $this->inferColorFamily($variantNameRaw),
                    'color_hex' => ! empty($row['color_hex']) ? (string) $row['color_hex'] : null,
                    'volume' => $volume,
                    'sku' => $sku,
                    'gtin' => $gtin,
                    'cost_price_cents' => $costPriceCents,
                    'price_cents' => $salePriceCents ?? $suggestedPriceCents ?? 0,
                    'suggested_price_cents' => $suggestedPriceCents,
                    'promo_price_cents' => $row['promo_price_cents'] ?? null,
                    'stock_qty' => max(0, $stockQty ?? 0),
                    'short_description' => $shortDesc,
                    'description' => $description,
                    'ingredients' => $row['ingredients'] ?? null,
                    'usage_instructions' => $row['usage_instructions'] ?? null,
                    'manufacturer' => $row['manufacturer'] ?? null,
                    'seo_title' => mb_substr("{$standardizedProductName} | Mistura Feminina", 0, 160),
                    'seo_description' => mb_substr($shortDesc, 0, 160),
                    'image_alt' => $standardizedProductName.' — '.$variantNameRaw,
                ],
                'source_evidence' => [
                    'origin_file' => $row['origin_file'] ?? 'manual',
                    'origin_detail' => $row['origin_detail'] ?? '',
                    'fields' => [
                        'product_name' => $rawName !== '' ? 'provided' : 'missing',
                        'brand' => $matchedBrand ? 'existing' : ($brandNameRaw ? 'provided' : 'missing'),
                        'category' => $matchedCategory ? 'existing' : 'missing',
                        'sku' => $skuOrigin,
                        'price' => $priceOrigin,
                        'stock_qty' => $stockQty !== null ? 'provided' : 'missing',
                        'description' => 'ai_suggestion',
                        'ingredients' => ! empty($row['ingredients']) ? 'provided' : 'missing',
                    ],
                ],
                'validation_result' => [
                    'is_valid' => $errors === [] && ($salePriceCents !== null || $suggestedPriceCents !== null || $matchedVariant !== null),
                    'errors' => $errors,
                    'warnings' => $warnings,
                ],
                'duplicate_comparison' => $duplicateComparison,
            ];
        }

        return [
            'items' => $items,
            'stats' => [
                'total_records' => count($items),
                'grouped_products_count' => count($groupCounters),
                'grouped_variants_count' => count($items),
                'new_count' => $newCount,
                'update_count' => $updateCount,
                'duplicate_count' => $duplicateCount,
                'incomplete_count' => $incompleteCount,
                'error_count' => $errorCount,
            ],
        ];
    }

    private function extractProductLineName(string $rawName, string $variantName): string
    {
        if ($rawName === '') {
            return 'Produto Sem Nome';
        }
        $clean = trim($rawName);
        // Strip trailing shade token if already isolated in variant_name
        if ($variantName !== 'Padrão' && str_ends_with(mb_strtolower($clean), mb_strtolower($variantName))) {
            $stripped = trim(mb_substr($clean, 0, mb_strlen($clean) - mb_strlen($variantName)), ' -–|:');
            if ($stripped !== '') {
                return $stripped;
            }
        }

        return $clean;
    }

    private function standardizeProductName(string $baseLine, ?string $brandName, ?string $volume): string
    {
        $title = Str::title(preg_replace('/\s+/', ' ', trim($baseLine)) ?? $baseLine);
        if ($brandName !== null && $brandName !== '' && ! str_contains(mb_strtolower($title), mb_strtolower($brandName))) {
            $title .= ' '.Str::title($brandName);
        }
        if ($volume !== null && $volume !== '' && ! str_contains(mb_strtolower($title), mb_strtolower(str_replace(' ', '', $volume)))) {
            $title .= " — {$volume}";
        }

        return trim($title);
    }

    /** @param Collection<int, Brand> $brands */
    private function matchBrand(?string $brandName, $brands): ?Brand
    {
        if ($brandName === null || trim($brandName) === '') {
            return null;
        }
        $norm = preg_replace('/\b(ltda|s\/a|sa|me|epp|cosmeticos)\b/i', '', Str::ascii(mb_strtolower(trim($brandName)))) ?? '';
        $norm = trim(preg_replace('/\s+/', ' ', $norm) ?? '');

        foreach ($brands as $brand) {
            $bNorm = preg_replace('/\b(ltda|s\/a|sa|me|epp|cosmeticos)\b/i', '', Str::ascii(mb_strtolower($brand->name))) ?? '';
            $bNorm = trim(preg_replace('/\s+/', ' ', $bNorm) ?? '');
            if ($norm === $bNorm || ($norm !== '' && str_contains($bNorm, $norm)) || ($bNorm !== '' && str_contains($norm, $bNorm))) {
                return $brand;
            }
        }

        return null;
    }

    /** @param Collection<int, Category> $categories */
    private function matchCategory(?string $catRaw, string $text, $categories): ?Category
    {
        $needle = Str::ascii(mb_strtolower(trim(($catRaw ?? '').' '.$text)));
        foreach ($categories as $cat) {
            $cNorm = Str::ascii(mb_strtolower($cat->name));
            if ($catRaw && (str_contains($cNorm, Str::ascii(mb_strtolower($catRaw))) || str_contains(Str::ascii(mb_strtolower($catRaw)), $cNorm))) {
                return $cat;
            }
            if ($cNorm !== '' && str_contains($needle, $cNorm)) {
                return $cat;
            }
        }

        return null;
    }

    /** @param Collection<int, Product> $products */
    private function findSimilarExistingProduct(string $name, ?int $brandId, ?string $gtin, $products): ?Product
    {
        $normTarget = Str::ascii(mb_strtolower($name));
        foreach ($products as $prod) {
            if ($gtin && $prod->gtin && $prod->gtin === $gtin) {
                return $prod;
            }
            $normProd = Str::ascii(mb_strtolower($prod->name));
            if ($normTarget === $normProd && ($brandId === null || $prod->brand_id === $brandId)) {
                return $prod;
            }
        }

        return null;
    }

    private function suggestInternalSku(string $productName, string $variantName, int $index): string
    {
        $pCode = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', Str::ascii($productName)) ?: 'PRD', 0, 5));
        $vCode = strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', Str::ascii($variantName)) ?: 'VAR', 0, 5));

        return "{$pCode}-{$vCode}-".str_pad((string) ($index + 1), 2, '0', STR_PAD_LEFT);
    }

    private function inferColorFamily(string $variantName): ?string
    {
        $lower = Str::ascii(mb_strtolower($variantName));

        return match (true) {
            str_contains($lower, 'nude') || str_contains($lower, 'bege') => 'Nude',
            str_contains($lower, 'rosa') || str_contains($lower, 'pink') => 'Rosa',
            str_contains($lower, 'vermelh') || str_contains($lower, 'cereja') => 'Vermelho',
            str_contains($lower, 'roxo') || str_contains($lower, 'lilas') || str_contains($lower, 'uva') => 'Roxo',
            str_contains($lower, 'preto') || str_contains($lower, 'black') => 'Preto',
            str_contains($lower, 'branco') || str_contains($lower, 'renda') => 'Branco',
            default => null,
        };
    }

    private function buildGroundedShortDescription(string $name, ?string $category, ?string $volume): string
    {
        $parts = [$name];
        if ($category) {
            $parts[] = "na categoria {$category}";
        }
        if ($volume) {
            $parts[] = "em embalagem de {$volume}";
        }

        return implode(' ', $parts).', disponível na Mistura Feminina Cosméticos.';
    }

    /** @param array<string, mixed> $row */
    private function buildGroundedDescription(string $name, ?string $brand, ?string $category, ?string $volume, array $row): string
    {
        $paragraphs = [];
        $intro = "{$name}";
        if ($brand) {
            $intro .= " da marca {$brand}";
        }
        if ($category) {
            $intro .= " ({$category})";
        }
        if ($volume) {
            $intro .= ", apresentação de {$volume}";
        }
        $paragraphs[] = "{$intro}. Produto selecionado para o catálogo profissional da Mistura Feminina.";

        if (! empty($row['usage_instructions'])) {
            $paragraphs[] = 'Orientações de uso (conforme documentação do fornecedor): '.$row['usage_instructions'];
        }
        if (! empty($row['ingredients'])) {
            $paragraphs[] = 'Composição informada pelo fornecedor: '.$row['ingredients'];
        }
        if (! empty($row['manufacturer'])) {
            $paragraphs[] = 'Fabricante/Origem informada: '.$row['manufacturer'];
        }

        return implode("\n\n", $paragraphs);
    }
}
