<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use App\Domain\Catalog\Services\CategoryPathResolver;
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
        private readonly CategoryPathResolver $categoryResolver,
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
        $brands = Brand::query()->where('is_active', true)->get();
        $categories = Category::query()->where('is_active', true)->get();
        $existingProducts = Product::query()->with(['brand:id,name', 'variants:id,product_id,sku,gtin,name'])->get();
        $existingVariantsBySku = ProductVariant::query()->with('product:id,name,sku,gtin,price_cents')->get()->keyBy(fn (ProductVariant $v): string => strtoupper($v->sku));
        $existingVariantsByGtin = ProductVariant::query()->with('product:id,name,sku,gtin,price_cents')->whereNotNull('gtin')->where('gtin', '!=', '')->get()->keyBy('gtin');
        $existingProductsByGtin = $existingProducts->filter(fn (Product $p): bool => ! empty($p->gtin))->keyBy('gtin');

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
            $productLine = ! empty($row['product_line']) ? trim((string) $row['product_line']) : null;
            $volume = ! empty($row['volume']) ? trim((string) $row['volume']) : null;
            $variantNameRaw = ! empty($row['variant_name']) ? trim((string) $row['variant_name']) : 'Padrão';
            $shadeCode = ! empty($row['shade_code']) ? trim((string) $row['shade_code']) : null;
            $sku = ! empty($row['sku']) ? strtoupper(trim((string) $row['sku'])) : null;
            $supplierCode = ! empty($row['supplier_code']) ? trim((string) $row['supplier_code']) : null;
            $gtin = ! empty($row['gtin']) ? trim((string) $row['gtin']) : null;
            $powerWatts = isset($row['power_watts']) && is_numeric($row['power_watts']) && (int) $row['power_watts'] > 0
                ? (int) $row['power_watts']
                : null;
            $shippingWeightGrams = isset($row['shipping_weight_grams']) && is_numeric($row['shipping_weight_grams']) && (int) $row['shipping_weight_grams'] > 0
                ? (int) $row['shipping_weight_grams']
                : null;

            $baseLineName = $this->extractProductLineName($rawName, $variantNameRaw);
            $matchedBrand = $this->matchBrand($brandNameRaw, $brands);
            $catResolution = ! empty($row['category'])
                ? $this->categoryResolver->resolve((string) $row['category'], $categories)
                : ['status' => 'empty', 'matched_category' => null, 'suggestions' => []];
            $matchedCategory = ($catResolution['matched_category']['id'] ?? null)
                ? $categories->firstWhere('id', (int) $catResolution['matched_category']['id'])
                : $this->matchCategory(null, "{$rawName} {$baseLineName}", $categories);

            $standardizedProductName = $this->standardizeProductName($baseLineName, $matchedBrand->name ?? $brandNameRaw, $volume);
            $isEquipment = ! empty($row['is_equipment'])
                || preg_match('/\b(cabine|luminaria|luminária|motor|micromotor|secador|estufa|aspirador)\b/iu', "{$rawName} {$standardizedProductName}") === 1;
            $groupKey = Str::slug("{$standardizedProductName}|".($matchedBrand->slug ?? $brandNameRaw ?? ''));

            // Differentiate acquisition cost, supplier-suggested price, and store selling price; never invent missing prices/margins
            $salePriceCents = isset($row['sale_price_cents']) ? (int) $row['sale_price_cents'] : null;
            $costPriceCents = array_key_exists('cost_price_cents', $row) && $row['cost_price_cents'] !== null
                ? (int) $row['cost_price_cents']
                : null;
            $suggestedRetailPriceCents = isset($row['suggested_retail_price_cents']) ? (int) $row['suggested_retail_price_cents'] : null;
            $ambiguousPriceCents = isset($row['ambiguous_price_cents']) ? (int) $row['ambiguous_price_cents'] : null;
            $priceMeaning = isset($row['price_meaning']) ? (string) $row['price_meaning'] : null;
            $costConversion = is_array($row['cost_conversion'] ?? null) ? $row['cost_conversion'] : null;
            $priceOrigin = 'missing';

            if ($salePriceCents !== null && $salePriceCents > 0) {
                $priceOrigin = 'provided';
            } elseif ($ambiguousPriceCents !== null && $ambiguousPriceCents > 0) {
                $priceOrigin = 'ambiguous_requires_operator_classification';
            } elseif ($suggestedRetailPriceCents !== null && $suggestedRetailPriceCents > 0) {
                $priceOrigin = 'supplier_suggested_requires_confirmation';
            } elseif ($costPriceCents !== null) {
                $priceOrigin = 'supplier_cost_requires_retail_confirmation';
            }

            $stockQty = array_key_exists('stock_qty', $row) && $row['stock_qty'] !== null ? (int) $row['stock_qty'] : null;

            // SKU rule: preserve supplier SKU and leading zeros verbatim; only suggest internal code if omitted
            $skuOrigin = 'provided';
            if ($sku === null || $sku === '') {
                $sku = $this->suggestInternalSku($standardizedProductName, $shadeCode ?: $variantNameRaw, $idx);
                $skuOrigin = 'ai_suggestion';
            }

            $errors = [];
            $warnings = [];
            if ($rawName === '' || str_contains($rawName, 'Informação não identificada')) {
                $warnings[] = 'Nome comercial não identificado com segurança na fonte — revisar.';
            }
            if ($priceOrigin === 'missing') {
                $warnings[] = 'Preço de venda não informado na fonte.';
            } elseif ($priceOrigin === 'ambiguous_requires_operator_classification') {
                $ambBrl = 'R$ '.number_format($ambiguousPriceCents / 100, 2, ',', '.');
                $warnings[] = "Valor ({$ambBrl}) sem indicação clara — informe se é custo de aquisição, preço sugerido pelo fornecedor ou preço de venda da loja.";
            } elseif ($priceOrigin === 'supplier_suggested_requires_confirmation') {
                $sugBrl = 'R$ '.number_format($suggestedRetailPriceCents / 100, 2, ',', '.');
                $warnings[] = "Preço sugerido pelo fornecedor ({$sugBrl}) — confirme o preço de venda final da loja.";
            } elseif ($priceOrigin === 'supplier_cost_requires_retail_confirmation') {
                $costBrl = 'R$ '.number_format($costPriceCents / 100, 2, ',', '.');
                $warnings[] = "Valor ({$costBrl}) identificado como custo de aquisição — confirme o preço de venda antes de publicar.";
            }
            if ($costConversion !== null) {
                $warnings[] = ! empty($costConversion['applied'])
                    ? "Conversão proposta da embalagem ({$costConversion['formula']}) — confira a unidade de venda ({$costConversion['selling_unit']})."
                    : "Embalagem detectada ({$costConversion['formula']}) com venda em \"{$costConversion['selling_unit']}\" — confirme a unidade de venda antes de converter para unitário.";
            }
            if ($isEquipment && $powerWatts === null) {
                $errors[] = 'Equipamento elétrico sem potência (W) legível — informe manualmente antes de cadastrar.';
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

            // Duplicate & Conflict check against real catalog
            $matchedVariant = $existingVariantsBySku->get($sku);
            $matchedProduct = $matchedVariant?->product;
            $gtinConflictProd = $gtin
                ? ($existingVariantsByGtin->get($gtin)?->product ?? $existingProductsByGtin->get($gtin))
                : null;

            $duplicateComparison = null;
            $actionType = 'new_product';
            $resolutionChoice = 'create_new';

            if ($matchedVariant && $matchedProduct) {
                $actionType = 'update_variant';
                $resolutionChoice = 'update_existing';
                $updateCount++;

                if ($gtinConflictProd && (int) $gtinConflictProd->id !== (int) $matchedProduct->id) {
                    $actionType = 'possible_duplicate';
                    $resolutionChoice = 'manual_review';
                    $errors[] = "Conflito: SKU {$sku} pertence a \"{$matchedProduct->name}\", mas o código de barras {$gtin} pertence a \"{$gtinConflictProd->name}\".";
                }

                $duplicateComparison = [
                    'reason' => 'SKU já cadastrado no catálogo oficial',
                    'existing' => [
                        'product_id' => $matchedProduct->id,
                        'product_name' => $matchedProduct->name,
                        'variant_id' => $matchedVariant->id,
                        'variant_name' => $matchedVariant->name,
                        'sku' => $matchedVariant->sku,
                        'gtin' => $matchedVariant->gtin ?? $matchedProduct->gtin,
                        'price_cents' => $matchedVariant->price_cents,
                        'stock_qty' => $matchedVariant->stock_qty,
                    ],
                ];
            } elseif ($gtinConflictProd) {
                $actionType = 'possible_duplicate';
                $duplicateCount++;
                if ($skuOrigin === 'provided' && strtoupper($gtinConflictProd->sku) !== $sku) {
                    $resolutionChoice = 'manual_review';
                    $warnings[] = "Código de barras {$gtin} já vinculado ao produto \"{$gtinConflictProd->name}\" (SKU {$gtinConflictProd->sku}). Confirme se deseja adicionar variação ou corrigir o código.";
                } else {
                    $resolutionChoice = 'update_existing';
                }
                $matchedProduct = $gtinConflictProd;
                $duplicateComparison = [
                    'reason' => 'Mesmo código de barras (GTIN/EAN) cadastrado',
                    'existing' => [
                        'product_id' => $gtinConflictProd->id,
                        'product_name' => $gtinConflictProd->name,
                        'sku' => $gtinConflictProd->sku,
                        'gtin' => $gtinConflictProd->gtin,
                        'price_cents' => $gtinConflictProd->price_cents,
                    ],
                ];
            } else {
                // Compare Brand + Name similarity — NEVER auto-update solely from similar name
                $candidateProd = $this->findSimilarExistingProduct($standardizedProductName, $matchedBrand?->id, $gtin, $existingProducts);
                if ($candidateProd) {
                    $actionType = 'possible_duplicate';
                    $resolutionChoice = 'manual_review';
                    $matchedProduct = $candidateProd;
                    $duplicateCount++;
                    $warnings[] = 'Possível duplicidade detectada por nome/marca semelhantes — revise antes de vincular ou criar separado.';
                    $duplicateComparison = [
                        'reason' => 'Nome comercial e marca semelhantes a produto existente (revisão manual necessária)',
                        'existing' => [
                            'product_id' => $candidateProd->id,
                            'product_name' => $candidateProd->name,
                            'sku' => $candidateProd->sku,
                            'gtin' => $candidateProd->gtin,
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

            if (! empty($row['category']) && ! $matchedCategory) {
                $suggNames = array_map(fn (array $s): string => $s['full_path'], array_slice($catResolution['suggestions'], 0, 3));
                $suggHint = $suggNames !== [] ? ' Sugestões: '.implode(', ', $suggNames).'.' : '';
                $warnings[] = "Categoria \"{$row['category']}\" não encontrada com segurança — vincule manualmente ou crie antes de aprovar.{$suggHint}";
            }
            if ($errors !== []) {
                $errorCount++;
                if ($actionType === 'new_product' && ($rawName === '' || str_contains($rawName, 'Informação não identificada') || ($isEquipment && $powerWatts === null))) {
                    $actionType = 'insufficient_info';
                }
            } elseif ($warnings !== []) {
                $incompleteCount++;
                if ($actionType === 'new_product' && ($rawName === '' || str_contains($rawName, 'Informação não identificada'))) {
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

            $effectivePriceForDraft = $salePriceCents ?? 0;

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
                    'product_line' => $productLine,
                    'slug' => $slug,
                    'brand_id' => $matchedBrand?->id,
                    'brand_name' => $matchedBrand->name ?? $brandNameRaw,
                    'category_id' => $matchedCategory?->id,
                    'category_name' => $catResolution['matched_category']['full_path'] ?? $matchedCategory->name ?? (! empty($row['category']) ? (string) $row['category'] : null),
                    'category_suggestions' => $catResolution['suggestions'],
                    'variant_name' => $variantNameRaw,
                    'shade_code' => $shadeCode,
                    'color_family' => ! empty($row['color_family']) ? (string) $row['color_family'] : $this->inferColorFamily($variantNameRaw),
                    'color_hex' => ! empty($row['color_hex']) ? (string) $row['color_hex'] : null,
                    'volume' => $volume,
                    'shipping_weight_grams' => $shippingWeightGrams,
                    'power_watts' => $powerWatts,
                    'is_equipment' => $isEquipment,
                    'supplier_code' => $supplierCode,
                    'sku' => $sku,
                    'gtin' => $gtin,
                    'cost_price_cents' => $costPriceCents,
                    'suggested_retail_price_cents' => $suggestedRetailPriceCents,
                    'ambiguous_price_cents' => $ambiguousPriceCents,
                    'price_meaning' => $priceMeaning,
                    'cost_conversion' => $costConversion,
                    'price_cents' => $effectivePriceForDraft,
                    'suggested_price_cents' => $suggestedRetailPriceCents,
                    'promo_price_cents' => $row['promo_price_cents'] ?? null,
                    'stock_qty' => $stockQty !== null ? max(0, $stockQty) : 0,
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
                    'raw_snippet' => $row['evidence']['raw_snippet'] ?? ($row['description_raw'] ?? null),
                    'image_url' => $row['evidence']['image_url'] ?? null,
                    'image_path' => $row['evidence']['image_path'] ?? null,
                    'fields' => [
                        'product_name' => $rawName !== '' && ! str_contains($rawName, 'Informação não identificada') ? 'provided' : 'missing',
                        'brand' => $matchedBrand ? 'existing' : ($brandNameRaw ? 'provided' : 'missing'),
                        'category' => $matchedCategory ? 'existing' : 'missing',
                        'sku' => $skuOrigin,
                        'supplier_code' => $supplierCode ? 'provided' : 'missing',
                        'gtin' => $gtin ? 'provided' : 'missing',
                        'volume' => $volume ? 'provided' : 'missing',
                        'shipping_weight' => $shippingWeightGrams ? 'provided' : 'missing',
                        'power_watts' => $powerWatts ? 'provided' : ($isEquipment ? 'missing_illegible' : 'not_applicable'),
                        'price' => $priceOrigin,
                        'stock_qty' => $stockQty !== null ? 'provided' : 'missing',
                        'description' => 'ai_suggestion',
                        'ingredients' => ! empty($row['ingredients']) ? 'provided' : 'missing',
                    ],
                ],
                'validation_result' => [
                    'is_valid' => $errors === [] && ($salePriceCents !== null || $matchedVariant !== null),
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
