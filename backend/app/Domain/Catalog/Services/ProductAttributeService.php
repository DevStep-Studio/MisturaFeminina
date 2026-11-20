<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Http\Controllers\Api\V1\CatalogController;
use App\Models\Attribute;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\Pivot;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ProductAttributeService
{
    /** @var list<string> */
    private const EQUIPMENT_SLUGS = [
        'cabines',
        'cabines-e-estufas',
        'motores',
        'aspiradores',
        'luminarias',
        'acessorios-pro',
    ];

    /** @var list<string> */
    private const NAIL_SLUGS = [
        'unhas-e-esmalteria',
        'esmaltes-em-gel',
        'gel',
        'top-coat',
        'top-coat-e-finalizadores',
        'preparadores-e-primers',
        'alongamento-e-geis',
        'brocas',
        'brocas-e-lixas',
        'brocas-ceramica',
        'lixas-profissionais',
    ];

    /** @var list<string> */
    private const MAKEUP_SLUGS = ['maquiagem', 'labios', 'pele-e-bases', 'brumas-e-fixadores'];

    /** @var list<string> */
    private const SKINCARE_SLUGS = ['skincare', 'seruns-e-tratamentos', 'hidratantes-faciais'];

    /** @var list<string> */
    private const HAIR_SLUGS = ['cabelos', 'kits-capilares', 'mascaras-de-tratamento', 'oleos-e-reparadores'];

    /** @var list<string> */
    private const BODY_SLUGS = ['corpo-e-banho', 'hidratantes-corporais', 'autocuidado-diario'];

    /**
     * @param  list<int>  $productIds
     * @return list<array<string, mixed>>
     */
    public function getAttributesForCategory(?Category $category, array $productIds): array
    {
        if ($productIds === []) {
            return [];
        }

        $configuredAttributeIds = null;
        if ($category) {
            $category->loadMissing(['attributes', 'parent.attributes']);
            $catAttrs = $category->attributes->filter(function (Attribute $a): bool {
                $pivot = $a->getRelationValue('pivot');

                return (bool) ($pivot instanceof Pivot ? $pivot->getAttribute('is_filterable') : true);
            });
            if ($catAttrs->isEmpty() && $category->parent) {
                $catAttrs = $category->parent->attributes->filter(function (Attribute $a): bool {
                    $pivot = $a->getRelationValue('pivot');

                    return (bool) ($pivot instanceof Pivot ? $pivot->getAttribute('is_filterable') : true);
                });
            }
            if ($catAttrs->isNotEmpty()) {
                $configuredAttributeIds = $catAttrs->pluck('id')->all();
            }
        }

        // Count distinct products per attribute value across both product-level and active variant-level attributes.
        $productAttrRows = DB::table('product_attribute_values')
            ->whereIn('product_id', $productIds)
            ->select('attribute_value_id', 'product_id')
            ->get();

        $variantAttrRows = DB::table('variant_attribute_values')
            ->join('product_variants', 'variant_attribute_values.product_variant_id', '=', 'product_variants.id')
            ->whereIn('product_variants.product_id', $productIds)
            ->where('product_variants.is_active', true)
            ->select('variant_attribute_values.attribute_value_id', 'product_variants.product_id')
            ->get();

        $productsPerValue = [];
        foreach ($productAttrRows as $row) {
            $productsPerValue[(int) $row->attribute_value_id][(int) $row->product_id] = true;
        }
        foreach ($variantAttrRows as $row) {
            $productsPerValue[(int) $row->attribute_value_id][(int) $row->product_id] = true;
        }

        $usedValueIds = array_keys($productsPerValue);
        if ($usedValueIds === [] && $configuredAttributeIds === null) {
            return [];
        }

        $attributesQuery = Attribute::query()
            ->where('is_filterable', true)
            ->with(['values' => fn ($q) => $q->orderBy('sort_order')->orderBy('value')])
            ->orderBy('sort_order')
            ->orderBy('name');

        if ($configuredAttributeIds !== null) {
            $attributesQuery->whereIn('id', $configuredAttributeIds);
        } elseif ($usedValueIds !== []) {
            $attributesQuery->whereHas('values', fn ($q) => $q->whereIn('id', $usedValueIds));
        }

        $attributes = $attributesQuery->get();
        if ($configuredAttributeIds !== null) {
            $orderMap = array_flip($configuredAttributeIds);
            $attributes = $attributes->sortBy(fn (Attribute $a): int => $orderMap[$a->id] ?? 999)->values();
        }

        $result = [];
        foreach ($attributes as $attribute) {
            $values = [];
            foreach ($attribute->values as $val) {
                $count = isset($productsPerValue[$val->id]) ? count($productsPerValue[$val->id]) : 0;
                if ($count <= 0) {
                    continue;
                }
                $values[] = [
                    'id' => $val->id,
                    'value' => $val->value,
                    'slug' => $val->slug,
                    'color_hex' => $val->color_hex,
                    'products_count' => $count,
                ];
            }

            if ($values === []) {
                continue;
            }

            $result[] = [
                'id' => $attribute->id,
                'name' => $attribute->name,
                'slug' => $attribute->slug,
                'display_type' => $attribute->display_type,
                'unit' => $attribute->unit,
                'values' => $values,
            ];
        }

        return $result;
    }

    /** @param  Builder<Product>  $query */
    public function applyAttributeFilters(Builder $query, Request $request): void
    {
        $filters = [];

        $rawAttrs = $request->query('attrs');
        if (is_array($rawAttrs)) {
            foreach ($rawAttrs as $attrSlug => $valSlugs) {
                $slugList = is_array($valSlugs)
                    ? $valSlugs
                    : explode(',', (string) $valSlugs);
                $clean = array_values(array_filter(array_map(fn ($s) => trim((string) $s), $slugList)));
                if ($clean !== []) {
                    $filters[trim((string) $attrSlug)] = $clean;
                }
            }
        }

        foreach ($request->query() as $key => $val) {
            if (! is_string($key) || ! str_starts_with($key, 'attr_')) {
                continue;
            }
            $attrSlug = substr($key, 5);
            if ($attrSlug === '') {
                continue;
            }
            $slugList = is_array($val) ? $val : explode(',', (string) $val);
            $clean = array_values(array_filter(array_map(fn ($s) => trim((string) $s), $slugList)));
            if ($clean !== []) {
                $filters[$attrSlug] = $clean;
            }
        }

        foreach ($filters as $attrSlug => $valSlugs) {
            $query->where(function (Builder $outer) use ($attrSlug, $valSlugs): void {
                $outer->whereHas('attributeValues', function (Builder $avq) use ($attrSlug, $valSlugs): void {
                    $avq->whereIn('attribute_values.slug', $valSlugs)
                        ->whereHas('attribute', fn (Builder $aq) => $aq->where('slug', $attrSlug));
                })->orWhereHas('variants', function (Builder $vq) use ($attrSlug, $valSlugs): void {
                    $vq->where('is_active', true)
                        ->whereHas('attributeValues', function (Builder $avq) use ($attrSlug, $valSlugs): void {
                            $avq->whereIn('attribute_values.slug', $valSlugs)
                                ->whereHas('attribute', fn (Builder $aq) => $aq->where('slug', $attrSlug));
                        });
                });
            });
        }
    }

    public function resolveComparisonGroup(Product $product): string
    {
        $slugs = $product->categories->pluck('slug')->all();

        foreach ($slugs as $slug) {
            if (in_array($slug, self::EQUIPMENT_SLUGS, true)) {
                return 'equipamentos';
            }
        }
        foreach ($slugs as $slug) {
            if (in_array($slug, self::NAIL_SLUGS, true)) {
                return 'unhas-esmalteria';
            }
        }
        foreach ($slugs as $slug) {
            if (in_array($slug, self::MAKEUP_SLUGS, true)) {
                return 'maquiagem';
            }
        }
        foreach ($slugs as $slug) {
            if (in_array($slug, self::SKINCARE_SLUGS, true)) {
                return 'skincare';
            }
        }
        foreach ($slugs as $slug) {
            if (in_array($slug, self::HAIR_SLUGS, true)) {
                return 'cabelos';
            }
        }
        foreach ($slugs as $slug) {
            if (in_array($slug, self::BODY_SLUGS, true)) {
                return 'corpo-banho';
            }
        }

        return $slugs[0] ?? 'geral';
    }

    /** @return list<array{slug: string, name: string, value: string}> */
    public function extractComparableSpecs(Product $product): array
    {
        $bySlug = [];

        foreach ($product->attributeValues as $av) {
            $attr = $av->attribute;
            if (! $attr || ! $attr->is_comparable) {
                continue;
            }
            $bySlug[$attr->slug]['name'] = $attr->name;
            $bySlug[$attr->slug]['sort'] = $attr->sort_order;
            $bySlug[$attr->slug]['values'][] = $av->value;
        }

        foreach ($product->variants->where('is_active', true) as $variant) {
            foreach ($variant->attributeValues as $av) {
                $attr = $av->attribute;
                if (! $attr || ! $attr->is_comparable) {
                    continue;
                }
                $bySlug[$attr->slug]['name'] = $attr->name;
                $bySlug[$attr->slug]['sort'] = $attr->sort_order;
                $bySlug[$attr->slug]['values'][] = $av->value;
            }
        }

        uasort($bySlug, fn (array $a, array $b): int => $a['sort'] <=> $b['sort']);

        $specs = [];
        foreach ($bySlug as $slug => $entry) {
            $uniqueValues = array_values(array_unique($entry['values']));
            $specs[] = [
                'slug' => (string) $slug,
                'name' => (string) $entry['name'],
                'value' => implode(', ', $uniqueValues),
            ];
        }

        return $specs;
    }

    /**
     * @param  list<int|string>  $identifiers
     * @return array<string, mixed>
     */
    public function compareProducts(array $identifiers): array
    {
        if (count($identifiers) < 1 || count($identifiers) > 3) {
            throw ValidationException::withMessages([
                'products' => ['Selecione entre 1 e 3 produtos para comparar.'],
            ]);
        }

        $numericIds = array_values(array_filter(array_map(fn ($v) => is_numeric($v) ? (int) $v : null, $identifiers)));
        $slugs = array_values(array_filter(array_map(fn ($v) => ! is_numeric($v) ? (string) $v : null, $identifiers)));

        $products = Product::query()
            ->where('is_active', true)
            ->where(function (Builder $q) use ($numericIds, $slugs): void {
                if ($numericIds !== []) {
                    $q->orWhereIn('id', $numericIds);
                }
                if ($slugs !== []) {
                    $q->orWhereIn('slug', $slugs);
                }
            })
            ->with([
                'brand:id,name,slug',
                'categories:id,name,slug',
                'images',
                'attributeValues.attribute',
                'variants' => fn ($q) => $q->where('is_active', true)->with('attributeValues.attribute'),
            ])
            ->get();

        if ($products->isEmpty()) {
            throw ValidationException::withMessages([
                'products' => ['Nenhum produto válido encontrado para comparação.'],
            ]);
        }

        $groups = $products->map(fn (Product $p): string => $this->resolveComparisonGroup($p))->unique()->values()->all();
        if (count($groups) > 1) {
            throw ValidationException::withMessages([
                'compatibility' => ['Não é possível comparar produtos de categorias tecnicamente incompatíveis.'],
            ]);
        }

        // Preserve requested order when possible
        $ordered = $products->sortBy(function (Product $p) use ($identifiers): int {
            foreach ($identifiers as $idx => $ident) {
                if ((is_numeric($ident) && (int) $ident === $p->id) || ((string) $ident === $p->slug)) {
                    return $idx;
                }
            }

            return 999;
        })->values();

        $allSpecs = [];
        $serializedProducts = [];

        foreach ($ordered as $product) {
            $card = CatalogController::serializeProductCard($product);
            $specs = $this->extractComparableSpecs($product);
            $specMap = [];
            foreach ($specs as $spec) {
                $specMap[$spec['slug']] = $spec['value'];
                $allSpecs[$spec['slug']] = $spec['name'];
            }

            $serializedProducts[] = [
                ...$card,
                'short_description' => $product->short_description,
                'specs' => $specMap,
            ];
        }

        $attributesTable = [];
        foreach ($allSpecs as $slug => $label) {
            $values = array_map(fn (array $p): ?string => $p['specs'][$slug] ?? null, $serializedProducts);
            $nonEmpty = array_values(array_unique(array_filter($values, fn ($v): bool => $v !== null && $v !== '')));
            $attributesTable[] = [
                'slug' => $slug,
                'label' => $label,
                'has_difference' => count($nonEmpty) > 1 || (count($nonEmpty) === 1 && in_array(null, $values, true)),
                'values' => $values,
            ];
        }

        return [
            'comparison_group' => $groups[0] ?? 'geral',
            'products' => $serializedProducts,
            'attributes' => $attributesTable,
        ];
    }
}
