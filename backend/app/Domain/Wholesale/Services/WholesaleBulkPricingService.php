<?php

declare(strict_types=1);

namespace App\Domain\Wholesale\Services;

use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Models\WholesaleGroup;
use App\Models\WholesaleRule;
use App\Models\WholesaleRuleAudit;
use Illuminate\Support\Facades\DB;

class WholesaleBulkPricingService
{
    /**
     * List products and variants for bulk wholesale pricing table.
     *
     * @param  array<string, mixed>  $filters
     * @return array<string, mixed>
     */
    public function listGrid(array $filters = []): array
    {
        $query = Product::query()
            ->with(['brand', 'categories', 'variants', 'wholesaleGroupItems.group'])
            ->where('is_active', true);

        if (! empty($filters['search'])) {
            $s = trim((string) $filters['search']);
            $query->where(function ($q) use ($s): void {
                $q->where('name', 'like', "%{$s}%")
                    ->orWhere('sku', 'like', "%{$s}%")
                    ->orWhereHas('variants', fn ($vq) => $vq->where('sku', 'like', "%{$s}%")->orWhere('name', 'like', "%{$s}%"));
            });
        }

        if (! empty($filters['brand_id'])) {
            $query->where('brand_id', (int) $filters['brand_id']);
        }

        if (! empty($filters['category_id'])) {
            $query->whereHas('categories', fn ($cq) => $cq->where('categories.id', (int) $filters['category_id']));
        }

        $perPage = (int) ($filters['per_page'] ?? 30);
        $paginated = $query->orderBy('name')->paginate($perPage);

        $rules = WholesaleRule::query()->where('status', 'active')->with('tiers')->get();
        $pricingEngine = app(WholesalePricingService::class);

        $rows = [];
        foreach ($paginated->items() as $product) {
            $wholesalePreview = $pricingEngine->calculateForProduct($product);
            $wholesaleGroup = $product->wholesaleGroupItems->first()?->group;

            $rows[] = [
                'type' => 'product',
                'id' => $product->id,
                'product_id' => $product->id,
                'variant_id' => null,
                'name' => $product->name,
                'sku' => $product->sku,
                'brand_name' => $product->brand?->name,
                'retail_price_cents' => $product->effectivePriceCents(),
                'has_wholesale' => $wholesalePreview['has_wholesale'],
                'wholesale_rule_id' => $wholesalePreview['rule_id'],
                'wholesale_rule_name' => $wholesalePreview['rule_name'],
                'min_quantity' => $wholesalePreview['min_quantity'] ?? 6,
                'wholesale_price_cents' => $wholesalePreview['starting_price_cents'],
                'wholesale_group_id' => $wholesaleGroup?->id,
                'wholesale_group_name' => $wholesaleGroup?->name,
                'variants_count' => $product->variants->count(),
            ];

            foreach ($product->variants as $variant) {
                $rows[] = [
                    'type' => 'variant',
                    'id' => "v-{$variant->id}",
                    'product_id' => $product->id,
                    'variant_id' => $variant->id,
                    'name' => "↳ {$variant->name}",
                    'sku' => $variant->sku,
                    'brand_name' => $product->brand?->name,
                    'retail_price_cents' => $variant->effectivePriceCents(),
                    'has_wholesale' => $wholesalePreview['has_wholesale'],
                    'wholesale_rule_id' => $wholesalePreview['rule_id'],
                    'wholesale_rule_name' => $wholesalePreview['rule_name'],
                    'min_quantity' => $wholesalePreview['min_quantity'] ?? 6,
                    'wholesale_price_cents' => $wholesalePreview['starting_price_cents'],
                    'wholesale_group_id' => $wholesaleGroup?->id,
                    'wholesale_group_name' => $wholesaleGroup?->name,
                    'variants_count' => 0,
                ];
            }
        }

        return [
            'data' => $rows,
            'total' => $paginated->total(),
            'current_page' => $paginated->currentPage(),
            'last_page' => $paginated->lastPage(),
            'groups' => WholesaleGroup::query()->where('status', 'active')->get(['id', 'name']),
            'rules' => $rules->map(fn ($r) => ['id' => $r->id, 'name' => $r->name]),
        ];
    }

    /**
     * Parse clipboard paste text from Excel/Google Sheets.
     * Accepted format: SKU [TAB/;/,] Preço Atacado [TAB/;/,] Qtd Mínima
     *
     * @return list<array<string, mixed>>
     */
    public function parseExcelPaste(string $pastedText): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($pastedText));
        if (! $lines) {
            return [];
        }

        $results = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            // Detect delimiter: tab, semicolon, or comma
            $cols = str_contains($line, "\t")
                ? explode("\t", $line)
                : (str_contains($line, ';') ? explode(';', $line) : explode(',', $line));

            $cols = array_map('trim', $cols);
            if (empty($cols[0])) {
                continue;
            }

            // Ignore header row if present
            $firstColLower = strtolower($cols[0]);
            if (in_array($firstColLower, ['sku', 'codigo', 'código', 'id', 'produto'], true)) {
                continue;
            }

            $sku = $cols[0];
            $rawPrice = $cols[1] ?? '';
            $rawQty = $cols[2] ?? '6';

            $priceCents = $this->parseBrazilianCurrencyToCents($rawPrice);
            $minQty = max(1, (int) preg_replace('/\D/', '', $rawQty));

            $results[] = [
                'sku' => $sku,
                'raw_price' => $rawPrice,
                'wholesale_price_cents' => $priceCents,
                'min_quantity' => $minQty,
            ];
        }

        return $results;
    }

    /**
     * Validate and generate a diff preview for bulk pricing updates.
     *
     * @param  list<array<string, mixed>>  $entries
     * @return array<string, mixed>
     */
    public function previewBulkUpdate(array $entries): array
    {
        $skus = array_unique(array_filter(array_column($entries, 'sku')));

        $productsBySku = Product::query()->whereIn('sku', $skus)->get()->keyBy('sku');
        $variantsBySku = ProductVariant::query()->whereIn('sku', $skus)->with('product')->get()->keyBy('sku');

        $valid = [];
        $errors = [];

        foreach ($entries as $index => $entry) {
            $sku = (string) ($entry['sku'] ?? '');
            $priceCents = (int) ($entry['wholesale_price_cents'] ?? 0);
            $minQty = max(1, (int) ($entry['min_quantity'] ?? 6));

            if ($priceCents <= 0) {
                $errors[] = [
                    'row' => $index + 1,
                    'sku' => $sku,
                    'error' => 'Preço de atacado inválido ou menor que R$ 0,01.',
                ];

                continue;
            }

            $product = $productsBySku->get($sku);
            $variant = $variantsBySku->get($sku);

            if (! $product && ! $variant) {
                $errors[] = [
                    'row' => $index + 1,
                    'sku' => $sku,
                    'error' => "SKU '{$sku}' não encontrado no catálogo.",
                ];

                continue;
            }

            $targetProd = $variant ? $variant->product : $product;
            $currentRetail = $variant ? $variant->effectivePriceCents() : $targetProd->effectivePriceCents();

            $valid[] = [
                'sku' => $sku,
                'product_id' => $targetProd->id,
                'product_variant_id' => $variant?->id,
                'name' => $variant ? "{$targetProd->name} - {$variant->name}" : $targetProd->name,
                'current_retail_cents' => $currentRetail,
                'new_wholesale_cents' => $priceCents,
                'min_quantity' => $minQty,
                'discount_cents' => max(0, $currentRetail - $priceCents),
                'discount_percent' => $currentRetail > 0 ? round((max(0, $currentRetail - $priceCents) / $currentRetail) * 100, 1) : 0,
            ];
        }

        return [
            'valid_count' => count($valid),
            'error_count' => count($errors),
            'items' => $valid,
            'errors' => $errors,
        ];
    }

    /**
     * Apply bulk wholesale pricing changes idempotently.
     *
     * @param  list<array<string, mixed>>  $entries
     * @return array<string, mixed>
     */
    public function applyBulkUpdate(array $entries, ?User $user = null): array
    {
        $preview = $this->previewBulkUpdate($entries);
        if (empty($preview['items'])) {
            return [
                'success' => false,
                'applied_count' => 0,
                'message' => 'Nenhum item válido para atualizar.',
                'errors' => $preview['errors'],
            ];
        }

        return DB::transaction(function () use ($preview, $user) {
            $appliedCount = 0;

            // Group entries by min_quantity so we can create/reuse appropriate rules
            $groupedByMinQty = [];
            foreach ($preview['items'] as $item) {
                $qty = (int) $item['min_quantity'];
                $groupedByMinQty[$qty][] = $item;
            }

            foreach ($groupedByMinQty as $minQty => $items) {
                // Find or create a bulk wholesale rule for this minimum quantity
                $ruleName = "Atacado em Massa ({$minQty}+ un.)";
                $ruleSlug = 'atacado-em-massa-'.$minQty.'-un';

                /** @var WholesaleRule $rule */
                $rule = WholesaleRule::query()->firstOrCreate(
                    ['slug' => $ruleSlug],
                    [
                        'name' => $ruleName,
                        'description' => "Regra gerada automaticamente por edição em massa para compras de {$minQty} ou mais unidades.",
                        'status' => 'active',
                        'access_mode' => 'open',
                        'quantity_scope' => 'commercial_line',
                        'discount_policy' => 'tier_pricing',
                        'stacking_policy' => 'no_stacking',
                        'min_quantity' => $minQty,
                        'priority' => 10,
                        'created_by_user_id' => $user?->id,
                    ]
                );

                foreach ($items as $item) {
                    $prodId = (int) $item['product_id'];
                    $varId = $item['product_variant_id'] ? (int) $item['product_variant_id'] : null;
                    $priceCents = (int) $item['new_wholesale_cents'];

                    // Attach product to rule
                    $rule->ruleProducts()->firstOrCreate([
                        'product_id' => $prodId,
                        'product_variant_id' => $varId,
                        'is_excluded' => false,
                    ]);

                    // Add/update tier for this rule
                    $tierPriceDecimal = round($priceCents / 100, 2);
                    $rule->tiers()->updateOrCreate(
                        ['min_quantity' => $minQty],
                        [
                            'max_quantity' => null,
                            'discount_type' => 'fixed_price',
                            'discount_value' => $tierPriceDecimal,
                        ]
                    );

                    $appliedCount++;
                }

                WholesaleRuleAudit::query()->create([
                    'wholesale_rule_id' => $rule->id,
                    'user_id' => $user?->id,
                    'action' => 'bulk_update_applied',
                    'old_values' => null,
                    'new_values' => ['applied_items' => count($items), 'min_qty' => $minQty],
                    'description' => 'Atualização em massa aplicada: '.count($items)." itens vinculados à regra '{$rule->name}'.",
                ]);
            }

            return [
                'success' => true,
                'applied_count' => $appliedCount,
                'message' => "{$appliedCount} itens atualizados com sucesso no atacado.",
                'errors' => $preview['errors'],
            ];
        });
    }

    /**
     * Helper to parse Brazilian price string ("R$ 12,50", "9.90", "15,00") into integer cents.
     */
    private function parseBrazilianCurrencyToCents(string $raw): int
    {
        $clean = trim($raw);
        $clean = str_ireplace(['r$', ' ', 'un', 'unidades'], '', $clean);

        if (str_contains($clean, ',') && str_contains($clean, '.')) {
            // E.g. "1.250,50"
            $clean = str_replace('.', '', $clean);
            $clean = str_replace(',', '.', $clean);
        } elseif (str_contains($clean, ',')) {
            // E.g. "12,50"
            $clean = str_replace(',', '.', $clean);
        }

        $numeric = (float) filter_var($clean, FILTER_SANITIZE_NUMBER_FLOAT, FILTER_FLAG_ALLOW_FRACTION);

        return (int) round($numeric * 100);
    }
}
