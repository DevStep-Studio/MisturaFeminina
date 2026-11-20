<?php

declare(strict_types=1);

namespace App\Domain\Cart\Services;

use App\Models\AnalyticsEvent;
use App\Models\Cart;
use App\Models\ProductVariant;
use App\Models\SharedCart;
use App\Models\User;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class SharedCartService
{
    public function __construct(private readonly CartService $carts) {}

    public function createFromCart(Cart $cart, ?User $user = null, ?string $title = null): SharedCart
    {
        $cart->load('items.product', 'items.variant');
        $snapshot = [];

        foreach ($cart->items as $item) {
            if (! $item->product || ! $item->variant || ! $item->product->is_active || ! $item->variant->is_active) {
                continue;
            }
            $snapshot[] = [
                'product_id' => $item->product_id,
                'variant_id' => $item->product_variant_id,
                'sku' => $item->variant->sku,
                'quantity' => $item->quantity,
            ];
        }

        if ($snapshot === []) {
            throw ValidationException::withMessages([
                'cart' => ['Adicione pelo menos um produto antes de compartilhar o carrinho.'],
            ]);
        }

        $token = Str::random(40);
        $shared = SharedCart::query()->create([
            'token' => $token,
            'token_hash' => hash('sha256', $token),
            'created_by_user_id' => $user?->id,
            'title' => $title ? mb_substr(trim($title), 0, 140) : null,
            'cart_snapshot' => $snapshot,
            'expires_at' => now()->addDays(30),
        ]);

        AnalyticsEvent::query()->create([
            'session_id' => $cart->token ?: Str::uuid()->toString(),
            'user_id' => $user?->id,
            'event_name' => 'shared_cart_created',
            'payload' => [
                'shared_cart_id' => $shared->id,
                'items_count' => count($snapshot),
            ],
        ]);

        return $shared;
    }

    /** @return array<string, mixed> */
    public function resolveSharedCart(string $token, bool $recordView = true): array
    {
        $shared = $this->findValidSharedCart($token);

        if ($recordView) {
            $shared->increment('views_count');
        }

        $hydrated = $this->hydrateSnapshot($shared->cart_snapshot);

        return [
            'token' => $shared->token,
            'title' => $shared->title,
            'expires_at' => $shared->expires_at->toIso8601String(),
            'created_at' => $shared->created_at?->toIso8601String(),
            'items' => $hydrated['items'],
            'available_items_count' => $hydrated['available_items_count'],
            'unavailable_items_count' => $hydrated['unavailable_items_count'],
            'estimated_total_cents' => $hydrated['estimated_total_cents'],
        ];
    }

    /** @return array<string, mixed> */
    public function importToCart(string $token, Cart $recipientCart, ?User $user = null): array
    {
        $shared = $this->findValidSharedCart($token);
        $hydrated = $this->hydrateSnapshot($shared->cart_snapshot);

        $added = [];
        $partial = [];
        $unavailable = [];

        foreach ($hydrated['items'] as $item) {
            if (! $item['in_stock'] || $item['purchasable_quantity'] <= 0) {
                $unavailable[] = $item;

                continue;
            }

            /** @var ProductVariant|null $variant */
            $variant = ProductVariant::query()->with('product')->find($item['variant_id']);
            if (! $variant || ! $variant->is_active || ! $variant->product || ! $variant->product->is_active) {
                $unavailable[] = $item;

                continue;
            }

            $existingQty = (int) ($recipientCart->items()->where('product_variant_id', $variant->id)->value('quantity') ?? 0);
            $available = $variant->availableStock();
            $room = max(0, $available - $existingQty);
            $toAdd = min((int) $item['desired_quantity'], $room);

            if ($toAdd <= 0) {
                $unavailable[] = array_merge($item, [
                    'reason' => "Estoque máximo ({$available} un.) já presente no seu carrinho",
                ]);

                continue;
            }

            $this->carts->addItem($recipientCart, $variant, $toAdd);
            $recipientCart->refresh();

            if ($toAdd < $item['desired_quantity']) {
                $partial[] = array_merge($item, ['added_quantity' => $toAdd]);
            } else {
                $added[] = array_merge($item, ['added_quantity' => $toAdd]);
            }
        }

        $shared->increment('imports_count');

        AnalyticsEvent::query()->create([
            'session_id' => $recipientCart->token ?: Str::uuid()->toString(),
            'user_id' => $user?->id,
            'event_name' => 'shared_cart_imported',
            'payload' => [
                'shared_cart_id' => $shared->id,
                'added_count' => count($added) + count($partial),
            ],
        ]);

        return [
            'cart' => $this->carts->buildSummary($recipientCart->fresh(), $user),
            'added_items' => $added,
            'partial_items' => $partial,
            'unavailable_items' => $unavailable,
        ];
    }

    private function findValidSharedCart(string $token): SharedCart
    {
        $hash = hash('sha256', $token);
        $shared = SharedCart::query()
            ->where('token', $token)
            ->orWhere('token_hash', $hash)
            ->first();

        if (! $shared) {
            abort(404, 'Link de carrinho compartilhado não encontrado.');
        }

        if ($shared->expires_at->isPast()) {
            abort(410, 'Este link de carrinho compartilhado expirou.');
        }

        return $shared;
    }

    /**
     * @param  array<int, array<string, mixed>>  $snapshot
     * @return array<string, mixed>
     */
    private function hydrateSnapshot(array $snapshot): array
    {
        $variantIds = array_values(array_filter(array_map(fn (array $row): int => (int) ($row['variant_id'] ?? 0), $snapshot)));
        $variants = ProductVariant::query()
            ->whereIn('id', $variantIds)
            ->with(['product.brand:id,name,slug', 'product.images', 'image'])
            ->get()
            ->keyBy('id');

        $items = [];
        $availableCount = 0;
        $unavailableCount = 0;
        $estimatedTotalCents = 0;

        foreach ($snapshot as $row) {
            $vid = (int) ($row['variant_id'] ?? 0);
            $desiredQty = max(1, (int) ($row['quantity'] ?? 1));
            /** @var ProductVariant|null $variant */
            $variant = $variants->get($vid);
            $product = $variant?->product;

            if (! $variant || ! $product || ! $product->is_active || ! $variant->is_active) {
                $unavailableCount++;
                $items[] = [
                    'product_id' => (int) ($row['product_id'] ?? 0),
                    'product_name' => $product->name ?? 'Produto indisponível',
                    'product_slug' => $product->slug ?? '',
                    'brand_name' => $product?->brand?->name,
                    'variant_id' => $vid,
                    'variant_name' => $variant->name ?? '',
                    'shade_code' => $variant?->shade_code,
                    'color_hex' => $variant?->color_hex,
                    'sku' => (string) ($row['sku'] ?? $variant->sku ?? ''),
                    'image_url' => null,
                    'unit_price_cents' => 0,
                    'original_price_cents' => 0,
                    'desired_quantity' => $desiredQty,
                    'available_stock' => 0,
                    'purchasable_quantity' => 0,
                    'in_stock' => false,
                    'subtotal_cents' => 0,
                ];

                continue;
            }

            $availableStock = $variant->availableStock();
            $unitPriceCents = $variant->effectivePriceCents();
            $purchasableQty = min($desiredQty, $availableStock);
            $inStock = $purchasableQty > 0;
            $subtotalCents = $unitPriceCents * $purchasableQty;

            if ($inStock) {
                $availableCount++;
                $estimatedTotalCents += $subtotalCents;
            } else {
                $unavailableCount++;
            }

            $primaryImg = $product->images->firstWhere('is_primary', true) ?? $product->images->first();
            $imagePath = $variant->image?->path ?: $primaryImg?->path;

            $items[] = [
                'product_id' => $product->id,
                'product_name' => $product->name,
                'product_slug' => $product->slug,
                'brand_name' => $product->brand?->name,
                'variant_id' => $variant->id,
                'variant_name' => $variant->name,
                'shade_code' => $variant->shade_code,
                'color_hex' => $variant->color_hex,
                'sku' => $variant->sku,
                'image_url' => $imagePath,
                'unit_price_cents' => $unitPriceCents,
                'original_price_cents' => $variant->price_cents,
                'desired_quantity' => $desiredQty,
                'available_stock' => $availableStock,
                'purchasable_quantity' => $purchasableQty,
                'in_stock' => $inStock,
                'subtotal_cents' => $subtotalCents,
            ];
        }

        return [
            'items' => $items,
            'available_items_count' => $availableCount,
            'unavailable_items_count' => $unavailableCount,
            'estimated_total_cents' => $estimatedTotalCents,
        ];
    }
}
