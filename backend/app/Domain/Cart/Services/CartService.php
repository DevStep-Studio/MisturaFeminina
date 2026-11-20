<?php

declare(strict_types=1);

namespace App\Domain\Cart\Services;

use App\Domain\Settings\Services\StoreSettingsService;
use App\Domain\Shipping\Services\ShippingQuoteService;
use App\Models\AnalyticsEvent;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Coupon;
use App\Models\CouponRedemption;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Promotion;
use App\Models\ShippingQuote;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CartService
{
    public function __construct(private readonly StoreSettingsService $settings) {}

    public function resolveCart(Request $request, bool $createIfMissing = true): ?Cart
    {
        $user = $request->user();
        $headerToken = $request->header('X-Cart-Token') ?: $request->cookie('mf_cart_token');
        $token = is_string($headerToken) && Str::isUuid($headerToken) ? $headerToken : null;

        $cart = null;
        if ($user) {
            $cart = Cart::query()->where('user_id', $user->id)->latest('id')->first();
            if ($token) {
                $guestCart = Cart::query()->where('token', $token)->whereNull('user_id')->first();
                if ($guestCart && (! $cart || $guestCart->id !== $cart->id)) {
                    $cart = $this->mergeGuestCart($user, $guestCart, $cart);
                }
            }
        } elseif ($token) {
            $cart = Cart::query()->where('token', $token)->first();
        }

        if (! $cart && $createIfMissing) {
            $cart = Cart::query()->create([
                'token' => $token ?? Str::uuid()->toString(),
                'user_id' => $user?->id,
                'expires_at' => now()->addDays(14),
            ]);
        }

        return $cart;
    }

    public function mergeGuestCart(User $user, Cart $guestCart, ?Cart $userCart = null): Cart
    {
        if (! $userCart) {
            $guestCart->update(['user_id' => $user->id, 'expires_at' => now()->addDays(14)]);

            return $guestCart;
        }

        $guestCart->load('items.variant');
        foreach ($guestCart->items as $guestItem) {
            $variant = $guestItem->variant;
            if (! $variant || ! $variant->is_active) {
                continue;
            }
            /** @var CartItem|null $existing */
            $existing = $userCart->items()->where('product_variant_id', $variant->id)->first();
            $desiredQty = ($existing ? $existing->quantity : 0) + $guestItem->quantity;
            $clampedQty = min($desiredQty, max(1, $variant->availableStock()));
            if ($variant->availableStock() <= 0) {
                continue;
            }
            if ($existing) {
                $existing->update([
                    'quantity' => $clampedQty,
                    'unit_price_snapshot_cents' => $variant->effectivePriceCents(),
                ]);
            } else {
                $userCart->items()->create([
                    'product_id' => $guestItem->product_id,
                    'product_variant_id' => $variant->id,
                    'quantity' => $clampedQty,
                    'unit_price_snapshot_cents' => $variant->effectivePriceCents(),
                ]);
            }
        }

        if (! $userCart->coupon_code && $guestCart->coupon_code) {
            $userCart->update(['coupon_code' => $guestCart->coupon_code]);
        }

        $guestCart->delete();

        return $userCart->fresh();
    }

    public function addItem(Cart $cart, ProductVariant $variant, int $quantity): Cart
    {
        $variant->loadMissing('product');
        if (! $variant->is_active || ! $variant->product || ! $variant->product->is_active) {
            throw ValidationException::withMessages(['variant_id' => ['Produto indisponível no momento.']]);
        }

        /** @var CartItem|null $existing */
        $existing = $cart->items()->where('product_variant_id', $variant->id)->first();
        $newQty = ($existing ? $existing->quantity : 0) + $quantity;
        if ($newQty > $variant->availableStock()) {
            throw ValidationException::withMessages([
                'quantity' => ["Quantidade solicitada excede o estoque disponível ({$variant->availableStock()} un.)."],
            ]);
        }

        if ($existing) {
            $existing->update([
                'quantity' => $newQty,
                'unit_price_snapshot_cents' => $variant->effectivePriceCents(),
            ]);
        } else {
            $cart->items()->create([
                'product_id' => $variant->product_id,
                'product_variant_id' => $variant->id,
                'quantity' => $newQty,
                'unit_price_snapshot_cents' => $variant->effectivePriceCents(),
            ]);
        }

        $this->invalidateShippingQuote($cart);

        return $cart->fresh();
    }

    /**
     * Add multiple variants/shades atomically without duplicating items on partial failure.
     *
     * @param  list<array{variant_id: int, quantity: int}>  $entries
     * @return array{cart: Cart, added: list<array<string, mixed>>, rejected: list<array<string, mixed>>}
     */
    public function addBulkItems(Cart $cart, array $entries, ?User $user = null): array
    {
        $aggregated = [];
        foreach ($entries as $entry) {
            $vid = (int) $entry['variant_id'];
            $qty = max(1, (int) $entry['quantity']);
            $aggregated[$vid] = ($aggregated[$vid] ?? 0) + $qty;
        }

        if ($aggregated === []) {
            throw ValidationException::withMessages(['items' => ['Selecione ao menos uma tonalidade e quantidade.']]);
        }

        $variants = ProductVariant::query()
            ->whereIn('id', array_keys($aggregated))
            ->with('product')
            ->get()
            ->keyBy('id');

        $added = [];
        $rejected = [];

        DB::transaction(function () use ($cart, $aggregated, $variants, &$added, &$rejected): void {
            foreach ($aggregated as $variantId => $qty) {
                /** @var ProductVariant|null $variant */
                $variant = $variants->get($variantId);
                if (! $variant || ! $variant->is_active || ! $variant->product || ! $variant->product->is_active) {
                    $rejected[] = [
                        'variant_id' => $variantId,
                        'sku' => $variant->sku ?? '',
                        'variant_name' => $variant->name ?? 'Tonalidade',
                        'requested_quantity' => $qty,
                        'available_stock' => 0,
                        'reason' => 'Tonalidade indisponível no momento.',
                    ];

                    continue;
                }

                /** @var CartItem|null $existing */
                $existing = $cart->items()->where('product_variant_id', $variant->id)->first();
                $currentQty = $existing ? $existing->quantity : 0;
                $available = $variant->availableStock();
                $newQty = $currentQty + $qty;

                if ($available <= 0 || $newQty > $available) {
                    $rejected[] = [
                        'variant_id' => $variant->id,
                        'sku' => $variant->sku,
                        'variant_name' => $variant->name,
                        'requested_quantity' => $qty,
                        'available_stock' => $available,
                        'reason' => $available <= 0
                            ? "Tonalidade {$variant->name} está esgotada."
                            : "Estoque insuficiente para {$variant->name} (disponível: {$available} un.).",
                    ];

                    continue;
                }

                if ($existing) {
                    $existing->update([
                        'quantity' => $newQty,
                        'unit_price_snapshot_cents' => $variant->effectivePriceCents(),
                    ]);
                } else {
                    $cart->items()->create([
                        'product_id' => $variant->product_id,
                        'product_variant_id' => $variant->id,
                        'quantity' => $newQty,
                        'unit_price_snapshot_cents' => $variant->effectivePriceCents(),
                    ]);
                }

                $added[] = [
                    'variant_id' => $variant->id,
                    'sku' => $variant->sku,
                    'variant_name' => $variant->name,
                    'added_quantity' => $qty,
                    'cart_quantity' => $newQty,
                ];
            }
        });

        if ($added === [] && $rejected !== []) {
            throw ValidationException::withMessages([
                'items' => [implode(' ', array_column($rejected, 'reason'))],
            ]);
        }

        if ($added !== []) {
            $this->invalidateShippingQuote($cart);
            AnalyticsEvent::query()->create([
                'session_id' => $cart->token ?: Str::uuid()->toString(),
                'user_id' => $user?->id,
                'event_name' => 'multi_shade_bulk_add',
                'payload' => [
                    'variants_count' => count($added),
                    'units_count' => array_sum(array_column($added, 'added_quantity')),
                ],
            ]);
        }

        return [
            'cart' => $cart->fresh(),
            'added' => $added,
            'rejected' => $rejected,
        ];
    }

    public function updateItemQuantity(Cart $cart, CartItem $item, int $quantity): Cart
    {
        if ($quantity <= 0) {
            $item->delete();
            $this->invalidateShippingQuote($cart);

            return $cart->fresh();
        }

        $item->loadMissing('variant');
        $available = $item->variant?->availableStock() ?? 0;
        if ($quantity > $available) {
            throw ValidationException::withMessages([
                'quantity' => ["Estoque disponível para este item: {$available} un."],
            ]);
        }

        $item->update([
            'quantity' => $quantity,
            'unit_price_snapshot_cents' => $item->variant->effectivePriceCents(),
        ]);
        $this->invalidateShippingQuote($cart);

        return $cart->fresh();
    }

    public function invalidateShippingQuote(Cart $cart): void
    {
        $cart->update([
            'shipping_service_code' => null,
            'shipping_quote_id' => null,
        ]);
    }

    /** @return array<string, mixed> */
    public function buildSummary(Cart $cart, ?User $user = null, ?string $customerEmail = null, ?string $uf = null): array
    {
        $cart->load(['items.product.categories', 'items.product.images', 'items.variant.image', 'shippingQuote']);
        $publicConfig = $this->settings->getPublicConfig();
        $wholesaleModuleEnabled = (bool) ($publicConfig['wholesale_enabled'] ?? false);

        $itemsData = [];
        $subtotalCents = 0;
        $wholesaleDiscountCents = 0;
        $totalWeightGrams = 0;

        // Precompute total quantity per product line for grouped wholesale tiers across shades.
        $productQuantities = [];
        foreach ($cart->items as $item) {
            if ($item->product && $item->variant && $item->product->is_active && $item->variant->is_active) {
                $productQuantities[$item->product_id] = ($productQuantities[$item->product_id] ?? 0) + $item->quantity;
            }
        }

        foreach ($cart->items as $item) {
            $product = $item->product;
            $variant = $item->variant;
            if (! $product || ! $variant || ! $product->is_active || ! $variant->is_active) {
                continue;
            }

            $wholesaleQty = $product->wholesale_group_variants
                ? ($productQuantities[$product->id] ?? $item->quantity)
                : $item->quantity;
            $baseEffective = $variant->effectivePriceCents();
            $unitPrice = $this->resolveUnitPriceCents($product, $variant, $wholesaleQty, $wholesaleModuleEnabled);
            $wholesaleDiscountCents += max(0, $baseEffective - $unitPrice) * $item->quantity;
            $lineSubtotal = $unitPrice * $item->quantity;
            $subtotalCents += $lineSubtotal;

            $weight = $variant->weight_grams ?? $product->weight_grams ?? 200;
            $totalWeightGrams += $weight * $item->quantity;

            $primaryImg = $product->images->firstWhere('is_primary', true) ?? $product->images->first();
            $imagePath = $variant->image ? $variant->image->path : ($primaryImg ? $primaryImg->path : null);

            $itemsData[] = [
                'id' => $item->id,
                'product_id' => $product->id,
                'product_slug' => $product->slug,
                'product_name' => $product->name,
                'variant_id' => $variant->id,
                'variant_name' => $variant->name,
                'sku' => $variant->sku,
                'quantity' => $item->quantity,
                'available_stock' => $variant->availableStock(),
                'in_stock' => $variant->availableStock() >= $item->quantity,
                'unit_price_cents' => $unitPrice,
                'original_price_cents' => $variant->price_cents,
                'line_total_cents' => $lineSubtotal,
                'image_url' => $imagePath,
            ];
        }

        $promoDiscountCents = $this->calculateAutomaticPromotions($cart, $subtotalCents);
        $couponResult = $this->evaluateCoupon($cart, $subtotalCents - $promoDiscountCents, $user, $customerEmail, $uf);

        $shippingCents = 0;
        $selectedShipping = null;
        if ($cart->shippingQuote && $cart->shippingQuote->expires_at->isFuture() && $cart->shippingQuote->cart_id === $cart->id && $cart->shippingQuote->items_fingerprint === app(ShippingQuoteService::class)->cartFingerprint($cart)) {
            /** @var ShippingQuote $quote */
            $quote = $cart->shippingQuote;
            $shippingCents = $couponResult['free_shipping'] ? 0 : (int) $quote->price_cents;
            $selectedShipping = [
                'quote_id' => $quote->id, 'expires_at' => $quote->expires_at->toIso8601String(),
                'cep' => $quote->cep,
                'provider' => $quote->provider,
                'service_code' => $quote->service_code,
                'service_name' => $quote->service_name,
                'carrier' => $quote->carrier,
                'price_cents' => $shippingCents,
                'original_price_cents' => (int) $quote->price_cents,
                'estimated_days' => $quote->estimated_days,
                'is_fallback' => $quote->is_fallback,
            ];
        }

        $totalDiscountCents = min($subtotalCents, $promoDiscountCents + $couponResult['discount_cents']);
        $totalCents = max(0, $subtotalCents - $totalDiscountCents + $shippingCents);
        $freeThreshold = (int) ($publicConfig['free_shipping_threshold_cents'] ?? 29900);

        return [
            'token' => $cart->token,
            'items' => $itemsData,
            'items_count' => array_sum(array_column($itemsData, 'quantity')),
            'subtotal_cents' => $subtotalCents,
            'wholesale_discount_cents' => $wholesaleDiscountCents,
            'promotion_discount_cents' => $promoDiscountCents,
            'coupon_code' => $couponResult['valid'] ? $cart->coupon_code : null,
            'coupon_discount_cents' => $couponResult['discount_cents'],
            'coupon_error' => $couponResult['error'],
            'discount_cents' => $totalDiscountCents,
            'shipping_cep' => $cart->shipping_cep,
            'shipping_cents' => $shippingCents,
            'shipping_quote' => $selectedShipping,
            'total_cents' => $totalCents,
            'total_weight_grams' => $totalWeightGrams,
            'free_shipping_threshold_cents' => $freeThreshold,
            'free_shipping_remaining_cents' => max(0, $freeThreshold - $subtotalCents),
        ];
    }

    private function resolveUnitPriceCents(Product $product, ProductVariant $variant, int $quantity, bool $wholesaleModuleEnabled): int
    {
        $base = $variant->effectivePriceCents();
        if (! $wholesaleModuleEnabled || ! $product->wholesale_enabled || ! is_array($product->wholesale_tiers)) {
            return $base;
        }

        $bestPrice = $base;
        foreach ($product->wholesale_tiers as $tier) {
            $minQty = (int) ($tier['min_qty'] ?? 0);
            $discountPercent = (float) ($tier['discount_percent'] ?? 0);
            if ($minQty > 0 && $quantity >= $minQty && $discountPercent > 0 && $discountPercent <= 80) {
                $candidate = (int) round($base * (1 - $discountPercent / 100));
                $bestPrice = min($bestPrice, max(100, $candidate));
            }
        }

        return $bestPrice;
    }

    private function calculateAutomaticPromotions(Cart $cart, int $subtotalCents): int
    {
        if ($subtotalCents <= 0) {
            return 0;
        }

        $now = now();
        $promotions = Promotion::query()
            ->where('is_active', true)
            ->where(function ($q) use ($now): void {
                $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now);
            })
            ->where(function ($q) use ($now): void {
                $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now);
            })
            ->orderBy('priority')
            ->get();

        $discount = 0;
        foreach ($promotions as $promo) {
            $eligibleAmount = $this->eligibleSubtotalForScope($cart, $promo->scope_type, $promo->scope_ids ?? []);
            $totalQty = $cart->items->sum('quantity');
            if ($eligibleAmount <= 0 || $eligibleAmount < $promo->min_subtotal_cents || $totalQty < $promo->min_qty) {
                continue;
            }
            $amount = $promo->discount_type === 'percent'
                ? (int) round($eligibleAmount * min(90, $promo->value) / 100)
                : min($eligibleAmount, (int) $promo->value);

            $discount += $amount;
            if (! $promo->is_cumulative) {
                break;
            }
        }

        return min($subtotalCents, $discount);
    }

    /** @return array{valid: bool, discount_cents: int, free_shipping: bool, error: string|null} */
    private function evaluateCoupon(Cart $cart, int $remainingSubtotalCents, ?User $user, ?string $customerEmail, ?string $uf): array
    {
        if (! $cart->coupon_code) {
            return ['valid' => false, 'discount_cents' => 0, 'free_shipping' => false, 'error' => null];
        }

        $coupon = Coupon::query()->where('code', strtoupper(trim($cart->coupon_code)))->first();
        if (! $coupon || ! $coupon->is_active) {
            return ['valid' => false, 'discount_cents' => 0, 'free_shipping' => false, 'error' => 'Cupom inválido ou inativo.'];
        }

        $now = now();
        if (($coupon->starts_at && $now->lt($coupon->starts_at)) || ($coupon->ends_at && $now->gt($coupon->ends_at))) {
            return ['valid' => false, 'discount_cents' => 0, 'free_shipping' => false, 'error' => 'Este cupom está fora do período de validade.'];
        }

        if ($coupon->max_uses !== null && $coupon->uses_count >= $coupon->max_uses) {
            return ['valid' => false, 'discount_cents' => 0, 'free_shipping' => false, 'error' => 'Este cupom atingiu o limite de utilizações.'];
        }

        $email = strtolower(trim($customerEmail ?? ($user ? $user->email : '')));
        if ($coupon->first_purchase_only && ($user || $email !== '')) {
            $hasPreviousOrder = Order::query()
                ->whereNotIn('status', ['cancelled', 'payment_failed', 'expired'])
                ->where(function ($q) use ($user, $email): void {
                    if ($user) {
                        $q->where('user_id', $user->id);
                    }
                    if ($email !== '') {
                        $q->orWhere('customer_email', $email);
                    }
                })->exists();
            if ($hasPreviousOrder) {
                return ['valid' => false, 'discount_cents' => 0, 'free_shipping' => false, 'error' => 'Cupom exclusivo para a primeira compra.'];
            }
        }

        if ($coupon->max_uses_per_user > 0 && ($user || $email !== '')) {
            $redemptions = CouponRedemption::query()
                ->where('coupon_id', $coupon->id)
                ->where(function ($q) use ($user, $email): void {
                    if ($user) {
                        $q->where('user_id', $user->id);
                    }
                    if ($email !== '') {
                        $q->orWhere('customer_email', $email);
                    }
                })->count();
            if ($redemptions >= $coupon->max_uses_per_user) {
                return ['valid' => false, 'discount_cents' => 0, 'free_shipping' => false, 'error' => 'Limite de uso por cliente atingido para este cupom.'];
            }
        }

        if ($uf && is_array($coupon->allowed_states) && count($coupon->allowed_states) > 0 && ! in_array(strtoupper($uf), $coupon->allowed_states, true)) {
            return ['valid' => false, 'discount_cents' => 0, 'free_shipping' => false, 'error' => 'Cupom não disponível para este estado.'];
        }

        if ($remainingSubtotalCents < $coupon->min_subtotal_cents) {
            $minFormatted = 'R$ '.number_format($coupon->min_subtotal_cents / 100, 2, ',', '.');

            return ['valid' => false, 'discount_cents' => 0, 'free_shipping' => false, 'error' => "Valor mínimo para este cupom: {$minFormatted}."];
        }

        $eligibleSubtotal = $this->eligibleSubtotalForScope($cart, $coupon->scope_type, $coupon->scope_ids ?? []);
        $eligibleSubtotal = min($remainingSubtotalCents, $eligibleSubtotal);
        if ($eligibleSubtotal <= 0) {
            return ['valid' => false, 'discount_cents' => 0, 'free_shipping' => false, 'error' => 'Cupom não aplicável aos produtos no carrinho.'];
        }

        if ($coupon->type === 'free_shipping') {
            return ['valid' => true, 'discount_cents' => 0, 'free_shipping' => true, 'error' => null];
        }

        $discount = $coupon->type === 'percent'
            ? (int) round($eligibleSubtotal * min(90, $coupon->value) / 100)
            : min($eligibleSubtotal, (int) $coupon->value);

        if ($coupon->max_discount_cents !== null) {
            $discount = min($discount, (int) $coupon->max_discount_cents);
        }

        return ['valid' => true, 'discount_cents' => max(0, $discount), 'free_shipping' => false, 'error' => null];
    }

    /** @param list<int> $scopeIds */
    private function eligibleSubtotalForScope(Cart $cart, string $scopeType, array $scopeIds): int
    {
        $total = 0;
        foreach ($cart->items as $item) {
            $product = $item->product;
            $variant = $item->variant;
            if (! $product || ! $variant || ! $product->is_active || ! $variant->is_active) {
                continue;
            }
            $matches = match ($scopeType) {
                'product' => in_array($product->id, $scopeIds, true),
                'brand' => $product->brand_id !== null && in_array($product->brand_id, $scopeIds, true),
                'category' => $product->categories->pluck('id')->intersect($scopeIds)->isNotEmpty(),
                default => true,
            };
            if ($matches) {
                $total += $variant->effectivePriceCents() * $item->quantity;
            }
        }

        return $total;
    }
}
