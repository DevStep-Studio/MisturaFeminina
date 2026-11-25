<?php

declare(strict_types=1);

namespace App\Domain\Orders\Services;

use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Security\Services\AuditLogger;
use App\Domain\Shared\Enums\OrderStatus;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderReturn;
use App\Models\OrderReturnItem;
use App\Models\OrderTimelineEvent;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderCostService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Distributes order-wide discounts (coupons / automatic cart promos) across eligible product lines
     * using largest-remainder integer cent reconciliation so item allocations sum strictly to total discount.
     *
     * @param  list<int>  $lineTotalsCents
     * @return list<int>
     */
    public function allocateOrderDiscounts(array $lineTotalsCents, int $orderDiscountCents): array
    {
        $count = count($lineTotalsCents);
        if ($count === 0) {
            return [];
        }

        $totalEligible = array_sum($lineTotalsCents);
        $targetDiscount = min($totalEligible, max(0, $orderDiscountCents));
        if ($totalEligible <= 0 || $targetDiscount <= 0) {
            return array_fill(0, $count, 0);
        }

        $allocations = [];
        $remainders = [];
        $allocatedSum = 0;

        foreach ($lineTotalsCents as $idx => $lineTotal) {
            if ($lineTotal <= 0) {
                $allocations[$idx] = 0;
                $remainders[$idx] = -1.0;

                continue;
            }
            $exact = ($targetDiscount * $lineTotal) / $totalEligible;
            $floorVal = (int) floor($exact);
            $allocations[$idx] = $floorVal;
            $remainders[$idx] = $exact - $floorVal;
            $allocatedSum += $floorVal;
        }

        $leftover = $targetDiscount - $allocatedSum;
        if ($leftover > 0) {
            $indices = array_keys($remainders);
            usort($indices, static fn (int $a, int $b): int => $remainders[$b] <=> $remainders[$a]);
            foreach ($indices as $idx) {
                if ($leftover <= 0) {
                    break;
                }
                if ($lineTotalsCents[$idx] > $allocations[$idx]) {
                    $allocations[$idx]++;
                    $leftover--;
                }
            }
        }

        return $allocations;
    }

    /**
     * Captures and freezes the historical unit cost of each item when the order is recognized as a sale
     * (payment confirmed). Strictly idempotent: items with `cost_recorded_at` already set are never overwritten.
     */
    public function captureCostSnapshotForOrder(Order $order): void
    {
        DB::transaction(function () use ($order): void {
            /** @var Order|null $lockedOrder */
            $lockedOrder = Order::query()->whereKey($order->id)->lockForUpdate()->first();
            if (! $lockedOrder) {
                return;
            }

            $items = $lockedOrder->items()
                ->with([
                    'variant' => fn ($vq) => $vq->with(['product' => fn ($pq) => $pq->withTrashed()]),
                    'product' => fn ($pq) => $pq->withTrashed(),
                ])
                ->lockForUpdate()
                ->get();

            // Reconcile net revenue if not yet populated (e.g. legacy or direct order construction)
            $needsNetRevenue = $items->contains(fn (OrderItem $it): bool => $it->net_revenue_cents === null);
            $allocations = [];
            if ($needsNetRevenue) {
                $allocations = $this->allocateOrderDiscounts(
                    $items->map(fn (OrderItem $it): int => max(0, (int) $it->total_cents))->values()->all(),
                    (int) $lockedOrder->discount_cents
                );
            }

            $now = now();
            foreach ($items->values() as $idx => $item) {
                $updates = [];

                if ($item->net_revenue_cents === null) {
                    $alloc = $allocations[$idx] ?? 0;
                    $updates['order_discount_allocated_cents'] = $alloc;
                    $updates['net_revenue_cents'] = max(0, (int) $item->total_cents - $alloc);
                }

                if ($item->cost_recorded_at === null) {
                    $variant = $item->variant;
                    $product = $variant?->product ?? $item->product;
                    $costCents = null;
                    $costSource = 'missing';

                    if ($variant && $variant->cost_cents !== null) {
                        $costCents = (int) $variant->cost_cents;
                        $costSource = 'variant_cost';
                    } elseif ($product && $product->cost_cents !== null) {
                        $costCents = (int) $product->cost_cents;
                        $costSource = 'product_cost';
                    }

                    $updates['unit_cost_cents_snapshot'] = $costCents;
                    $updates['cost_source'] = $costSource;
                    $updates['cost_recorded_at'] = $now;
                }

                if ($updates !== []) {
                    $item->update($updates);
                }
            }
        });
    }

    /**
     * Records a partial return, full return, financial refund, or post-payment cancellation
     * with strict idempotency and separation between financial refund and physical restock.
     *
     * @param  array{
     *   idempotency_key?: string|null,
     *   return_type?: string,
     *   restock_items?: bool,
     *   financial_refund_cents?: int|null,
     *   reason: string,
     *   refund_id?: int|null,
     *   order_occurrence_id?: int|null,
     *   occurred_at?: CarbonInterface|null,
     *   items?: list<array{order_item_id: int, quantity: int, restock?: bool|null}>
     * }  $params
     */
    public function processReturnOrRefund(Order $order, array $params, ?User $actor = null): OrderReturn
    {
        $idempotencyKey = isset($params['idempotency_key']) && trim((string) $params['idempotency_key']) !== ''
            ? trim((string) $params['idempotency_key'])
            : null;

        if ($idempotencyKey !== null) {
            /** @var OrderReturn|null $existing */
            $existing = OrderReturn::query()->where('idempotency_key', $idempotencyKey)->with('items')->first();
            if ($existing) {
                return $existing;
            }
        }

        return DB::transaction(function () use ($order, $params, $actor, $idempotencyKey): OrderReturn {
            if ($idempotencyKey !== null) {
                /** @var OrderReturn|null $existingLocked */
                $existingLocked = OrderReturn::query()->where('idempotency_key', $idempotencyKey)->with('items')->lockForUpdate()->first();
                if ($existingLocked) {
                    return $existingLocked;
                }
            }

            /** @var Order $lockedOrder */
            $lockedOrder = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            $orderItems = $lockedOrder->items()->lockForUpdate()->get()->keyBy('id');

            $returnType = (string) ($params['return_type'] ?? 'partial_return');
            $defaultRestock = (bool) ($params['restock_items'] ?? false);
            $reason = trim((string) ($params['reason'] ?? 'Devolução / Estorno'));
            $occurredAt = $params['occurred_at'] ?? now();
            $financialRefundCents = max(0, (int) ($params['financial_refund_cents'] ?? 0));

            $requestedItems = is_array($params['items'] ?? null) ? $params['items'] : [];
            if ($requestedItems === [] && in_array($returnType, ['full_return', 'cancellation'], true)) {
                foreach ($orderItems as $oi) {
                    $avail = max(0, (int) $oi->quantity - (int) $oi->returned_qty);
                    if ($avail > 0) {
                        $requestedItems[] = [
                            'order_item_id' => $oi->id,
                            'quantity' => $avail,
                            'restock' => $defaultRestock,
                        ];
                    }
                }
            }

            $orderReturn = OrderReturn::query()->create([
                'order_id' => $lockedOrder->id,
                'refund_id' => $params['refund_id'] ?? null,
                'order_occurrence_id' => $params['order_occurrence_id'] ?? null,
                'user_id' => $actor?->id,
                'idempotency_key' => $idempotencyKey,
                'return_type' => $returnType,
                'restock_items' => $defaultRestock,
                'financial_refund_cents' => $financialRefundCents,
                'reason' => mb_substr($reason, 0, 255),
                'occurred_at' => $occurredAt,
            ]);

            foreach ($requestedItems as $entry) {
                $itemId = (int) ($entry['order_item_id'] ?? 0);
                $qty = (int) ($entry['quantity'] ?? 0);
                if ($qty <= 0) {
                    continue;
                }

                /** @var OrderItem|null $item */
                $item = $orderItems->get($itemId);
                if (! $item) {
                    throw ValidationException::withMessages(['items' => ["Item #{$itemId} não pertence ao pedido."]]);
                }

                $availableToReturn = max(0, (int) $item->quantity - (int) $item->returned_qty);
                if ($qty > $availableToReturn) {
                    throw ValidationException::withMessages([
                        'items' => ["Quantidade de devolução ({$qty}) excede a quantidade restante ({$availableToReturn}) para {$item->sku_snapshot}."],
                    ]);
                }

                $netTotal = $item->effectiveNetRevenueCents();
                $remainingRev = max(0, $netTotal - (int) $item->returned_revenue_cents);
                if ($qty === $availableToReturn) {
                    $revenueReversed = $remainingRev;
                } else {
                    $revenueReversed = min($remainingRev, (int) round(($netTotal * $qty) / max(1, (int) $item->quantity)));
                }

                $unitCostSnap = $item->unit_cost_cents_snapshot;
                $cogsReversed = $unitCostSnap !== null ? ($qty * $unitCostSnap) : null;
                $shouldRestock = array_key_exists('restock', $entry) && $entry['restock'] !== null
                    ? (bool) $entry['restock']
                    : $defaultRestock;
                $restockedNow = $shouldRestock ? $qty : 0;

                OrderReturnItem::query()->create([
                    'order_return_id' => $orderReturn->id,
                    'order_item_id' => $item->id,
                    'product_variant_id' => $item->product_variant_id,
                    'returned_qty' => $qty,
                    'restocked_qty' => $restockedNow,
                    'unit_cost_cents_snapshot' => $unitCostSnap,
                    'revenue_reversed_cents' => $revenueReversed,
                    'cogs_reversed_cents' => $cogsReversed,
                ]);

                $item->update([
                    'returned_qty' => (int) $item->returned_qty + $qty,
                    'restocked_qty' => (int) $item->restocked_qty + $restockedNow,
                    'returned_revenue_cents' => (int) $item->returned_revenue_cents + $revenueReversed,
                ]);

                if ($shouldRestock && $lockedOrder->paid_at !== null) {
                    $this->inventory->restockReturnedUnits(
                        $lockedOrder,
                        $item->product_variant_id,
                        $qty,
                        $actor,
                        "Devolução {$lockedOrder->order_number}: {$reason}"
                    );
                }
            }

            if ($returnType !== 'cancellation') {
                $freshItems = $lockedOrder->items()->get();
                $allReturned = $freshItems->isNotEmpty() && $freshItems->every(fn (OrderItem $i): bool => (int) $i->returned_qty >= (int) $i->quantity);
                $anyReturned = $freshItems->contains(fn (OrderItem $i): bool => (int) $i->returned_qty > 0);
                if ($allReturned) {
                    $lockedOrder->update(['status' => OrderStatus::Refunded]);
                } elseif ($anyReturned || $financialRefundCents > 0) {
                    $lockedOrder->update(['status' => OrderStatus::PartiallyRefunded]);
                }
            }

            return $orderReturn->fresh(['items']) ?? $orderReturn;
        });
    }

    public function backfillOrderItemCost(OrderItem $item, int $unitCostCents, string $reason, User $actor): OrderItem
    {
        if ($unitCostCents < 0) {
            throw ValidationException::withMessages(['unit_cost_cents' => ['Custo histórico não pode ser negativo.']]);
        }

        return DB::transaction(function () use ($item, $unitCostCents, $reason, $actor): OrderItem {
            /** @var OrderItem $locked */
            $locked = OrderItem::query()->whereKey($item->id)->lockForUpdate()->firstOrFail();
            $oldValues = [
                'unit_cost_cents_snapshot' => $locked->unit_cost_cents_snapshot,
                'cost_source' => $locked->cost_source,
            ];

            $now = now();
            $locked->update([
                'unit_cost_cents_snapshot' => $unitCostCents,
                'cost_source' => 'manual_backfill',
                'cost_recorded_at' => $locked->cost_recorded_at ?? $now,
                'cost_backfilled_at' => $now,
                'cost_backfilled_by' => $actor->id,
            ]);

            // Keep any previously recorded missing-cost return reversals consistent
            OrderReturnItem::query()
                ->where('order_item_id', $locked->id)
                ->whereNull('unit_cost_cents_snapshot')
                ->get()
                ->each(function (OrderReturnItem $ri) use ($unitCostCents): void {
                    $ri->update([
                        'unit_cost_cents_snapshot' => $unitCostCents,
                        'cogs_reversed_cents' => (int) $ri->returned_qty * $unitCostCents,
                    ]);
                });

            $this->audit->record(
                'order_item.cost_backfilled',
                $actor,
                'order_item',
                $locked->id,
                $oldValues,
                [
                    'unit_cost_cents_snapshot' => $unitCostCents,
                    'cost_source' => 'manual_backfill',
                    'reason' => $reason,
                ]
            );

            OrderTimelineEvent::query()->create([
                'order_id' => $locked->order_id,
                'user_id' => $actor->id,
                'category' => 'internal',
                'event_type' => 'order_item_cost_backfilled',
                'title' => "Custo histórico preenchido manualmente ({$locked->sku_snapshot})",
                'description' => sprintf(
                    'Custo unitário definido em R$ %s por %s. Motivo: %s',
                    number_format($unitCostCents / 100, 2, ',', '.'),
                    $actor->name,
                    $reason
                ),
                'origin' => 'staff',
                'actor_name' => $actor->name,
                'occurred_at' => $now,
            ]);

            return $locked->fresh() ?? $locked;
        });
    }
}
