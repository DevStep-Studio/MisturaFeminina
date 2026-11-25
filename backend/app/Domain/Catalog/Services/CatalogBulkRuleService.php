<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Domain\Security\Services\AuditLogger;
use App\Domain\Shared\Enums\InventoryMovementType;
use App\Domain\Wholesale\Services\WholesalePricingService;
use App\Http\Controllers\SeoController;
use App\Jobs\ProcessCatalogBulkRuleJob;
use App\Models\Brand;
use App\Models\BulkEditBatch;
use App\Models\BulkEditBatchItem;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Promotion;
use App\Models\User;
use App\Models\WholesaleRule;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CatalogBulkRuleService
{
    public const ASYNC_THRESHOLD = 60;

    public function __construct(
        private readonly InventoryService $inventory,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Builds the admin product query matching catalog filters for both listing and "select all matching" server execution.
     *
     * @param  array<string, mixed>  $filters
     * @return Builder<Product>
     */
    public function buildFilteredProductsQuery(array $filters, bool $includeTrashed = false): Builder
    {
        $status = (string) ($filters['status'] ?? 'all');
        if ($status === 'archived') {
            $query = Product::onlyTrashed();
        } elseif ($includeTrashed) {
            $query = Product::withTrashed();
        } else {
            $query = Product::query();
        }

        $opFilter = (string) ($filters['filter'] ?? '');
        if ($opFilter === 'needs_review') {
            $query->where(function (Builder $q): void {
                $q->whereDoesntHave('images')
                    ->orWhereNull('weight_grams')
                    ->orWhere('weight_grams', '<=', 0)
                    ->orWhereHas('variants', fn ($vq) => $vq->whereRaw('(stock_qty - reserved_qty) <= 0'));
            });
        } elseif ($opFilter === 'out_of_stock_variants') {
            $query->where('is_active', true)
                ->whereHas('variants', fn ($vq) => $vq->where('is_active', true)->whereNull('archived_at')->whereRaw('(stock_qty - reserved_qty) <= 0'));
        } elseif ($opFilter === 'missing_cost' || (string) ($filters['cost_status'] ?? '') === 'missing') {
            $query->where(function (Builder $cq): void {
                $cq->where(function (Builder $noVar): void {
                    $noVar->whereDoesntHave('variants', fn (Builder $vq) => $vq->whereNull('archived_at'))->whereNull('cost_cents');
                })->orWhereHas('variants', function (Builder $vq): void {
                    $vq->whereNull('product_variants.archived_at')
                        ->whereNull('product_variants.cost_cents')
                        ->whereHas('product', fn (Builder $pq) => $pq->whereNull('products.cost_cents'));
                });
            });
        }

        if ($status === 'active') {
            $query->where('is_active', true);
        } elseif ($status === 'inactive') {
            $query->where('is_active', false);
        }

        if (isset($filters['is_active']) && $filters['is_active'] !== '' && $filters['is_active'] !== null) {
            $query->where('is_active', filter_var($filters['is_active'], FILTER_VALIDATE_BOOLEAN));
        }

        if (! empty($filters['brand_id'])) {
            $query->where('brand_id', (int) $filters['brand_id']);
        }

        if (! empty($filters['category_id'])) {
            $catId = (int) $filters['category_id'];
            $query->whereHas('categories', fn (Builder $cq) => $cq->where('categories.id', $catId));
        }

        $availability = (string) ($filters['availability'] ?? 'all');
        if ($availability === 'in_stock') {
            $query->whereHas('variants', fn (Builder $vq) => $vq->whereNull('archived_at')->whereRaw('(stock_qty - reserved_qty) > 0'));
        } elseif ($availability === 'low_stock') {
            $query->whereHas('variants', fn (Builder $vq) => $vq->whereNull('archived_at')->whereRaw('(stock_qty - reserved_qty) > 0 AND (stock_qty - reserved_qty) <= 5'));
        } elseif ($availability === 'out_of_stock') {
            $query->whereDoesntHave('variants', fn (Builder $vq) => $vq->whereNull('archived_at')->whereRaw('(stock_qty - reserved_qty) > 0'));
        }

        $search = trim((string) ($filters['search'] ?? ''));
        if ($search !== '') {
            $term = "%{$search}%";
            $query->where(function (Builder $sq) use ($term): void {
                $sq->where('name', 'like', $term)
                    ->orWhere('sku', 'like', $term)
                    ->orWhere('gtin', 'like', $term)
                    ->orWhere('supplier_code', 'like', $term)
                    ->orWhereHas('variants', fn (Builder $vq) => $vq
                        ->where('sku', 'like', $term)
                        ->orWhere('gtin', 'like', $term)
                        ->orWhere('supplier_code', 'like', $term)
                        ->orWhere('name', 'like', $term)
                        ->orWhere('shade_code', 'like', $term));
            });
        }

        return $query;
    }

    /**
     * Resolves target products from explicit IDs or filtered "select all matching".
     *
     * @param  array<string, mixed>  $selection
     * @return Collection<int, Product>
     */
    public function resolveTargetProducts(array $selection, bool $includeTrashed = false): Collection
    {
        $selectAll = ! empty($selection['select_all_matching']);
        if ($selectAll) {
            $filters = is_array($selection['filters'] ?? null) ? $selection['filters'] : [];
            $excludedIds = array_values(array_filter(array_map('intval', $selection['excluded_ids'] ?? [])));

            $q = $this->buildFilteredProductsQuery($filters, $includeTrashed);
            if ($excludedIds !== []) {
                $q->whereNotIn('id', $excludedIds);
            }

            return $q->with(['brand:id,name', 'categories:id,name', 'variants' => fn ($vq) => $vq->orderBy('sort_order')->orderBy('id')])
                ->orderBy('id')
                ->get();
        }

        $ids = array_values(array_filter(array_map('intval', $selection['product_ids'] ?? [])));
        if ($ids === []) {
            return collect();
        }

        $q = $includeTrashed ? Product::withTrashed() : Product::query();

        return $q->whereIn('id', $ids)
            ->with(['brand:id,name', 'categories:id,name', 'variants' => fn ($vq) => $vq->orderBy('sort_order')->orderBy('id')])
            ->orderBy('id')
            ->get();
    }

    /**
     * Generates a comprehensive before/after preview with BRL precision, stock final balances,
     * wholesale & promotion consequences, and concurrency snapshot tokens.
     *
     * @param  array<string, mixed>  $selection
     * @param  array<string, mixed>  $rules
     * @return array<string, mixed>
     */
    public function previewRules(array $selection, array $rules, User $actor): array
    {
        $products = $this->resolveTargetProducts($selection, ($rules['status_op'] ?? 'keep') === 'restore');
        if ($products->isEmpty()) {
            throw ValidationException::withMessages(['selection' => ['Nenhum produto encontrado na seleção atual.']]);
        }

        $variantFilterIds = array_values(array_filter(array_map('intval', $selection['variant_ids'] ?? [])));

        $canPrice = $actor->hasPermission('catalog.pricing') || $actor->hasPermission('catalog.write');
        $canCost = $actor->hasPermission('catalog.cost.write');
        $canStock = $actor->hasPermission('inventory.manage') || $actor->hasPermission('catalog.write');
        $canCatalog = $actor->hasPermission('catalog.write');

        $priceOp = (string) ($rules['price_op'] ?? 'keep'); // keep | set_fixed | adjust_percent
        $promoOp = (string) ($rules['promo_op'] ?? 'keep'); // keep | set_fixed | remove
        $costOp = (string) ($rules['cost_op'] ?? 'keep'); // keep | set_fixed | adjust_percent | clear_to_null
        $stockOp = (string) ($rules['stock_op'] ?? 'keep'); // keep | set | add | subtract
        $brandOp = (string) ($rules['brand_op'] ?? 'keep'); // keep | set | clear
        $catOp = (string) ($rules['category_op'] ?? 'keep'); // keep | add | remove | replace
        $statusOp = (string) ($rules['status_op'] ?? 'keep'); // keep | activate | deactivate | archive | restore
        $applyStockToVariants = (bool) ($rules['apply_stock_to_variants'] ?? false);

        if (($priceOp !== 'keep' || $promoOp !== 'keep') && ! $canPrice) {
            throw ValidationException::withMessages(['permissions' => ['Você não possui permissão para alterar preços comerciais.']]);
        }
        if ($costOp !== 'keep' && ! $canCost) {
            throw ValidationException::withMessages(['permissions' => ['Você não possui permissão para alterar custos de mercadoria.']]);
        }
        if ($stockOp !== 'keep' && ! $canStock) {
            throw ValidationException::withMessages(['permissions' => ['Você não possui permissão para ajustar saldos de estoque.']]);
        }
        if (($brandOp !== 'keep' || $catOp !== 'keep' || $statusOp !== 'keep') && ! $canCatalog) {
            throw ValidationException::withMessages(['permissions' => ['Você não possui permissão para editar atributos ou situação do catálogo.']]);
        }

        $activeWholesaleRules = WholesaleRule::query()
            ->where('status', 'active')
            ->with('ruleProducts')
            ->get();
        $activePromotions = Promotion::query()
            ->where('is_active', true)
            ->get();

        $targetBrand = ($brandOp === 'set' && ! empty($rules['brand_id']))
            ? Brand::query()->find((int) $rules['brand_id'])
            : null;
        $targetCategoryIds = array_values(array_filter(array_map('intval', $rules['category_ids'] ?? [])));
        $targetCategoriesMap = $targetCategoryIds !== []
            ? Category::query()->whereIn('id', $targetCategoryIds)->pluck('name', 'id')->all()
            : [];

        $previewRows = [];
        $snapshots = [];
        $validCount = 0;
        $invalidCount = 0;
        $impactedWholesaleCount = 0;
        $impactedPromoCount = 0;

        foreach ($products as $product) {
            $variants = $product->variants->whereNull('archived_at')->values();
            if ($variantFilterIds !== []) {
                $filteredVars = $variants->whereIn('id', $variantFilterIds);
                if ($filteredVars->isNotEmpty()) {
                    $variants = $filteredVars;
                }
            }

            $isMultiVariant = $product->variants->whereNull('archived_at')->count() > 1;
            $productCatIds = $product->categories->pluck('id')->all();

            // Check impacted wholesale rules and promotions
            $productImpacts = $this->detectImpacts(
                $product,
                $productCatIds,
                $activeWholesaleRules,
                $activePromotions,
                $priceOp,
                $promoOp,
                $brandOp,
                $catOp
            );

            $snapshots["product:{$product->id}"] = [
                'product_id' => $product->id,
                'price_cents' => $product->price_cents,
                'promo_price_cents' => $product->promo_price_cents,
                'brand_id' => $product->brand_id,
                'is_active' => $product->is_active,
                'updated_at' => $product->updated_at?->toIso8601String(),
            ];

            // Product-level brand / category / status preview entries
            $productLevelErrors = [];
            $productChanges = [];

            if ($brandOp === 'set' && $targetBrand) {
                if ((int) $product->brand_id !== $targetBrand->id) {
                    $productChanges[] = [
                        'field' => 'brand',
                        'label' => 'Marca',
                        'old_display' => $product->brand?->name ?? 'Sem marca',
                        'new_display' => $targetBrand->name,
                    ];
                }
            } elseif ($brandOp === 'clear' && $product->brand_id !== null) {
                $productChanges[] = [
                    'field' => 'brand',
                    'label' => 'Marca',
                    'old_display' => $product->brand?->name ?? 'Sem marca',
                    'new_display' => 'Sem marca',
                ];
            }

            if ($catOp !== 'keep') {
                $oldCatsLabel = $product->categories->pluck('name')->implode(', ') ?: 'Nenhuma';
                $newIds = $this->computeNewCategoryIds($productCatIds, $targetCategoryIds, $catOp);
                if ($newIds !== $productCatIds) {
                    $allCatNames = Category::query()->whereIn('id', $newIds)->pluck('name')->implode(', ') ?: 'Nenhuma';
                    $productChanges[] = [
                        'field' => 'categories',
                        'label' => 'Categorias',
                        'old_display' => $oldCatsLabel,
                        'new_display' => $allCatNames,
                    ];
                }
            }

            if ($statusOp !== 'keep') {
                $oldStatus = $product->trashed() ? 'Arquivado' : ($product->is_active ? 'Ativo' : 'Inativo');
                $newStatus = match ($statusOp) {
                    'activate' => 'Ativo',
                    'deactivate' => 'Inativo',
                    'archive' => 'Arquivado',
                    'restore' => 'Ativo',
                    default => $oldStatus,
                };
                if ($oldStatus !== $newStatus) {
                    $productChanges[] = [
                        'field' => 'status',
                        'label' => 'Situação',
                        'old_display' => $oldStatus,
                        'new_display' => $newStatus,
                    ];
                }
            }

            // If product has variants, apply price/promo/stock per variant; if no variants, on product directly
            $targetEntries = $variants->isNotEmpty() ? $variants : collect([null]);

            foreach ($targetEntries as $idx => $variant) {
                /** @var ProductVariant|null $variant */
                $itemKey = $variant ? "variant:{$variant->id}" : "product:{$product->id}";
                $sku = $variant ? $variant->sku : $product->sku;
                $oldPrice = $variant ? $variant->price_cents : $product->price_cents;
                $oldPromo = $variant ? $variant->promo_price_cents : $product->promo_price_cents;
                $oldCost = $variant ? ($variant->cost_cents ?? $product->cost_cents) : $product->cost_cents;
                $oldStock = $variant ? $variant->stock_qty : 0;
                $reservedQty = $variant ? $variant->reserved_qty : 0;

                if ($variant) {
                    $snapshots[$itemKey] = [
                        'product_id' => $product->id,
                        'variant_id' => $variant->id,
                        'price_cents' => $oldPrice,
                        'promo_price_cents' => $oldPromo,
                        'stock_qty' => $oldStock,
                        'reserved_qty' => $reservedQty,
                        'updated_at' => $variant->updated_at?->toIso8601String(),
                    ];
                }

                $newPrice = $oldPrice;
                $newPromo = $oldPromo;
                $newCost = $oldCost;
                $newStock = $oldStock;
                $errors = $productChanges !== [] || $idx === 0 ? $productLevelErrors : [];
                $changes = $idx === 0 ? $productChanges : [];
                $itemImpacts = [...$productImpacts];

                if ($costOp === 'set_fixed') {
                    $rawCost = $rules['cost_cents'] ?? null;
                    if ($rawCost === null || (int) $rawCost < 0) {
                        $errors[] = 'Informe um custo unitário válido (>= R$ 0,00).';
                    } else {
                        $newCost = (int) $rawCost;
                    }
                } elseif ($costOp === 'adjust_percent') {
                    if ($oldCost === null) {
                        $errors[] = 'SKU sem custo cadastrado para aplicar reajuste percentual.';
                    } else {
                        $pct = (float) ($rules['cost_percent'] ?? 0);
                        $newCost = max(0, (int) round($oldCost * (1 + ($pct / 100))));
                    }
                } elseif ($costOp === 'clear_to_null') {
                    $newCost = null;
                }

                if ($priceOp === 'set_fixed') {
                    $targetCents = (int) ($rules['price_cents'] ?? 0);
                    if ($targetCents <= 0) {
                        $errors[] = 'Preço fixo deve ser maior que R$ 0,00.';
                    } else {
                        $newPrice = $targetCents;
                    }
                } elseif ($priceOp === 'adjust_percent') {
                    $pct = (float) ($rules['percent'] ?? 0);
                    $newPrice = (int) round($oldPrice * (1 + ($pct / 100)));
                    if ($newPrice <= 0) {
                        $errors[] = 'O reajuste resulta em preço igual ou inferior a zero.';
                    }
                }

                if ($promoOp === 'set_fixed') {
                    $promoCents = (int) ($rules['promo_price_cents'] ?? 0);
                    if ($promoCents <= 0) {
                        $errors[] = 'Preço promocional deve ser maior que zero.';
                    } else {
                        $newPromo = $promoCents;
                    }
                } elseif ($promoOp === 'remove') {
                    $newPromo = null;
                }

                if ($newPromo !== null && $newPromo >= $newPrice) {
                    if ($promoOp === 'keep' && $priceOp !== 'keep') {
                        $itemImpacts[] = 'Atenção: preço promocional atual ('.$this->brl($oldPromo).') ficaria maior ou igual ao novo preço de venda ('.$this->brl($newPrice).') — ajuste ou remova a promoção.';
                        $errors[] = 'Preço promocional atual >= novo preço de venda.';
                    } else {
                        $errors[] = 'Preço promocional deve ser menor que o preço de venda.';
                    }
                }

                if ($stockOp !== 'keep') {
                    if (! $variant) {
                        $errors[] = 'Produto sem variação física cadastrada para controle de saldo.';
                    } elseif ($stockOp === 'set' && $isMultiVariant && $variantFilterIds === [] && ! $applyStockToVariants) {
                        $errors[] = 'Produto com múltiplas variações: confirme "Aplicar saldo a todas as variações" ou edite na grade.';
                    } else {
                        $qtyVal = (int) ($rules['stock_qty'] ?? 0);
                        if ($stockOp === 'set') {
                            $newStock = $qtyVal;
                        } elseif ($stockOp === 'add') {
                            $newStock = $oldStock + max(0, $qtyVal);
                        } elseif ($stockOp === 'subtract') {
                            $newStock = $oldStock - max(0, $qtyVal);
                        }

                        if ($newStock < 0) {
                            $errors[] = "Saldo final ({$newStock}) não pode ficar negativo.";
                        } elseif ($newStock < $reservedQty) {
                            $errors[] = "Saldo final ({$newStock}) menor que o reservado em pedidos ({$reservedQty} un.).";
                        }
                    }
                }

                if ($newPrice !== $oldPrice) {
                    $changes[] = [
                        'field' => 'price',
                        'label' => 'Preço de venda',
                        'old_display' => $this->brl($oldPrice),
                        'new_display' => $this->brl($newPrice),
                    ];
                }
                if ($newPromo !== $oldPromo) {
                    $changes[] = [
                        'field' => 'promo_price',
                        'label' => 'Preço promocional',
                        'old_display' => $oldPromo ? $this->brl($oldPromo) : 'Sem promoção',
                        'new_display' => $newPromo ? $this->brl($newPromo) : 'Removido',
                    ];
                }
                if ($costOp !== 'keep' && $newCost !== $oldCost) {
                    $changes[] = [
                        'field' => 'cost',
                        'label' => 'Custo unitário',
                        'old_display' => $oldCost !== null ? $this->brl($oldCost) : 'Não informado',
                        'new_display' => $newCost !== null ? $this->brl($newCost) : 'Não informado',
                    ];
                }
                if ($variant && $newStock !== $oldStock) {
                    $availAfter = max(0, $newStock - $reservedQty);
                    $changes[] = [
                        'field' => 'stock',
                        'label' => 'Saldo físico (disp.)',
                        'old_display' => "{$oldStock} un. (disp. ".max(0, $oldStock - $reservedQty).')',
                        'new_display' => "{$newStock} un. (disp. {$availAfter})",
                    ];
                }

                $isValid = $errors === [];
                if ($isValid) {
                    $validCount++;
                } else {
                    $invalidCount++;
                }

                if ($productImpacts !== []) {
                    if (collect($productImpacts)->contains(fn (string $s): bool => str_contains($s, 'Atacado'))) {
                        $impactedWholesaleCount++;
                    }
                    if (collect($productImpacts)->contains(fn (string $s): bool => str_contains($s, 'Promo'))) {
                        $impactedPromoCount++;
                    }
                }

                $previewRows[] = [
                    'key' => $itemKey,
                    'product_id' => $product->id,
                    'variant_id' => $variant?->id,
                    'sku' => $sku,
                    'product_name' => $product->name,
                    'variant_name' => $variant ? ($isMultiVariant ? $variant->name : 'Padrão') : 'Produto principal',
                    'is_multi_variant' => $isMultiVariant,
                    'changes' => $changes,
                    'price_before_cents' => $oldPrice,
                    'price_after_cents' => $newPrice,
                    'promo_before_cents' => $oldPromo,
                    'promo_after_cents' => $newPromo,
                    'cost_before_cents' => $actor->hasPermission('catalog.cost.view') ? $oldCost : null,
                    'cost_after_cents' => $actor->hasPermission('catalog.cost.view') ? $newCost : null,
                    'stock_before' => $oldStock,
                    'stock_after' => $newStock,
                    'reserved_qty' => $reservedQty,
                    'impacts' => array_values(array_unique($itemImpacts)),
                    'errors' => array_values(array_unique($errors)),
                    'valid' => $isValid,
                ];
            }
        }

        $selectionHash = hash('sha256', json_encode([
            'keys' => array_keys($snapshots),
            'rules' => $rules,
        ], JSON_THROW_ON_ERROR));

        return [
            'summary' => [
                'total_products' => $products->count(),
                'total_items' => count($previewRows),
                'valid_count' => $validCount,
                'invalid_count' => $invalidCount,
                'impacted_wholesale_count' => $impactedWholesaleCount,
                'impacted_promo_count' => $impactedPromoCount,
                'requires_async' => $products->count() > self::ASYNC_THRESHOLD,
            ],
            'rows' => $previewRows,
            'preview_snapshot' => [
                'selection_hash' => $selectionHash,
                'items' => $snapshots,
                'generated_at' => now()->toIso8601String(),
            ],
            'target_categories' => $targetCategoriesMap,
        ];
    }

    /**
     * Commits a bulk rule batch atomically with idempotency, concurrency conflict detection,
     * partial valid-only support, and optional background queuing for large batches.
     *
     * @param  array<string, mixed>  $selection
     * @param  array<string, mixed>  $rules
     * @param  array<string, mixed>  $previewSnapshot
     * @return array<string, mixed>
     */
    public function commitRules(
        array $selection,
        array $rules,
        User $actor,
        string $idempotencyKey,
        array $previewSnapshot = [],
        bool $applyValidOnly = false,
        bool $async = false,
        string $conflictResolution = 'abort',
    ): array {
        $existingBatch = BulkEditBatch::query()
            ->where('idempotency_key', $idempotencyKey)
            ->with(['items', 'user:id,name'])
            ->first();

        if ($existingBatch) {
            return [
                'status' => $existingBatch->status,
                'batch' => $existingBatch,
                'idempotent_replay' => true,
                'conflicts' => [],
                'pending_items' => [],
                'counts' => [
                    'completed' => $existingBatch->updated_count + $existingBatch->created_count,
                    'skipped' => $existingBatch->skipped_count,
                    'pending' => $existingBatch->pending_count,
                ],
            ];
        }

        $preview = $this->previewRules($selection, $rules, $actor);

        if (($preview['summary']['invalid_count'] ?? 0) > 0 && ! $applyValidOnly) {
            throw ValidationException::withMessages([
                'rules' => ['Existem itens com inconsistências na prévia. Corrija-os ou selecione "Aplicar apenas os válidos".'],
            ]);
        }

        if ($async || ($preview['summary']['total_products'] ?? 0) > self::ASYNC_THRESHOLD) {
            $batch = BulkEditBatch::query()->create([
                'batch_code' => 'REGRA-'.now()->format('ymd').'-'.strtoupper(Str::random(5)),
                'idempotency_key' => $idempotencyKey,
                'user_id' => $actor->id,
                'source' => 'bulk_rule',
                'operation_type' => $this->resolveOperationLabel($rules),
                'status' => 'processing',
                'total_rows' => (int) ($preview['summary']['total_items'] ?? 0),
                'created_count' => 0,
                'updated_count' => 0,
                'skipped_count' => 0,
                'pending_count' => (int) ($preview['summary']['total_items'] ?? 0),
                'failed_count' => 0,
                'summary' => $preview['summary'],
            ]);

            ProcessCatalogBulkRuleJob::dispatch(
                $batch->id,
                $selection,
                $rules,
                $actor->id,
                $previewSnapshot,
                $applyValidOnly,
                $conflictResolution
            );

            return [
                'status' => 'processing',
                'queued' => true,
                'batch' => $batch->fresh(['user:id,name']),
                'idempotent_replay' => false,
                'conflicts' => [],
                'pending_items' => [],
                'counts' => [
                    'completed' => 0,
                    'skipped' => 0,
                    'pending' => $batch->total_rows,
                ],
            ];
        }

        return $this->executeCommit(
            null,
            $preview,
            $rules,
            $actor,
            $idempotencyKey,
            $previewSnapshot,
            $applyValidOnly,
            $conflictResolution
        );
    }

    /**
     * Executes a pre-created queued batch or a direct synchronous commit.
     *
     * @param  array<string, mixed>  $preview
     * @param  array<string, mixed>  $rules
     * @param  array<string, mixed>  $previewSnapshot
     * @return array<string, mixed>
     */
    public function executeCommit(
        ?BulkEditBatch $queuedBatch,
        array $preview,
        array $rules,
        User $actor,
        string $idempotencyKey,
        array $previewSnapshot,
        bool $applyValidOnly,
        string $conflictResolution,
    ): array {
        $snapshotItems = is_array($previewSnapshot['items'] ?? null) ? $previewSnapshot['items'] : [];
        $priceOp = (string) ($rules['price_op'] ?? 'keep');
        $promoOp = (string) ($rules['promo_op'] ?? 'keep');
        $costOp = (string) ($rules['cost_op'] ?? 'keep');
        $stockOp = (string) ($rules['stock_op'] ?? 'keep');
        $brandOp = (string) ($rules['brand_op'] ?? 'keep');
        $catOp = (string) ($rules['category_op'] ?? 'keep');
        $statusOp = (string) ($rules['status_op'] ?? 'keep');
        $stockReason = trim((string) ($rules['stock_reason'] ?? '')) ?: 'Ajuste em massa no catálogo administrativo';

        $targetBrandId = ($brandOp === 'set' && ! empty($rules['brand_id'])) ? (int) $rules['brand_id'] : null;
        $targetCatIds = array_values(array_filter(array_map('intval', $rules['category_ids'] ?? [])));

        $conflicts = [];
        $pendingItems = [];
        $completedCount = 0;
        $skippedCount = 0;
        $batchItemsLog = [];
        $updatedProductIds = [];

        $result = DB::transaction(function () use (
            $queuedBatch,
            $preview,
            $snapshotItems,
            $priceOp,
            $promoOp,
            $costOp,
            $stockOp,
            $brandOp,
            $catOp,
            $statusOp,
            $stockReason,
            $targetBrandId,
            $targetCatIds,
            $actor,
            $idempotencyKey,
            $applyValidOnly,
            $conflictResolution,
            &$conflicts,
            &$pendingItems,
            &$completedCount,
            &$skippedCount,
            &$batchItemsLog,
            &$updatedProductIds,
        ): array {
            $batch = $queuedBatch ?? BulkEditBatch::query()->create([
                'batch_code' => 'REGRA-'.now()->format('ymd').'-'.strtoupper(Str::random(5)),
                'idempotency_key' => $idempotencyKey,
                'user_id' => $actor->id,
                'source' => 'bulk_rule',
                'operation_type' => $this->resolveOperationLabel(['price_op' => $priceOp, 'promo_op' => $promoOp, 'stock_op' => $stockOp, 'brand_op' => $brandOp, 'category_op' => $catOp, 'status_op' => $statusOp]),
                'status' => 'completed',
                'total_rows' => (int) ($preview['summary']['total_items'] ?? 0),
                'created_count' => 0,
                'updated_count' => 0,
                'skipped_count' => 0,
                'pending_count' => 0,
                'failed_count' => 0,
                'summary' => $preview['summary'],
            ]);

            foreach ($preview['rows'] as $row) {
                $itemKey = (string) $row['key'];
                $productId = (int) $row['product_id'];
                $variantId = ! empty($row['variant_id']) ? (int) $row['variant_id'] : null;

                if (empty($row['valid'])) {
                    $skippedCount++;
                    $pendingItems[] = $row;
                    $batchItemsLog[] = [
                        'product_id' => $productId,
                        'product_variant_id' => $variantId,
                        'sku' => (string) $row['sku'],
                        'action' => 'skipped',
                        'old_values' => null,
                        'new_values' => null,
                        'error_message' => implode(' ', $row['errors'] ?? ['Inválido']),
                    ];

                    continue;
                }

                /** @var Product|null $product */
                $product = Product::withTrashed()->lockForUpdate()->find($productId);
                if (! $product) {
                    $skippedCount++;

                    continue;
                }

                /** @var ProductVariant|null $variant */
                $variant = $variantId ? ProductVariant::query()->lockForUpdate()->find($variantId) : null;

                // Concurrency validation against snapshot
                $snap = $snapshotItems[$itemKey] ?? $snapshotItems["product:{$productId}"] ?? null;
                if ($snap && $conflictResolution !== 'force_current') {
                    $conflictReasons = [];
                    if ($variant && isset($snap['stock_qty']) && (int) $snap['stock_qty'] !== (int) $variant->stock_qty && $stockOp !== 'keep') {
                        $conflictReasons[] = "Saldo mudou de {$snap['stock_qty']} para {$variant->stock_qty} un.";
                    }
                    if ($variant && isset($snap['price_cents']) && (int) $snap['price_cents'] !== (int) $variant->price_cents && ($priceOp !== 'keep' || $promoOp !== 'keep')) {
                        $conflictReasons[] = 'Preço alterado concorrentemente.';
                    }
                    if ($variant && ! empty($snap['updated_at']) && $variant->updated_at && $variant->updated_at->toIso8601String() !== $snap['updated_at'] && $conflictReasons === []) {
                        if ($stockOp !== 'keep' || $priceOp !== 'keep' || $promoOp !== 'keep') {
                            $conflictReasons[] = 'Registro atualizado por outra operação após a prévia.';
                        }
                    }

                    if ($conflictReasons !== []) {
                        $conflicts[] = [
                            'key' => $itemKey,
                            'product_id' => $productId,
                            'variant_id' => $variantId,
                            'sku' => (string) $row['sku'],
                            'product_name' => $product->name,
                            'variant_name' => $variant?->name ?? 'Padrão',
                            'reason' => implode(' ', $conflictReasons),
                            'preview_stock_qty' => $snap['stock_qty'] ?? null,
                            'live_stock_qty' => $variant?->stock_qty,
                            'live_reserved_qty' => $variant?->reserved_qty ?? 0,
                            'preview_price_cents' => $snap['price_cents'] ?? null,
                            'live_price_cents' => $variant?->price_cents ?? $product->price_cents,
                        ];

                        if ($applyValidOnly) {
                            $skippedCount++;
                            $pendingItems[] = array_merge($row, ['errors' => $conflictReasons, 'valid' => false]);
                            $batchItemsLog[] = [
                                'product_id' => $productId,
                                'product_variant_id' => $variantId,
                                'sku' => (string) $row['sku'],
                                'action' => 'skipped',
                                'old_values' => ['stock_qty' => $variant?->stock_qty, 'price_cents' => $variant?->price_cents],
                                'new_values' => null,
                                'error_message' => implode(' ', $conflictReasons),
                            ];

                            continue;
                        }

                        continue;
                    }
                }

                // If conflicts exist and we are aborting, stop applying further mutations on first pass check
                if ($conflicts !== [] && ! $applyValidOnly && $conflictResolution !== 'force_current') {
                    continue;
                }

                $oldValues = [
                    'price_cents' => $variant ? $variant->price_cents : $product->price_cents,
                    'promo_price_cents' => $variant ? $variant->promo_price_cents : $product->promo_price_cents,
                    'stock_qty' => $variant?->stock_qty,
                    'brand_id' => $product->brand_id,
                    'is_active' => $product->is_active,
                ];

                // Apply Product-level operations once per product
                if (! isset($updatedProductIds[$product->id])) {
                    $prodUpdate = [];
                    if ($brandOp === 'set') {
                        $prodUpdate['brand_id'] = $targetBrandId;
                    } elseif ($brandOp === 'clear') {
                        $prodUpdate['brand_id'] = null;
                    }

                    if ($statusOp === 'activate') {
                        $prodUpdate['is_active'] = true;
                    } elseif ($statusOp === 'deactivate') {
                        $prodUpdate['is_active'] = false;
                    } elseif ($statusOp === 'archive') {
                        $prodUpdate['is_active'] = false;
                    } elseif ($statusOp === 'restore') {
                        if ($product->trashed()) {
                            $product->restore();
                        }
                        $prodUpdate['is_active'] = true;
                    }

                    if ($prodUpdate !== []) {
                        $product->update($prodUpdate);
                    }

                    if ($statusOp === 'archive' && ! $product->trashed()) {
                        $product->variants()->update(['is_active' => false]);
                        $product->delete();
                    }

                    if ($catOp !== 'keep') {
                        $currentCats = $product->categories()->pluck('categories.id')->all();
                        $nextCats = $this->computeNewCategoryIds($currentCats, $targetCatIds, $catOp);
                        $product->categories()->sync($nextCats);
                    }

                    $updatedProductIds[$product->id] = true;
                }

                // Apply Variant / Price / Promo / Cost / Stock operations
                $newPrice = (int) $row['price_after_cents'];
                $newPromo = $row['promo_after_cents'];
                $newCost = $row['cost_after_cents'] ?? null;
                $newStock = (int) $row['stock_after'];

                if ($variant) {
                    $varUpdate = [];
                    if ($priceOp !== 'keep') {
                        $varUpdate['price_cents'] = $newPrice;
                    }
                    if ($promoOp !== 'keep') {
                        $varUpdate['promo_price_cents'] = $newPromo;
                    }
                    if ($costOp !== 'keep') {
                        $varUpdate['cost_cents'] = $newCost;
                    }
                    if ($varUpdate !== []) {
                        $variant->update($varUpdate);
                    }

                    // Keep parent product base price/cost synchronized when editing default variant or single-variant product
                    if (($variant->is_default || $product->variants()->count() <= 1) && ($priceOp !== 'keep' || $promoOp !== 'keep' || $costOp !== 'keep')) {
                        $productSync = [];
                        if ($priceOp !== 'keep') {
                            $productSync['price_cents'] = $newPrice;
                        }
                        if ($promoOp !== 'keep') {
                            $productSync['promo_price_cents'] = $newPromo;
                        }
                        if ($costOp !== 'keep') {
                            $productSync['cost_cents'] = $newCost;
                        }
                        if ($productSync !== []) {
                            $product->update($productSync);
                        }
                    }

                    if ($stockOp !== 'keep') {
                        $delta = $newStock - $variant->stock_qty;
                        if ($delta !== 0) {
                            $this->inventory->adjustStock(
                                $variant,
                                $delta,
                                $delta > 0 ? InventoryMovementType::In : InventoryMovementType::Adjustment,
                                $actor,
                                "{$stockReason} ({$batch->batch_code})",
                                $batch->batch_code
                            );
                        }
                    }
                } elseif ($priceOp !== 'keep' || $promoOp !== 'keep' || $costOp !== 'keep') {
                    $prodDirectUpdate = [];
                    if ($priceOp !== 'keep') {
                        $prodDirectUpdate['price_cents'] = $newPrice;
                    }
                    if ($promoOp !== 'keep') {
                        $prodDirectUpdate['promo_price_cents'] = $newPromo;
                    }
                    if ($costOp !== 'keep') {
                        $prodDirectUpdate['cost_cents'] = $newCost;
                    }
                    $product->update($prodDirectUpdate);
                }

                $completedCount++;
                $batchItemsLog[] = [
                    'product_id' => $product->id,
                    'product_variant_id' => $variant?->id,
                    'sku' => (string) $row['sku'],
                    'action' => 'updated',
                    'old_values' => $oldValues,
                    'new_values' => [
                        'price_cents' => $newPrice,
                        'promo_price_cents' => $newPromo,
                        'stock_qty' => $newStock,
                    ],
                    'error_message' => null,
                ];
            }

            if ($conflicts !== [] && ! $applyValidOnly && $conflictResolution !== 'force_current') {
                DB::rollBack();

                return [
                    'status' => 'conflict',
                    'batch' => null,
                    'idempotent_replay' => false,
                    'conflicts' => $conflicts,
                    'pending_items' => [],
                    'counts' => [
                        'completed' => 0,
                        'skipped' => 0,
                        'pending' => count($conflicts),
                    ],
                ];
            }

            foreach ($batchItemsLog as $logItem) {
                BulkEditBatchItem::query()->create(array_merge($logItem, [
                    'bulk_edit_batch_id' => $batch->id,
                ]));
            }

            $finalStatus = $pendingItems !== [] && $completedCount > 0
                ? 'partial'
                : ($completedCount === 0 && $skippedCount > 0 ? 'failed' : 'completed');

            $batch->update([
                'status' => $finalStatus,
                'updated_count' => $completedCount,
                'skipped_count' => $skippedCount,
                'pending_count' => count($pendingItems),
                'failed_count' => count($pendingItems),
            ]);

            return [
                'status' => $finalStatus,
                'batch' => $batch->fresh(['items', 'user:id,name']),
                'idempotent_replay' => false,
                'conflicts' => $conflicts,
                'pending_items' => $pendingItems,
                'counts' => [
                    'completed' => $completedCount,
                    'skipped' => $skippedCount,
                    'pending' => count($pendingItems),
                ],
            ];
        });

        if (($result['status'] ?? '') !== 'conflict') {
            $this->flushStorefrontCaches();
            $this->audit->record(
                'catalog.bulk_rule_committed',
                $actor,
                'bulk_edit_batch',
                $result['batch']?->id,
                null,
                [
                    'operation' => $this->resolveOperationLabel($rules),
                    'counts' => $result['counts'],
                ]
            );
        }

        return $result;
    }

    public function flushStorefrontCaches(): void
    {
        SeoController::clearCaches();
        Cache::forget('storefront.bootstrap.v1');
        Cache::forget('storefront.catalog.filters.v1');
        app(WholesalePricingService::class)->flushCache();
    }

    /**
     * @param  list<int>  $currentIds
     * @param  list<int>  $targetIds
     * @return list<int>
     */
    private function computeNewCategoryIds(array $currentIds, array $targetIds, string $catOp): array
    {
        return match ($catOp) {
            'add' => array_values(array_unique(array_merge($currentIds, $targetIds))),
            'remove' => array_values(array_diff($currentIds, $targetIds)),
            'replace' => array_values(array_unique($targetIds)),
            default => $currentIds,
        };
    }

    /**
     * @param  list<int>  $productCatIds
     * @param  Collection<int, WholesaleRule>  $wholesaleRules
     * @param  Collection<int, Promotion>  $promotions
     * @return list<string>
     */
    private function detectImpacts(
        Product $product,
        array $productCatIds,
        Collection $wholesaleRules,
        Collection $promotions,
        string $priceOp,
        string $promoOp,
        string $brandOp,
        string $catOp,
    ): array {
        $impacts = [];

        if ($priceOp !== 'keep' || $promoOp !== 'keep' || $catOp !== 'keep' || $brandOp !== 'keep') {
            foreach ($wholesaleRules as $rule) {
                $matchesProduct = $rule->ruleProducts->contains(function ($rp) use ($product, $productCatIds): bool {
                    if ($rp->is_excluded) {
                        return false;
                    }
                    if ($rp->product_id && (int) $rp->product_id === (int) $product->id) {
                        return true;
                    }
                    if ($rp->category_id && in_array((int) $rp->category_id, $productCatIds, true)) {
                        return true;
                    }

                    return $rp->product_id === null && $rp->category_id === null && $rp->wholesale_group_id === null;
                });

                if ($matchesProduct) {
                    if ($priceOp !== 'keep' || $promoOp !== 'keep') {
                        $impacts[] = "Atacado ({$rule->name}): preços de atacado percentuais serão recalculados sobre o novo valor.";
                    }
                    if ($catOp === 'remove' || $catOp === 'replace') {
                        $impacts[] = "Atacado ({$rule->name}): alteração de categoria pode alterar elegibilidade desta regra.";
                    }
                }
            }

            if ($product->wholesale_enabled && ! empty($product->wholesale_tiers) && ($priceOp !== 'keep' || $promoOp !== 'keep')) {
                $impacts[] = 'Atacado próprio do produto será recalculado automaticamente.';
            }

            foreach ($promotions as $promo) {
                $scopeIds = array_map('intval', $promo->scope_ids ?? []);
                $applies = ($promo->scope_type === 'all')
                    || ($promo->scope_type === 'product' && in_array($product->id, $scopeIds, true))
                    || ($promo->scope_type === 'category' && array_intersect($productCatIds, $scopeIds) !== [])
                    || ($promo->scope_type === 'brand' && $product->brand_id && in_array((int) $product->brand_id, $scopeIds, true));

                if ($applies) {
                    $impacts[] = "Promoção ativa ({$promo->name}): revise o impacto sobre a campanha promocional.";
                }
            }
        }

        return $impacts;
    }

    /** @param array<string, mixed> $rules */
    private function resolveOperationLabel(array $rules): string
    {
        $parts = [];
        if (($rules['price_op'] ?? 'keep') !== 'keep') {
            $parts[] = 'preço';
        }
        if (($rules['promo_op'] ?? 'keep') !== 'keep') {
            $parts[] = 'promocional';
        }
        if (($rules['cost_op'] ?? 'keep') !== 'keep') {
            $parts[] = 'custo';
        }
        if (($rules['stock_op'] ?? 'keep') !== 'keep') {
            $parts[] = 'estoque';
        }
        if (($rules['brand_op'] ?? 'keep') !== 'keep') {
            $parts[] = 'marca';
        }
        if (($rules['category_op'] ?? 'keep') !== 'keep') {
            $parts[] = 'categorias';
        }
        if (($rules['status_op'] ?? 'keep') !== 'keep') {
            $parts[] = 'situação';
        }

        return $parts !== [] ? implode('+', $parts) : 'regra_em_massa';
    }

    private function brl(int $cents): string
    {
        return 'R$ '.number_format($cents / 100, 2, ',', '.');
    }
}
