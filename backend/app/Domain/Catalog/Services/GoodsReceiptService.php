<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Domain\Security\Services\AuditLogger;
use App\Domain\Shared\Enums\InventoryMovementType;
use App\Models\GoodsReceipt;
use App\Models\GoodsReceiptItem;
use App\Models\InventoryLot;
use App\Models\ProductVariant;
use App\Models\Supplier;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class GoodsReceiptService
{
    public function __construct(
        private readonly InventoryService $inventory,
        private readonly AuditLogger $audit,
    ) {}

    /** @param array<string, mixed> $data */
    public function saveReceipt(?int $id, array $data, User $actor): GoodsReceipt
    {
        $rawItems = is_array($data['items'] ?? null) ? $data['items'] : [];
        if ($rawItems === []) {
            throw ValidationException::withMessages(['items' => ['Adicione pelo menos um item ao recebimento.']]);
        }

        return DB::transaction(function () use ($id, $data, $actor, $rawItems): GoodsReceipt {
            $receipt = null;
            if ($id !== null) {
                $receipt = GoodsReceipt::query()->lockForUpdate()->findOrFail($id);
                if (in_array($receipt->status, ['completed', 'cancelled'], true)) {
                    throw ValidationException::withMessages([
                        'status' => ['Recebimentos concluídos ou cancelados não podem ser alterados.'],
                    ]);
                }
            }

            $supplierId = ! empty($data['supplier_id']) ? (int) $data['supplier_id'] : null;
            if (! $supplierId && ! empty($data['new_supplier_name'])) {
                $sup = Supplier::query()->create([
                    'name' => trim((string) $data['new_supplier_name']),
                    'is_active' => true,
                ]);
                $supplierId = $sup->id;
            }

            $hasDiscrepancy = false;
            $preparedItems = [];

            foreach ($rawItems as $line) {
                /** @var ProductVariant $variant */
                $variant = ProductVariant::query()->with('product')->findOrFail((int) $line['product_variant_id']);
                $expectedQty = isset($line['expected_qty']) && $line['expected_qty'] !== ''
                    ? max(0, (int) $line['expected_qty'])
                    : null;
                $receivedQty = max(0, (int) $line['received_qty']);
                $acceptedQty = array_key_exists('accepted_qty', $line) && $line['accepted_qty'] !== null
                    ? max(0, min($receivedQty, (int) $line['accepted_qty']))
                    : $receivedQty;
                $rejectedQty = max(0, $receivedQty - $acceptedQty);

                $lineHasDiscrepancy = ($expectedQty !== null && $receivedQty !== $expectedQty) || $rejectedQty > 0;
                $reason = isset($line['discrepancy_reason']) ? (trim((string) $line['discrepancy_reason']) ?: null) : null;
                if ($lineHasDiscrepancy) {
                    $hasDiscrepancy = true;
                    if ($reason === null) {
                        $reason = $rejectedQty > 0
                            ? 'damaged_product'
                            : ($receivedQty < $expectedQty ? 'lower_qty' : 'higher_qty');
                    }
                }

                $preparedItems[] = [
                    'product_id' => $variant->product_id,
                    'product_variant_id' => $variant->id,
                    'sku_snapshot' => $variant->sku,
                    'expected_qty' => $expectedQty,
                    'received_qty' => $receivedQty,
                    'accepted_qty' => $acceptedQty,
                    'rejected_qty' => $rejectedQty,
                    'discrepancy_reason' => $reason,
                    'discrepancy_notes' => isset($line['discrepancy_notes']) ? (trim((string) $line['discrepancy_notes']) ?: null) : null,
                    'unit_cost_cents' => isset($line['unit_cost_cents']) && $line['unit_cost_cents'] !== '' && $line['unit_cost_cents'] !== null
                        ? max(0, (int) $line['unit_cost_cents'])
                        : null,
                    'apply_cost_to_sku' => array_key_exists('apply_cost_to_sku', $line) ? (bool) $line['apply_cost_to_sku'] : true,
                    'lot_code' => isset($line['lot_code']) ? (trim((string) $line['lot_code']) ?: null) : null,
                    'manufactured_at' => ! empty($line['manufactured_at']) ? CarbonImmutable::parse((string) $line['manufactured_at'])->toDateString() : null,
                    'expires_at' => ! empty($line['expires_at']) ? CarbonImmutable::parse((string) $line['expires_at'])->toDateString() : null,
                ];
            }

            $requestedStatus = (string) ($data['status'] ?? ($hasDiscrepancy ? 'discrepancy' : 'checking'));
            if (! in_array($requestedStatus, ['draft', 'checking', 'discrepancy', 'verified'], true)) {
                $requestedStatus = $hasDiscrepancy ? 'discrepancy' : 'checking';
            }

            $fields = [
                'supplier_id' => $supplierId,
                'invoice_number' => isset($data['invoice_number']) ? (trim((string) $data['invoice_number']) ?: null) : null,
                'purchase_reference' => isset($data['purchase_reference']) ? (trim((string) $data['purchase_reference']) ?: null) : null,
                'status' => $requestedStatus,
                'received_at' => ! empty($data['received_at']) ? CarbonImmutable::parse((string) $data['received_at']) : now(),
                'has_discrepancy' => $hasDiscrepancy,
                'notes' => isset($data['notes']) ? (trim((string) $data['notes']) ?: null) : null,
            ];

            if (! $receipt) {
                $receipt = GoodsReceipt::query()->create(array_merge($fields, [
                    'receipt_number' => 'REC-'.now()->format('ymd').'-'.strtoupper(Str::random(5)),
                    'received_by_user_id' => $actor->id,
                ]));
            } else {
                $receipt->update($fields);
                $receipt->items()->delete();
            }

            foreach ($preparedItems as $itemData) {
                $receipt->items()->create($itemData);
            }

            return $receipt->fresh(['supplier', 'receivedBy:id,name', 'confirmedBy:id,name', 'items.product:id,name', 'items.variant:id,name,sku,shade_code,stock_qty,reserved_qty']) ?? $receipt;
        });
    }

    public function confirmReceipt(int $receiptId, User $actor): GoodsReceipt
    {
        $receipt = DB::transaction(function () use ($receiptId, $actor): GoodsReceipt {
            /** @var GoodsReceipt $locked */
            $locked = GoodsReceipt::query()->with(['items.variant', 'supplier'])->lockForUpdate()->findOrFail($receiptId);

            if ($locked->status === 'completed') {
                throw ValidationException::withMessages([
                    'status' => ['Este recebimento já foi confirmado e contabilizado no estoque.'],
                ]);
            }
            if ($locked->status === 'cancelled') {
                throw ValidationException::withMessages([
                    'status' => ['Não é possível confirmar um recebimento cancelado.'],
                ]);
            }

            foreach ($locked->items as $item) {
                /** @var GoodsReceiptItem $item */
                $variant = $item->variant;
                if (! $variant) {
                    continue;
                }

                // Only accepted sellable quantity enters available inventory; rejected/damaged units remain outside sellable stock.
                if ($item->accepted_qty > 0) {
                    if ($item->unit_cost_cents !== null && ($item->apply_cost_to_sku ?? true)) {
                        $prevCost = $variant->cost_cents;
                        if ($prevCost !== $item->unit_cost_cents) {
                            $variant->update(['cost_cents' => $item->unit_cost_cents]);
                            $this->audit->record(
                                'catalog.sku_cost_updated_by_receipt',
                                $actor,
                                'product_variant',
                                $variant->id,
                                ['cost_cents' => $prevCost],
                                ['cost_cents' => $item->unit_cost_cents, 'receipt_number' => $locked->receipt_number],
                            );
                        }
                    }

                    $this->inventory->adjustStock(
                        $variant,
                        $item->accepted_qty,
                        InventoryMovementType::In,
                        $actor,
                        "Recebimento de mercadorias {$locked->receipt_number}".($locked->invoice_number ? " (NF {$locked->invoice_number})" : ''),
                        $locked->receipt_number
                    );

                    if ($item->lot_code !== null || $item->expires_at !== null) {
                        InventoryLot::query()->create([
                            'product_id' => $item->product_id,
                            'product_variant_id' => $item->product_variant_id,
                            'supplier_id' => $locked->supplier_id,
                            'goods_receipt_id' => $locked->id,
                            'lot_code' => $item->lot_code ?? $locked->receipt_number.'-L'.$item->id,
                            'manufactured_at' => $item->manufactured_at,
                            'expires_at' => $item->expires_at,
                            'initial_qty' => $item->accepted_qty,
                            'remaining_qty' => $item->accepted_qty,
                            'received_at' => $locked->received_at,
                        ]);
                    }
                }
            }

            $locked->update([
                'status' => 'completed',
                'confirmed_by_user_id' => $actor->id,
                'confirmed_at' => now(),
            ]);

            return $locked->fresh(['supplier', 'receivedBy:id,name', 'confirmedBy:id,name', 'items.product:id,name', 'items.variant:id,name,sku,shade_code,stock_qty,reserved_qty']) ?? $locked;
        });

        $this->audit->record(
            'inventory.goods_receipt_confirmed',
            $actor,
            'goods_receipt',
            $receipt->id,
            ['status' => 'checking'],
            ['status' => 'completed', 'receipt_number' => $receipt->receipt_number],
        );

        return $receipt;
    }

    /** @return array<string, mixed> */
    public function lotExpirySummary(): array
    {
        $now = now()->startOfDay();
        $lots = InventoryLot::query()
            ->where('remaining_qty', '>', 0)
            ->with(['product:id,name,slug', 'variant:id,name,sku,shade_code', 'supplier:id,name', 'receipt:id,receipt_number'])
            ->orderByRaw('CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END')
            ->orderBy('expires_at')
            ->limit(100)
            ->get();

        $expired = 0;
        $exp30 = 0;
        $exp60 = 0;
        $exp90 = 0;

        $serialized = $lots->map(function (InventoryLot $lot) use ($now, &$expired, &$exp30, &$exp60, &$exp90): array {
            $status = 'ok';
            $daysLeft = null;
            if ($lot->expires_at !== null) {
                $daysLeft = (int) $now->diffInDays($lot->expires_at, false);
                if ($daysLeft < 0) {
                    $expired++;
                    $status = 'expired';
                } elseif ($daysLeft <= 30) {
                    $exp30++;
                    $status = 'expiring_30';
                } elseif ($daysLeft <= 60) {
                    $exp60++;
                    $status = 'expiring_60';
                } elseif ($daysLeft <= 90) {
                    $exp90++;
                    $status = 'expiring_90';
                }
            }

            return [
                'id' => $lot->id,
                'lot_code' => $lot->lot_code,
                'product_name' => $lot->product->name ?? 'Produto',
                'variant_name' => $lot->variant->name ?? '',
                'sku' => $lot->variant->sku ?? '',
                'supplier_name' => $lot->supplier?->name,
                'receipt_number' => $lot->receipt?->receipt_number,
                'remaining_qty' => $lot->remaining_qty,
                'manufactured_at' => $lot->manufactured_at?->format('Y-m-d'),
                'expires_at' => $lot->expires_at?->format('Y-m-d'),
                'days_to_expiry' => $daysLeft,
                'expiry_status' => $status,
                'received_at' => $lot->received_at->toIso8601String(),
            ];
        })->values()->all();

        return [
            'counts' => [
                'expired' => $expired,
                'expiring_30d' => $exp30,
                'expiring_60d' => $exp60,
                'expiring_90d' => $exp90,
            ],
            'lots' => $serialized,
        ];
    }
}
