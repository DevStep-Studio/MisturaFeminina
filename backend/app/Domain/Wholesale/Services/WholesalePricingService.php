<?php

declare(strict_types=1);

namespace App\Domain\Wholesale\Services;

use App\Models\Cart;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use App\Models\WholesaleCustomerGroupMember;
use App\Models\WholesaleRule;
use App\Models\WholesaleRuleTier;
use Illuminate\Support\Collection;

class WholesalePricingService
{
    /**
     * Calculate wholesale pricing for an active cart.
     *
     * @return array<string, mixed>
     */
    public function calculateForCart(Cart $cart, ?User $user = null, ?string $couponCode = null): array
    {
        $cart->loadMissing(['items.product.categories', 'items.product.brand', 'items.product.wholesaleGroupItems', 'items.variant']);

        $items = [];
        foreach ($cart->items as $cartItem) {
            $product = $cartItem->product;
            $variant = $cartItem->variant;
            if (! $product || ! $variant || ! $product->is_active || ! $variant->is_active) {
                continue;
            }

            $items[] = [
                'id' => $cartItem->id,
                'cart_item_id' => $cartItem->id,
                'product_id' => $product->id,
                'product_variant_id' => $variant->id,
                'quantity' => (int) $cartItem->quantity,
                'original_unit_price_cents' => $variant->effectivePriceCents(),
                'product' => $product,
                'variant' => $variant,
            ];
        }

        return $this->calculateForItems($items, $user, null, $couponCode);
    }

    /**
     * Calculate wholesale preview for a product display / PDP / Vitrine card.
     *
     * @return array<string, mixed>
     */
    public function calculateForProduct(Product $product, ?User $user = null): array
    {
        $product->loadMissing(['categories', 'brand', 'wholesaleGroupItems', 'variants']);
        $rules = $this->resolveActiveRules($user);

        $matchingRule = null;
        foreach ($rules as $rule) {
            if ($this->productMatchesRule($product, null, $rule)) {
                $matchingRule = $rule;
                break;
            }
        }

        if (! $matchingRule || $matchingRule->tiers->isEmpty()) {
            if ($product->wholesale_enabled && is_array($product->wholesale_tiers) && ! empty($product->wholesale_tiers)) {
                $basePrice = $product->effectivePriceCents();
                $formattedTiers = [];
                $minQuantity = null;
                $lowestWholesalePrice = $basePrice;

                foreach ($product->wholesale_tiers as $tIdx => $t) {
                    $minQ = (int) ($t['min_qty'] ?? 0);
                    $discPct = (float) ($t['discount_percent'] ?? 0);
                    if ($minQ <= 0 || $discPct <= 0) {
                        continue;
                    }
                    $tierPrice = (int) round($basePrice * (1 - $discPct / 100));
                    $tierPrice = max(100, min($basePrice, $tierPrice));
                    if ($minQuantity === null || $minQ < $minQuantity) {
                        $minQuantity = $minQ;
                    }
                    if ($tierPrice < $lowestWholesalePrice) {
                        $lowestWholesalePrice = $tierPrice;
                    }
                    $formattedTiers[] = [
                        'id' => $tIdx + 1,
                        'min_quantity' => $minQ,
                        'max_quantity' => null,
                        'discount_type' => 'percent',
                        'discount_value' => $discPct,
                        'unit_price_cents' => $tierPrice,
                        'unit_price_formatted' => 'R$ '.number_format($tierPrice / 100, 2, ',', '.'),
                        'discount_cents' => max(0, $basePrice - $tierPrice),
                    ];
                }

                if (! empty($formattedTiers)) {
                    return [
                        'has_wholesale' => true,
                        'rule_id' => null,
                        'rule_name' => 'Atacado Produto',
                        'quantity_scope' => $product->wholesale_group_variants ? 'product' : 'sku',
                        'min_quantity' => $minQuantity,
                        'starting_price_cents' => $lowestWholesalePrice,
                        'starting_price_formatted' => 'R$ '.number_format($lowestWholesalePrice / 100, 2, ',', '.'),
                        'allows_shade_mixing' => (bool) $product->wholesale_group_variants,
                        'stacking_policy' => 'no_stacking',
                        'tiers' => $formattedTiers,
                    ];
                }
            }

            return [
                'has_wholesale' => false,
                'rule_id' => null,
                'rule_name' => null,
                'min_quantity' => null,
                'starting_price_cents' => null,
                'allows_shade_mixing' => false,
                'tiers' => [],
            ];
        }

        $basePrice = $product->effectivePriceCents();
        $formattedTiers = [];
        $minQuantity = null;
        $lowestWholesalePrice = $basePrice;

        foreach ($matchingRule->tiers as $tier) {
            $tierPrice = $this->calculateTierUnitPrice($basePrice, $tier);
            if ($minQuantity === null || $tier->min_quantity < $minQuantity) {
                $minQuantity = $tier->min_quantity;
            }
            if ($tierPrice < $lowestWholesalePrice) {
                $lowestWholesalePrice = $tierPrice;
            }

            $formattedTiers[] = [
                'id' => $tier->id,
                'min_quantity' => $tier->min_quantity,
                'max_quantity' => $tier->max_quantity,
                'discount_type' => $tier->discount_type,
                'discount_value' => (float) $tier->discount_value,
                'unit_price_cents' => $tierPrice,
                'unit_price_formatted' => 'R$ '.number_format($tierPrice / 100, 2, ',', '.'),
                'discount_cents' => max(0, $basePrice - $tierPrice),
            ];
        }

        $allowsShadeMixing = in_array($matchingRule->quantity_scope, ['product', 'commercial_line', 'wholesale_group', 'category', 'order'], true);

        return [
            'has_wholesale' => true,
            'rule_id' => $matchingRule->id,
            'rule_name' => $matchingRule->name,
            'quantity_scope' => $matchingRule->quantity_scope,
            'min_quantity' => $minQuantity,
            'starting_price_cents' => $lowestWholesalePrice,
            'starting_price_formatted' => 'R$ '.number_format($lowestWholesalePrice / 100, 2, ',', '.'),
            'allows_shade_mixing' => $allowsShadeMixing,
            'stacking_policy' => $matchingRule->stacking_policy,
            'tiers' => $formattedTiers,
        ];
    }

    /**
     * Simulate wholesale calculation with 0 side-effects for testing, customer preview, or Admin Simulator.
     *
     * @param  list<array{product_id: int, product_variant_id?: int|null, quantity: int, unit_price_cents?: int|null}>  $rawItems
     * @return array<string, mixed>
     */
    public function simulate(array $rawItems, ?User $user = null, ?int $customerGroupId = null, ?string $couponCode = null): array
    {
        $productIds = array_filter(array_column($rawItems, 'product_id'));
        $variantIds = array_filter(array_column($rawItems, 'product_variant_id'));

        $products = Product::query()
            ->whereIn('id', $productIds)
            ->with(['categories', 'brand', 'wholesaleGroupItems', 'variants'])
            ->get()
            ->keyBy('id');

        $variants = ProductVariant::query()
            ->whereIn('id', $variantIds)
            ->with('product')
            ->get()
            ->keyBy('id');

        $items = [];
        foreach ($rawItems as $idx => $raw) {
            $prodId = (int) $raw['product_id'];
            $product = $products->get($prodId);
            if (! $product) {
                continue;
            }

            $varId = isset($raw['product_variant_id']) ? (int) $raw['product_variant_id'] : null;
            $variant = $varId ? $variants->get($varId) : $product->variants->first();

            $basePrice = isset($raw['unit_price_cents']) && (int) $raw['unit_price_cents'] > 0
                ? (int) $raw['unit_price_cents']
                : ($variant ? $variant->effectivePriceCents() : $product->effectivePriceCents());

            $items[] = [
                'id' => $idx + 1,
                'cart_item_id' => $idx + 1,
                'product_id' => $product->id,
                'product_variant_id' => $variant?->id,
                'quantity' => max(1, (int) $raw['quantity']),
                'original_unit_price_cents' => $basePrice,
                'product' => $product,
                'variant' => $variant,
            ];
        }

        return $this->calculateForItems($items, $user, $customerGroupId, $couponCode);
    }

    /**
     * Core wholesale pricing calculation algorithm across raw normalized items.
     *
     * @param  list<array<string, mixed>>  $items
     * @return array<string, mixed>
     */
    public function calculateForItems(array $items, ?User $user = null, ?int $customerGroupId = null, ?string $couponCode = null): array
    {
        if (empty($items)) {
            return [
                'is_wholesale_active' => false,
                'total_original_cents' => 0,
                'total_wholesale_discount_cents' => 0,
                'total_cents' => 0,
                'items' => [],
                'scope_summaries' => [],
                'coupon_allowed' => true,
                'stacking_notes' => [],
            ];
        }

        $productQuantities = [];
        $hasLegacyWholesale = false;
        foreach ($items as $item) {
            $pId = (int) $item['product_id'];
            $productQuantities[$pId] = ($productQuantities[$pId] ?? 0) + (int) $item['quantity'];

            $prod = $item['product'] ?? Product::find($item['product_id']);
            if ($prod && $prod->wholesale_enabled && is_array($prod->wholesale_tiers) && ! empty($prod->wholesale_tiers)) {
                $hasLegacyWholesale = true;
            }
        }

        $rules = $this->resolveActiveRules($user, $customerGroupId);
        if ($rules->isEmpty() && ! $hasLegacyWholesale) {
            $totalOriginal = 0;
            $processedItems = [];
            foreach ($items as $item) {
                $qty = (int) $item['quantity'];
                $unitOriginal = (int) $item['original_unit_price_cents'];
                $lineTotal = $unitOriginal * $qty;
                $totalOriginal += $lineTotal;

                $processedItems[$item['id']] = [
                    'item_id' => $item['id'],
                    'product_id' => $item['product_id'],
                    'product_variant_id' => $item['product_variant_id'] ?? null,
                    'quantity' => $qty,
                    'original_unit_price_cents' => $unitOriginal,
                    'wholesale_unit_price_cents' => $unitOriginal,
                    'wholesale_discount_cents' => 0,
                    'line_total_cents' => $lineTotal,
                    'wholesale_rule_id' => null,
                    'wholesale_rule_name' => null,
                    'wholesale_tier_min_qty' => null,
                    'is_wholesale_applied' => false,
                ];
            }

            return [
                'is_wholesale_active' => false,
                'total_original_cents' => $totalOriginal,
                'total_wholesale_discount_cents' => 0,
                'total_cents' => $totalOriginal,
                'items' => $processedItems,
                'scope_summaries' => [],
                'coupon_allowed' => true,
                'stacking_notes' => [],
            ];
        }

        // Phase 1: Aggregate quantities per scope per rule
        // Grouping key format: "{$rule->id}::{$scopeKey}"
        $scopeQuantities = [];
        $scopeMetadata = [];
        $itemRuleCandidates = [];

        foreach ($items as $item) {
            $product = $item['product'] ?? Product::find($item['product_id']);
            $variant = $item['variant'] ?? ($item['product_variant_id'] ? ProductVariant::find($item['product_variant_id']) : null);
            if (! $product) {
                continue;
            }

            $qty = (int) $item['quantity'];

            foreach ($rules as $rule) {
                if (! $this->productMatchesRule($product, $variant, $rule)) {
                    continue;
                }

                $scopeKey = $this->buildScopeKey($rule, $product, $variant);
                $fullScopeId = "{$rule->id}::{$scopeKey['key']}";

                $scopeQuantities[$fullScopeId] = ($scopeQuantities[$fullScopeId] ?? 0) + $qty;
                if (! isset($scopeMetadata[$fullScopeId])) {
                    $scopeMetadata[$fullScopeId] = [
                        'rule' => $rule,
                        'scope_key' => $scopeKey['key'],
                        'scope_name' => $scopeKey['name'],
                        'scope_type' => $rule->quantity_scope,
                    ];
                }

                $itemRuleCandidates[$item['id']][] = [
                    'rule' => $rule,
                    'full_scope_id' => $fullScopeId,
                ];
            }
        }

        // Phase 2: Calculate prices, matching tiers, and best rule per item
        $processedItems = [];
        $totalOriginalCents = 0;
        $totalWholesaleDiscountCents = 0;
        $totalFinalCents = 0;
        $appliedRules = [];

        foreach ($items as $item) {
            $itemId = $item['id'];
            $qty = (int) $item['quantity'];
            $unitOriginal = (int) $item['original_unit_price_cents'];
            $lineOriginal = $unitOriginal * $qty;
            $totalOriginalCents += $lineOriginal;

            $bestCandidate = null;
            $bestDiscountPerUnit = 0;
            $bestUnitPrice = $unitOriginal;

            $candidates = $itemRuleCandidates[$itemId] ?? [];
            foreach ($candidates as $candidate) {
                /** @var WholesaleRule $rule */
                $rule = $candidate['rule'];
                $fullScopeId = $candidate['full_scope_id'];
                $scopeTotalQty = $scopeQuantities[$fullScopeId] ?? $qty;

                $matchingTier = $this->findMatchingTier($rule, $scopeTotalQty);
                if ($matchingTier) {
                    $tierPrice = $this->calculateTierUnitPrice($unitOriginal, $matchingTier);
                    $discount = max(0, $unitOriginal - $tierPrice);

                    if ($discount > $bestDiscountPerUnit || ($discount === $bestDiscountPerUnit && $rule->priority > ($bestCandidate['rule']->priority ?? -1))) {
                        $bestDiscountPerUnit = $discount;
                        $bestUnitPrice = $tierPrice;
                        $bestCandidate = [
                            'rule' => $rule,
                            'tier' => $matchingTier,
                        ];
                    }
                }
            }

            $legacyRuleName = null;
            $legacyMatchedTierMin = null;
            if ($bestCandidate === null) {
                $product = $item['product'] ?? Product::find($item['product_id']);
                if ($product && $product->wholesale_enabled && is_array($product->wholesale_tiers)) {
                    $pQty = $product->wholesale_group_variants ? ($productQuantities[$product->id] ?? $qty) : $qty;
                    $legacyBestPrice = $unitOriginal;

                    foreach ($product->wholesale_tiers as $t) {
                        $minQ = (int) ($t['min_qty'] ?? 0);
                        $discPct = (float) ($t['discount_percent'] ?? 0);
                        if ($minQ > 0 && $pQty >= $minQ && $discPct > 0 && $discPct <= 80) {
                            $candidatePrice = (int) round($unitOriginal * (1 - $discPct / 100));
                            $candidatePrice = max(100, min($unitOriginal, $candidatePrice));
                            if ($candidatePrice < $legacyBestPrice) {
                                $legacyBestPrice = $candidatePrice;
                                $legacyMatchedTierMin = $minQ;
                            }
                        }
                    }

                    if ($legacyBestPrice < $unitOriginal) {
                        $bestUnitPrice = $legacyBestPrice;
                        $bestDiscountPerUnit = $unitOriginal - $legacyBestPrice;
                        $legacyRuleName = 'Atacado Produto';
                    }
                }
            }

            $isApplied = ($bestCandidate !== null && $bestDiscountPerUnit > 0) || ($legacyRuleName !== null && $bestDiscountPerUnit > 0);
            $lineDiscount = $bestDiscountPerUnit * $qty;
            $lineTotal = $bestUnitPrice * $qty;

            $totalWholesaleDiscountCents += $lineDiscount;
            $totalFinalCents += $lineTotal;

            if ($bestCandidate !== null && $isApplied) {
                $appliedRules[$bestCandidate['rule']->id] = $bestCandidate['rule'];
            }

            $processedItems[$itemId] = [
                'item_id' => $itemId,
                'product_id' => $item['product_id'],
                'product_variant_id' => $item['product_variant_id'] ?? null,
                'quantity' => $qty,
                'original_unit_price_cents' => $unitOriginal,
                'wholesale_unit_price_cents' => $bestUnitPrice,
                'wholesale_discount_cents' => $bestDiscountPerUnit,
                'line_total_cents' => $lineTotal,
                'wholesale_rule_id' => $bestCandidate['rule']->id ?? null,
                'wholesale_rule_name' => $bestCandidate['rule']->name ?? $legacyRuleName ?? null,
                'wholesale_tier_min_qty' => $bestCandidate['tier']->min_quantity ?? $legacyMatchedTierMin ?? null,
                'is_wholesale_applied' => $isApplied,
            ];
        }

        // Phase 3: Build scope summaries (including hints for next tier)
        $scopeSummaries = [];
        foreach ($scopeQuantities as $fullScopeId => $currentQty) {
            $meta = $scopeMetadata[$fullScopeId];
            /** @var WholesaleRule $rule */
            $rule = $meta['rule'];

            $currentTier = $this->findMatchingTier($rule, $currentQty);
            $nextTier = $rule->tiers
                ->filter(fn (WholesaleRuleTier $t) => $t->min_quantity > $currentQty)
                ->sortBy('min_quantity')
                ->first();

            $unitsToNextTier = $nextTier ? max(0, $nextTier->min_quantity - $currentQty) : 0;
            $message = '';

            if ($currentTier) {
                if ($nextTier) {
                    $nextFormatted = $nextTier->discount_type === 'percent'
                        ? "{$nextTier->discount_value}% OFF"
                        : 'R$ '.number_format($nextTier->discount_value, 2, ',', '.');
                    $message = "Você atingiu o atacado! Adicione mais {$unitsToNextTier} un. da linha {$meta['scope_name']} para liberar {$nextFormatted}.";
                } else {
                    $message = "Parabéns! Você alcançou a melhor faixa de atacado para a linha {$meta['scope_name']}.";
                }
            } elseif ($nextTier) {
                $nextFormatted = $nextTier->discount_type === 'percent'
                    ? "{$nextTier->discount_value}% OFF"
                    : 'R$ '.number_format($nextTier->discount_value, 2, ',', '.');
                $message = "Faltam apenas {$unitsToNextTier} un. da linha {$meta['scope_name']} para liberar o preço de atacado ({$nextFormatted})!";
            }

            $scopeSummaries[] = [
                'full_scope_id' => $fullScopeId,
                'scope_key' => $meta['scope_key'],
                'scope_name' => $meta['scope_name'],
                'scope_type' => $meta['scope_type'],
                'rule_id' => $rule->id,
                'rule_name' => $rule->name,
                'current_quantity' => $currentQty,
                'current_tier_min_qty' => $currentTier?->min_quantity,
                'next_tier_min_qty' => $nextTier?->min_quantity,
                'units_to_next_tier' => $unitsToNextTier,
                'is_tier_unlocked' => $currentTier !== null,
                'message' => $message,
            ];
        }

        // Phase 4: Stacking policy evaluation
        $couponAllowed = true;
        $stackingNotes = [];

        if (! empty($appliedRules)) {
            foreach ($appliedRules as $appliedRule) {
                if ($appliedRule->stacking_policy === 'no_stacking') {
                    $couponAllowed = false;
                    $stackingNotes[] = 'Itens com preço de atacado não acumulam com cupom de desconto.';
                    break;
                }
            }
        }

        return [
            'is_wholesale_active' => $totalWholesaleDiscountCents > 0,
            'total_original_cents' => $totalOriginalCents,
            'total_wholesale_discount_cents' => $totalWholesaleDiscountCents,
            'total_cents' => $totalFinalCents,
            'items' => $processedItems,
            'scope_summaries' => $scopeSummaries,
            'coupon_allowed' => $couponAllowed,
            'stacking_notes' => array_unique($stackingNotes),
        ];
    }

    /**
     * Resolve active rules accessible to the given user or customer group.
     *
     * @return Collection<int, WholesaleRule>
     */
    public function resolveActiveRules(?User $user = null, ?int $customerGroupId = null): Collection
    {
        $now = now();

        /** @var Collection<int, WholesaleRule> $rules */
        $rules = WholesaleRule::query()
            ->where('status', 'active')
            ->where(function ($q) use ($now): void {
                $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now);
            })
            ->where(function ($q) use ($now): void {
                $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now);
            })
            ->with(['tiers' => fn ($q) => $q->orderBy('min_quantity'), 'ruleProducts', 'customerGroups'])
            ->orderByDesc('priority')
            ->orderBy('id')
            ->get();

        if ($rules->isEmpty()) {
            return collect();
        }

        // Determine user's approved customer group ids
        $approvedGroupIds = [];
        if ($customerGroupId !== null) {
            $approvedGroupIds[] = $customerGroupId;
        } elseif ($user !== null) {
            $approvedGroupIds = WholesaleCustomerGroupMember::query()
                ->where('user_id', $user->id)
                ->where('status', 'approved')
                ->pluck('customer_group_id')
                ->all();
        }

        return $rules->filter(function (WholesaleRule $rule) use ($approvedGroupIds) {
            if ($rule->access_mode === 'open') {
                return true;
            }

            if ($rule->customerGroups->isEmpty()) {
                return $rule->access_mode !== 'exclusive';
            }

            $ruleGroupIds = $rule->customerGroups->pluck('id')->all();
            $matchesGroup = ! empty(array_intersect($approvedGroupIds, $ruleGroupIds));

            if ($rule->access_mode === 'exclusive') {
                return $matchesGroup;
            }

            // mixed mode: applies if in group or if rule has open fallback
            return $matchesGroup;
        })->values();
    }

    /**
     * Check if a product/variant matches a wholesale rule.
     */
    public function productMatchesRule(Product $product, ?ProductVariant $variant, WholesaleRule $rule): bool
    {
        // 1. Check exclusions first
        $isExcluded = $rule->ruleProducts
            ->where('is_excluded', true)
            ->first(function ($rp) use ($product, $variant) {
                if ($variant && $rp->product_variant_id === $variant->id) {
                    return true;
                }
                if ($rp->product_id === $product->id && $rp->product_variant_id === null) {
                    return true;
                }
                if ($rp->category_id && $product->categories->pluck('id')->contains($rp->category_id)) {
                    return true;
                }

                return false;
            });

        if ($isExcluded) {
            return false;
        }

        // 2. Check inclusions
        $inclusions = $rule->ruleProducts->where('is_excluded', false);
        if ($inclusions->isEmpty()) {
            // No explicit inclusions -> applies to entire catalog
            return true;
        }

        foreach ($inclusions as $inc) {
            if ($variant && $inc->product_variant_id === $variant->id) {
                return true;
            }
            if ($inc->product_id === $product->id && $inc->product_variant_id === null) {
                return true;
            }
            if ($inc->category_id && $product->categories->pluck('id')->contains($inc->category_id)) {
                return true;
            }
            if ($inc->wholesale_group_id) {
                $inGroup = $product->wholesaleGroupItems
                    ->where('wholesale_group_id', $inc->wholesale_group_id)
                    ->isNotEmpty();
                if ($inGroup) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Build scope key for quantity aggregation.
     *
     * @return array{key: string, name: string}
     */
    private function buildScopeKey(WholesaleRule $rule, Product $product, ?ProductVariant $variant): array
    {
        return match ($rule->quantity_scope) {
            'sku' => [
                'key' => 'sku_'.($variant ? $variant->id : $product->id),
                'name' => ($variant ? $variant->name : $product->name),
            ],
            'product' => [
                'key' => 'product_'.$product->id,
                'name' => $product->name,
            ],
            'commercial_line' => [
                'key' => $product->brand_id ? 'brand_'.$product->brand_id : 'prod_'.$product->id,
                'name' => $product->brand ? $product->brand->name : $product->name,
            ],
            'wholesale_group' => [
                'key' => 'group_'.(($firstGroupItem = $product->wholesaleGroupItems->first()) ? $firstGroupItem->wholesale_group_id : $product->id),
                'name' => $rule->name,
            ],
            'category' => [
                'key' => 'cat_'.(($firstCat = $product->categories->first()) ? $firstCat->id : 0),
                'name' => ($firstCat = $product->categories->first()) ? $firstCat->name : $product->name,
            ],
            'order' => [
                'key' => 'order_total',
                'name' => 'Pedido Completo',
            ],
            default => [
                'key' => 'product_'.$product->id,
                'name' => $product->name,
            ],
        };
    }

    /**
     * Find best matching tier for a given accumulated quantity.
     */
    private function findMatchingTier(WholesaleRule $rule, int $totalQuantity): ?WholesaleRuleTier
    {
        return $rule->tiers
            ->filter(function (WholesaleRuleTier $tier) use ($totalQuantity) {
                if ($totalQuantity < $tier->min_quantity) {
                    return false;
                }
                if ($tier->max_quantity !== null && $totalQuantity > $tier->max_quantity) {
                    return false;
                }

                return true;
            })
            ->sortByDesc('min_quantity')
            ->first();
    }

    /**
     * Calculate unit price for a tier in cents.
     */
    public function calculateTierUnitPrice(int $basePriceCents, WholesaleRuleTier $tier): int
    {
        $calculated = match ($tier->discount_type) {
            'fixed_price' => (int) round($tier->discount_value * 100),
            'percent' => (int) round($basePriceCents * (1 - $tier->discount_value / 100)),
            'fixed_discount' => (int) round($basePriceCents - ($tier->discount_value * 100)),
            default => $basePriceCents,
        };

        return max(0, min($basePriceCents, $calculated));
    }
}
