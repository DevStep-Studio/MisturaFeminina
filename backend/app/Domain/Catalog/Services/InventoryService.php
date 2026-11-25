<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Domain\Catalog\Events\VariantRestocked;
use App\Domain\Shared\Enums\InventoryMovementType;
use App\Domain\Shared\Enums\ProductType;
use App\Models\CartItem;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\ProductVariant;
use App\Models\StockReservation;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class InventoryService
{
    /**
     * @param  iterable<int, CartItem>  $cartItems
     */
    public function reserveForOrder(Order $order, iterable $cartItems, int $ttlMinutes = 30): void
    {
        $requirements = $this->flattenVariantRequirements($cartItems);
        if ($requirements === []) {
            throw ValidationException::withMessages(['cart' => ['Seu carrinho está vazio.']]);
        }

        ksort($requirements);
        $expiresAt = now()->addMinutes($ttlMinutes);

        foreach ($requirements as $variantId => $qtyNeeded) {
            /** @var ProductVariant|null $variant */
            $variant = ProductVariant::query()
                ->whereKey($variantId)
                ->lockForUpdate()
                ->first();

            if (! $variant || ! $variant->is_active) {
                throw ValidationException::withMessages([
                    'stock' => ['Um dos produtos selecionados não está mais disponível.'],
                ]);
            }

            if ($variant->availableStock() < $qtyNeeded) {
                throw ValidationException::withMessages([
                    'stock' => ["Estoque insuficiente para {$variant->name} (SKU {$variant->sku}). Disponível: {$variant->availableStock()}."],
                ]);
            }

            $affected = ProductVariant::query()
                ->where('id', $variant->id)
                ->whereRaw('(stock_qty - reserved_qty) >= ?', [$qtyNeeded])
                ->increment('reserved_qty', $qtyNeeded);

            if ($affected === 0) {
                throw ValidationException::withMessages([
                    'stock' => ["Estoque esgotado durante a reserva para {$variant->name} (SKU {$variant->sku})."],
                ]);
            }

            $variant->refresh();

            StockReservation::query()->create([
                'product_variant_id' => $variant->id,
                'order_id' => $order->id,
                'quantity' => $qtyNeeded,
                'status' => 'active',
                'expires_at' => $expiresAt,
            ]);

            InventoryMovement::query()->create([
                'product_variant_id' => $variant->id,
                'user_id' => $order->user_id,
                'order_id' => $order->id,
                'type' => InventoryMovementType::Reserve,
                'qty_delta' => -$qtyNeeded,
                'physical_after' => $variant->stock_qty,
                'reserved_after' => $variant->reserved_qty,
                'reason' => 'Reserva para pagamento do pedido '.$order->order_number,
                'reference' => $order->order_number,
            ]);
        }
    }

    public function confirmDeduction(Order $order): void
    {
        DB::transaction(function () use ($order): void {
            $reservations = StockReservation::query()
                ->where('order_id', $order->id)
                ->where('status', 'active')
                ->orderBy('product_variant_id')
                ->lockForUpdate()
                ->get();

            if ($reservations->isEmpty()) {
                return;
            }

            foreach ($reservations as $reservation) {
                /** @var ProductVariant|null $variant */
                $variant = ProductVariant::query()
                    ->whereKey($reservation->product_variant_id)
                    ->lockForUpdate()
                    ->first();

                if (! $variant) {
                    continue;
                }

                $qty = (int) $reservation->quantity;
                $newPhysical = max(0, $variant->stock_qty - $qty);
                $newReserved = max(0, $variant->reserved_qty - $qty);

                $variant->update([
                    'stock_qty' => $newPhysical,
                    'reserved_qty' => $newReserved,
                ]);

                $variant->product()->increment('sales_count', $qty);
                $reservation->update(['status' => 'consumed']);

                InventoryMovement::query()->create([
                    'product_variant_id' => $variant->id,
                    'user_id' => $order->user_id,
                    'order_id' => $order->id,
                    'type' => InventoryMovementType::Deduct,
                    'qty_delta' => -$qty,
                    'physical_after' => $newPhysical,
                    'reserved_after' => $newReserved,
                    'reason' => 'Baixa definitiva após aprovação do pedido '.$order->order_number,
                    'reference' => $order->order_number,
                ]);
            }
        });
    }

    public function releaseReservation(Order $order, string $reason = 'Liberação de reserva'): void
    {
        DB::transaction(function () use ($order, $reason): void {
            $reservations = StockReservation::query()
                ->where('order_id', $order->id)
                ->where('status', 'active')
                ->orderBy('product_variant_id')
                ->lockForUpdate()
                ->get();

            if ($reservations->isEmpty()) {
                return;
            }

            foreach ($reservations as $reservation) {
                /** @var ProductVariant|null $variant */
                $variant = ProductVariant::query()
                    ->whereKey($reservation->product_variant_id)
                    ->lockForUpdate()
                    ->first();

                if (! $variant) {
                    $reservation->update(['status' => 'released']);

                    continue;
                }

                $qty = (int) $reservation->quantity;
                $newReserved = max(0, $variant->reserved_qty - $qty);
                $variant->update(['reserved_qty' => $newReserved]);
                $reservation->update(['status' => 'released']);

                InventoryMovement::query()->create([
                    'product_variant_id' => $variant->id,
                    'user_id' => $order->user_id,
                    'order_id' => $order->id,
                    'type' => InventoryMovementType::Release,
                    'qty_delta' => $qty,
                    'physical_after' => $variant->stock_qty,
                    'reserved_after' => $newReserved,
                    'reason' => $reason,
                    'reference' => $order->order_number,
                ]);
            }
        });
    }

    public function restockConsumedOrder(Order $order, ?User $actor = null, string $reason = 'Estorno com devolução ao estoque'): void
    {
        DB::transaction(function () use ($order, $actor, $reason): void {
            $consumed = StockReservation::query()
                ->where('order_id', $order->id)
                ->where('status', 'consumed')
                ->lockForUpdate()
                ->get();

            foreach ($consumed as $reservation) {
                /** @var ProductVariant|null $variant */
                $variant = ProductVariant::query()->whereKey($reservation->product_variant_id)->lockForUpdate()->first();
                if (! $variant) {
                    continue;
                }
                $qty = (int) $reservation->quantity;
                $newPhysical = $variant->stock_qty + $qty;
                $variant->update(['stock_qty' => $newPhysical]);
                $reservation->update(['status' => 'refunded']);

                InventoryMovement::query()->create([
                    'product_variant_id' => $variant->id,
                    'user_id' => $actor?->id,
                    'order_id' => $order->id,
                    'type' => InventoryMovementType::Refund,
                    'qty_delta' => $qty,
                    'physical_after' => $newPhysical,
                    'reserved_after' => $variant->reserved_qty,
                    'reason' => $reason,
                    'reference' => $order->order_number,
                ]);
            }
        });
    }

    public function restockReturnedUnits(
        Order $order,
        ?int $variantId,
        int $qty,
        ?User $actor = null,
        string $reason = 'Devolução ao estoque',
    ): void {
        if ($qty <= 0 || ! $variantId) {
            return;
        }

        DB::transaction(function () use ($order, $variantId, $qty, $actor, $reason): void {
            /** @var ProductVariant|null $variant */
            $variant = ProductVariant::query()->whereKey($variantId)->lockForUpdate()->first();
            if (! $variant) {
                return;
            }

            // Reconcile any remaining consumed reservation so a full cancellation/refund later never double-restocks.
            /** @var StockReservation|null $reservation */
            $reservation = StockReservation::query()
                ->where('order_id', $order->id)
                ->where('product_variant_id', $variantId)
                ->where('status', 'consumed')
                ->lockForUpdate()
                ->first();

            if ($reservation) {
                if ((int) $reservation->quantity <= $qty) {
                    $reservation->update(['status' => 'refunded']);
                } else {
                    $reservation->update(['quantity' => (int) $reservation->quantity - $qty]);
                }
            }

            $newPhysical = $variant->stock_qty + $qty;
            $variant->update(['stock_qty' => $newPhysical]);

            InventoryMovement::query()->create([
                'product_variant_id' => $variant->id,
                'user_id' => $actor?->id,
                'order_id' => $order->id,
                'type' => InventoryMovementType::Refund,
                'qty_delta' => $qty,
                'physical_after' => $newPhysical,
                'reserved_after' => $variant->reserved_qty,
                'reason' => $reason,
                'reference' => $order->order_number,
            ]);
        });
    }

    public function adjustStock(
        ProductVariant $variant,
        int $qtyDelta,
        InventoryMovementType $type,
        ?User $actor,
        string $reason,
        ?string $reference = null,
    ): ProductVariant {
        return DB::transaction(function () use ($variant, $qtyDelta, $type, $actor, $reason, $reference): ProductVariant {
            /** @var ProductVariant $locked */
            $locked = ProductVariant::query()->whereKey($variant->id)->lockForUpdate()->firstOrFail();
            $prevAvailable = $locked->availableStock();
            $wasOutOfStock = $prevAvailable <= 0;
            $newPhysical = $locked->stock_qty + $qtyDelta;
            if ($newPhysical < 0) {
                throw ValidationException::withMessages(['stock_qty' => ['O estoque físico não pode ficar negativo.']]);
            }
            if ($newPhysical < $locked->reserved_qty) {
                throw ValidationException::withMessages(['stock_qty' => ['O estoque físico não pode ser menor que a quantidade já reservada em pedidos pendentes.']]);
            }

            $locked->update(['stock_qty' => $newPhysical]);

            InventoryMovement::query()->create([
                'product_variant_id' => $locked->id,
                'user_id' => $actor?->id,
                'type' => $type,
                'qty_delta' => $qtyDelta,
                'physical_after' => $newPhysical,
                'reserved_after' => $locked->reserved_qty,
                'reason' => $reason,
                'reference' => $reference,
            ]);

            $newAvailable = max(0, $newPhysical - $locked->reserved_qty);
            if ($wasOutOfStock && $newAvailable > 0) {
                $event = new VariantRestocked($locked, $prevAvailable, $newAvailable, $reason);
                event($event);
                app(RestockNotificationService::class)->handleVariantRestocked($event);
            }

            return $locked->fresh();
        });
    }

    /**
     * @param  iterable<int, CartItem>  $cartItems
     * @return array<int, int>
     */
    private function flattenVariantRequirements(iterable $cartItems): array
    {
        $requirements = [];
        foreach ($cartItems as $item) {
            $item->loadMissing('product.kitItems');
            $product = $item->product;
            if ($product && $product->product_type === ProductType::Kit && $product->kitItems->isNotEmpty()) {
                foreach ($product->kitItems as $kitItem) {
                    $vid = (int) $kitItem->component_variant_id;
                    $requirements[$vid] = ($requirements[$vid] ?? 0) + ($kitItem->quantity * $item->quantity);
                }
            } else {
                $vid = (int) $item->product_variant_id;
                $requirements[$vid] = ($requirements[$vid] ?? 0) + $item->quantity;
            }
        }

        return $requirements;
    }
}
