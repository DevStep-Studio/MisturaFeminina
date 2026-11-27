<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Domain\Cart\Services\CartService;
use App\Models\Cart;
use App\Models\ProductVariant;
use App\Models\ReplenishmentList;
use App\Models\ReplenishmentListItem;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReplenishmentService
{
    public function __construct(private readonly CartService $carts) {}

    public function ensureDefaultList(User $user): ReplenishmentList
    {
        $default = ReplenishmentList::query()
            ->where('user_id', $user->id)
            ->where('is_default', true)
            ->first();

        if ($default) {
            return $default;
        }

        $first = ReplenishmentList::query()->where('user_id', $user->id)->orderBy('id')->first();
        if ($first) {
            $first->update(['is_default' => true]);

            return $first;
        }

        return ReplenishmentList::query()->create([
            'user_id' => $user->id,
            'name' => 'Minha reposição',
            'is_default' => true,
        ]);
    }

    /** @return list<array<string, mixed>> */
    public function listForUser(User $user): array
    {
        $this->ensureDefaultList($user);

        $lists = ReplenishmentList::query()
            ->where('user_id', $user->id)
            ->with([
                'items.product.brand:id,name,slug',
                'items.product.images',
                'items.variant.image',
                'items.variant.attributeValues.attribute',
            ])
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->get();

        return $lists->map(fn (ReplenishmentList $list): array => $this->serializeList($list))->values()->all();
    }

    /** @return array<string, mixed> */
    public function createList(User $user, string $name, bool $isDefault = false): array
    {
        $this->ensureDefaultList($user);

        return DB::transaction(function () use ($user, $name, $isDefault): array {
            if ($isDefault) {
                ReplenishmentList::query()->where('user_id', $user->id)->update(['is_default' => false]);
            }

            $list = ReplenishmentList::query()->create([
                'user_id' => $user->id,
                'name' => trim($name),
                'is_default' => $isDefault,
            ]);

            return $this->serializeList($list->load(['items.product.brand', 'items.product.images', 'items.variant.image']));
        });
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public function updateList(User $user, int $listId, array $data): array
    {
        $list = ReplenishmentList::query()->where('user_id', $user->id)->findOrFail($listId);

        DB::transaction(function () use ($user, $list, $data): void {
            if (! empty($data['is_default'])) {
                ReplenishmentList::query()->where('user_id', $user->id)->where('id', '!=', $list->id)->update(['is_default' => false]);
            }

            $list->update([
                'name' => isset($data['name']) ? trim((string) $data['name']) : $list->name,
                'is_default' => array_key_exists('is_default', $data) ? (bool) $data['is_default'] : $list->is_default,
            ]);
        });

        return $this->serializeList($list->fresh(['items.product.brand', 'items.product.images', 'items.variant.image']));
    }

    public function deleteList(User $user, int $listId): void
    {
        $list = ReplenishmentList::query()->where('user_id', $user->id)->findOrFail($listId);
        $count = ReplenishmentList::query()->where('user_id', $user->id)->count();
        if ($count <= 1) {
            throw ValidationException::withMessages([
                'list' => ['Você precisa manter pelo menos uma lista de reposição.'],
            ]);
        }

        $wasDefault = $list->is_default;
        $list->delete();

        if ($wasDefault) {
            $next = ReplenishmentList::query()->where('user_id', $user->id)->orderBy('id')->first();
            $next?->update(['is_default' => true]);
        }
    }

    /** @return array<string, mixed> */
    public function upsertItem(User $user, int $variantId, int $quantity = 1, ?int $listId = null, bool $increment = true): array
    {
        $list = $listId
            ? ReplenishmentList::query()->where('user_id', $user->id)->findOrFail($listId)
            : $this->ensureDefaultList($user);

        $variant = ProductVariant::query()->with('product')->findOrFail($variantId);
        if (! $variant->product) {
            throw ValidationException::withMessages(['variant_id' => ['Produto não encontrado.']]);
        }

        $qty = max(1, min(999, $quantity));
        /** @var ReplenishmentListItem|null $existing */
        $existing = $list->items()->where('product_variant_id', $variant->id)->first();
        if ($existing) {
            $existing->update([
                'desired_quantity' => $increment ? min(999, $existing->desired_quantity + $qty) : $qty,
            ]);
        } else {
            $list->items()->create([
                'product_id' => $variant->product_id,
                'product_variant_id' => $variant->id,
                'desired_quantity' => $qty,
            ]);
        }

        return $this->serializeList($list->fresh(['items.product.brand', 'items.product.images', 'items.variant.image', 'items.variant.attributeValues.attribute']));
    }

    /** @return array<string, mixed> */
    public function updateItemQuantity(User $user, int $listId, int $itemId, int $quantity): array
    {
        $list = ReplenishmentList::query()->where('user_id', $user->id)->findOrFail($listId);
        $item = $list->items()->findOrFail($itemId);

        if ($quantity <= 0) {
            $item->delete();
        } else {
            $item->update(['desired_quantity' => min(999, $quantity)]);
        }

        return $this->serializeList($list->fresh(['items.product.brand', 'items.product.images', 'items.variant.image', 'items.variant.attributeValues.attribute']));
    }

    /** @return array<string, mixed> */
    public function removeItem(User $user, int $listId, int $itemId): array
    {
        $list = ReplenishmentList::query()->where('user_id', $user->id)->findOrFail($listId);
        $item = $list->items()->findOrFail($itemId);
        $item->delete();

        return $this->serializeList($list->fresh(['items.product.brand', 'items.product.images', 'items.variant.image', 'items.variant.attributeValues.attribute']));
    }

    /**
     * @param  list<array{variant_id: int, quantity: int}>  $items
     * @return array<string, mixed>
     */
    public function syncGuestItems(User $user, array $items): array
    {
        $list = $this->ensureDefaultList($user);

        foreach ($items as $entry) {
            $variantId = (int) $entry['variant_id'];
            $qty = max(1, min(999, (int) $entry['quantity']));
            $variant = ProductVariant::query()->find($variantId);
            if (! $variant) {
                continue;
            }
            $existing = $list->items()->where('product_variant_id', $variant->id)->first();
            if ($existing) {
                $existing->update(['desired_quantity' => max($existing->desired_quantity, $qty)]);
            } else {
                $list->items()->create([
                    'product_id' => $variant->product_id,
                    'product_variant_id' => $variant->id,
                    'desired_quantity' => $qty,
                ]);
            }
        }

        return $this->serializeList($list->fresh(['items.product.brand', 'items.product.images', 'items.variant.image', 'items.variant.attributeValues.attribute']));
    }

    /** @return array<string, mixed> */
    public function createFromCart(User $user, Cart $cart, ?string $name = null): array
    {
        $cart->load('items.variant');
        if ($cart->items->isEmpty()) {
            throw ValidationException::withMessages(['cart' => ['Seu carrinho está vazio.']]);
        }

        $list = ReplenishmentList::query()->create([
            'user_id' => $user->id,
            'name' => trim((string) ($name ?: 'Reposição '.now()->format('d/m/Y'))),
            'is_default' => ! ReplenishmentList::query()->where('user_id', $user->id)->where('is_default', true)->exists(),
        ]);

        foreach ($cart->items as $item) {
            if (! $item->variant) {
                continue;
            }
            $list->items()->create([
                'product_id' => $item->product_id,
                'product_variant_id' => $item->product_variant_id,
                'desired_quantity' => max(1, $item->quantity),
            ]);
        }

        return $this->serializeList($list->fresh(['items.product.brand', 'items.product.images', 'items.variant.image']));
    }

    /** @return array<string, mixed> */
    public function addAvailableToCart(User $user, int $listId, Cart $cart): array
    {
        $list = ReplenishmentList::query()
            ->where('user_id', $user->id)
            ->with(['items.product', 'items.variant'])
            ->findOrFail($listId);

        if ($list->items->isEmpty()) {
            throw ValidationException::withMessages(['list' => ['Esta lista de reposição está vazia.']]);
        }

        $added = [];
        $partial = [];
        $unavailable = [];

        foreach ($list->items as $item) {
            $product = $item->product;
            $variant = $item->variant;

            if (! $product || ! $variant || ! $product->is_active || ! $variant->is_active) {
                $unavailable[] = [
                    'item_id' => $item->id,
                    'product_name' => $product->name ?? 'Produto indisponível',
                    'variant_name' => $variant->name ?? '',
                    'sku' => $variant->sku ?? '',
                    'desired_quantity' => $item->desired_quantity,
                    'reason' => 'Temporariamente indisponível',
                ];

                continue;
            }

            $available = $variant->availableStock();
            if ($available <= 0) {
                $unavailable[] = [
                    'item_id' => $item->id,
                    'product_id' => $product->id,
                    'product_slug' => $product->slug,
                    'variant_id' => $variant->id,
                    'product_name' => $product->name,
                    'variant_name' => $variant->name,
                    'sku' => $variant->sku,
                    'desired_quantity' => $item->desired_quantity,
                    'reason' => 'Temporariamente indisponível',
                ];

                continue;
            }

            $existingInCart = (int) ($cart->items()->where('product_variant_id', $variant->id)->value('quantity') ?? 0);
            $roomInStock = max(0, $available - $existingInCart);
            $toAdd = min($item->desired_quantity, $roomInStock);

            if ($toAdd <= 0) {
                $unavailable[] = [
                    'item_id' => $item->id,
                    'product_id' => $product->id,
                    'product_slug' => $product->slug,
                    'variant_id' => $variant->id,
                    'product_name' => $product->name,
                    'variant_name' => $variant->name,
                    'sku' => $variant->sku,
                    'desired_quantity' => $item->desired_quantity,
                    'reason' => "Limite de estoque disponível ({$available} un.) já está no carrinho",
                ];

                continue;
            }

            $this->carts->addItem($cart, $variant, $toAdd);
            $cart->refresh();

            $entry = [
                'item_id' => $item->id,
                'product_id' => $product->id,
                'variant_id' => $variant->id,
                'product_name' => $product->name,
                'variant_name' => $variant->name,
                'sku' => $variant->sku,
                'desired_quantity' => $item->desired_quantity,
                'added_quantity' => $toAdd,
                'available_stock' => $available,
            ];

            if ($toAdd < $item->desired_quantity) {
                $missing = $item->desired_quantity - $toAdd;
                $entry['missing_quantity'] = $missing;
                $entry['message'] = "Adicionadas {$toAdd} un. ({$missing} un. indisponível(is) no momento).";
                $partial[] = $entry;
            } else {
                $added[] = $entry;
            }
        }

        $summary = $this->carts->buildSummary($cart->fresh(), $user);

        return [
            'cart' => $summary,
            'added_items' => $added,
            'partial_items' => $partial,
            'unavailable_items' => $unavailable,
            'added_units_total' => array_sum(array_column($added, 'added_quantity')) + array_sum(array_column($partial, 'added_quantity')),
        ];
    }

    /** @return array<string, mixed> */
    public function adminInsights(): array
    {
        $topItems = DB::table('replenishment_list_items')
            ->join('products', 'replenishment_list_items.product_id', '=', 'products.id')
            ->join('product_variants', 'replenishment_list_items.product_variant_id', '=', 'product_variants.id')
            ->leftJoin('brands', 'products.brand_id', '=', 'brands.id')
            ->selectRaw('
                products.id as product_id,
                products.name as product_name,
                products.slug as product_slug,
                brands.name as brand_name,
                product_variants.id as variant_id,
                product_variants.name as variant_name,
                product_variants.shade_code as shade_code,
                product_variants.sku as sku,
                (product_variants.stock_qty - product_variants.reserved_qty) as available_stock,
                COUNT(DISTINCT replenishment_list_items.replenishment_list_id) as lists_count,
                SUM(replenishment_list_items.desired_quantity) as total_desired_quantity
            ')
            ->groupBy(
                'products.id',
                'products.name',
                'products.slug',
                'brands.name',
                'product_variants.id',
                'product_variants.name',
                'product_variants.shade_code',
                'product_variants.sku',
                'product_variants.stock_qty',
                'product_variants.reserved_qty'
            )
            ->orderByDesc('lists_count')
            ->orderByDesc('total_desired_quantity')
            ->limit(25)
            ->get()
            ->map(fn (object $r): array => [
                'product_id' => (int) $r->product_id,
                'product_name' => (string) $r->product_name,
                'product_slug' => (string) $r->product_slug,
                'brand_name' => $r->brand_name ? (string) $r->brand_name : null,
                'variant_id' => (int) $r->variant_id,
                'variant_name' => (string) $r->variant_name,
                'shade_code' => $r->shade_code ? (string) $r->shade_code : null,
                'sku' => (string) $r->sku,
                'available_stock' => max(0, (int) $r->available_stock),
                'lists_count' => (int) $r->lists_count,
                'total_desired_quantity' => (int) $r->total_desired_quantity,
            ])
            ->values()
            ->all();

        $outOfStockRecurring = array_values(array_filter(
            $topItems,
            fn (array $item): bool => $item['available_stock'] <= 0
        ));

        return [
            'lists_total' => ReplenishmentList::query()->count(),
            'items_total' => ReplenishmentListItem::query()->count(),
            'desired_units_total' => (int) ReplenishmentListItem::query()->sum('desired_quantity'),
            'top_variants' => $topItems,
            'out_of_stock_recurring' => $outOfStockRecurring,
        ];
    }

    /** @return array<string, mixed> */
    public function serializeList(ReplenishmentList $list): array
    {
        $itemsData = [];
        $estimatedTotalCents = 0;
        $availableItemsCount = 0;
        $unavailableItemsCount = 0;

        foreach ($list->items as $item) {
            $product = $item->product;
            $variant = $item->variant;
            if (! $product || ! $variant) {
                continue;
            }

            $isActive = $product->is_active && $variant->is_active;
            $availableStock = $isActive ? $variant->availableStock() : 0;
            $unitPriceCents = $variant->effectivePriceCents();
            $originalPriceCents = $variant->price_cents;

            $purchasableQty = $isActive ? min($item->desired_quantity, $availableStock) : 0;
            $missingQty = max(0, $item->desired_quantity - $purchasableQty);

            $status = 'unavailable';
            if ($purchasableQty >= $item->desired_quantity && $purchasableQty > 0) {
                $status = 'available';
                $availableItemsCount++;
            } elseif ($purchasableQty > 0) {
                $status = 'partial';
                $availableItemsCount++;
            } else {
                $unavailableItemsCount++;
            }

            $lineSubtotalCents = $unitPriceCents * $purchasableQty;
            $desiredSubtotalCents = $unitPriceCents * $item->desired_quantity;
            $estimatedTotalCents += $lineSubtotalCents;

            $primaryImg = $product->images->firstWhere('is_primary', true) ?? $product->images->first();
            $imagePath = $variant->image?->path ?: $primaryImg?->path;

            $itemsData[] = [
                'id' => $item->id,
                'product_id' => $product->id,
                'product_name' => $product->name,
                'product_slug' => $product->slug,
                'brand_name' => $product->brand?->name,
                'variant_id' => $variant->id,
                'variant_name' => $variant->name,
                'shade_code' => $variant->shade_code,
                'color_family' => $variant->color_family,
                'color_hex' => $variant->color_hex,
                'sku' => $variant->sku,
                'image_url' => $imagePath,
                'unit_price_cents' => $unitPriceCents,
                'original_price_cents' => $originalPriceCents,
                'desired_quantity' => $item->desired_quantity,
                'available_stock' => $availableStock,
                'in_stock' => $isActive && $availableStock > 0,
                'stock_status' => $status === 'available' ? 'ok' : ($status === 'partial' ? 'partial' : 'out_of_stock'),
                'purchasable_quantity' => $purchasableQty,
                'missing_quantity' => $missingQty,
                'availability_status' => $status,
                'subtotal_cents' => $lineSubtotalCents,
                'desired_subtotal_cents' => $desiredSubtotalCents,
            ];
        }

        return [
            'id' => $list->id,
            'name' => $list->name,
            'is_default' => $list->is_default,
            'items_count' => count($itemsData),
            'available_items_count' => $availableItemsCount,
            'unavailable_items_count' => $unavailableItemsCount,
            'estimated_total_cents' => $estimatedTotalCents,
            'items' => $itemsData,
            'updated_at' => $list->updated_at?->toIso8601String(),
        ];
    }
}
