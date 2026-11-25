<?php

declare(strict_types=1);

namespace App\Domain\Catalog\Services;

use App\Domain\Security\Services\AuditLogger;
use App\Models\AssistedOrderItem;
use App\Models\BulkEditBatch;
use App\Models\BulkEditBatchItem;
use App\Models\GoodsReceiptItem;
use App\Models\InventoryMovement;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\StockReservation;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CatalogLifecycleService
{
    public function __construct(
        private readonly CatalogBulkRuleService $bulkRules,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * Checks whether a product has historical orders, stock movements, receipts, or reservations
     * that prohibit permanent hard deletion so order & stock history stays preserved.
     *
     * @return array<string, mixed>
     */
    public function inspectLinks(Product $product): array
    {
        $variantIds = $product->variants()->pluck('id')->all();

        $ordersCount = OrderItem::query()
            ->where(function ($q) use ($product, $variantIds): void {
                $q->where('product_id', $product->id);
                if ($variantIds !== []) {
                    $q->orWhereIn('product_variant_id', $variantIds);
                }
            })
            ->distinct('order_id')
            ->count('order_id');

        $movementsCount = $variantIds !== []
            ? InventoryMovement::query()->whereIn('product_variant_id', $variantIds)->count()
            : 0;

        $receiptsCount = GoodsReceiptItem::query()->where('product_id', $product->id)->count();
        $assistedCount = AssistedOrderItem::query()->where('product_id', $product->id)->count();
        $reservationsCount = $variantIds !== []
            ? StockReservation::query()->whereIn('product_variant_id', $variantIds)->where('status', 'active')->count()
            : 0;

        $reasons = [];
        if ($ordersCount > 0) {
            $reasons[] = "{$ordersCount} pedido(s)";
        }
        if ($movementsCount > 0) {
            $reasons[] = "{$movementsCount} movimentação(ões) de estoque";
        }
        if ($receiptsCount > 0) {
            $reasons[] = "{$receiptsCount} recebimento(s) de mercadoria";
        }
        if ($assistedCount > 0) {
            $reasons[] = "{$assistedCount} pedido(s) assistido(s)";
        }
        if ($reservationsCount > 0) {
            $reasons[] = "{$reservationsCount} reserva(s) ativa(s)";
        }

        $canDelete = $reasons === [];

        return [
            'can_delete' => $canDelete,
            'can_archive' => ! $product->trashed(),
            'can_restore' => $product->trashed(),
            'orders_count' => $ordersCount,
            'movements_count' => $movementsCount,
            'receipts_count' => $receiptsCount,
            'assisted_count' => $assistedCount,
            'reservations_count' => $reservationsCount,
            'impediment_reason' => $canDelete
                ? null
                : 'Vinculado a '.implode(', ', $reasons).'. Use Arquivar para preservar o histórico.',
        ];
    }

    /**
     * Generates confirmation preview showing quantity, scope, sample names/SKUs,
     * explicit effect on variations, and real server link impediments.
     *
     * @param  array<string, mixed>  $selection
     * @return array<string, mixed>
     */
    public function previewLifecycle(array $selection, string $action): array
    {
        $products = $this->bulkRules->resolveTargetProducts($selection, true);
        if ($products->isEmpty()) {
            throw ValidationException::withMessages(['selection' => ['Nenhum produto selecionado para a operação.']]);
        }

        $totalVariants = 0;
        $deletableCount = 0;
        $blockedCount = 0;
        $items = [];

        foreach ($products as $product) {
            $varCount = $product->variants->count();
            $totalVariants += $varCount;
            $links = $this->inspectLinks($product);

            if ($links['can_delete']) {
                $deletableCount++;
            } else {
                $blockedCount++;
            }

            $items[] = [
                'product_id' => $product->id,
                'name' => $product->name,
                'sku' => $product->sku,
                'is_active' => $product->is_active,
                'is_archived' => $product->trashed(),
                'variants_count' => $varCount,
                'links' => $links,
            ];
        }

        $sample = array_slice(array_map(fn (array $it): array => [
            'id' => $it['product_id'],
            'name' => $it['name'],
            'sku' => $it['sku'],
            'variants_count' => $it['variants_count'],
        ], $items), 0, 8);

        $scopeLabel = ! empty($selection['select_all_matching'])
            ? "Todos os {$products->count()} resultados filtrados"
            : "{$products->count()} produto(s) selecionado(s)";

        return [
            'action' => $action,
            'scope_label' => $scopeLabel,
            'total_products' => $products->count(),
            'total_variants_affected' => $totalVariants,
            'has_multi_variant_products' => collect($items)->contains(fn (array $it): bool => $it['variants_count'] > 1),
            'deletable_count' => $deletableCount,
            'blocked_count' => $blockedCount,
            'sample' => $sample,
            'items' => $items,
        ];
    }

    /**
     * Executes archive, restore, or conditional permanent delete with historical preservation and idempotency.
     *
     * @param  array<string, mixed>  $selection
     * @return array<string, mixed>
     */
    public function commitLifecycle(
        array $selection,
        string $action,
        User $actor,
        string $idempotencyKey,
        bool $archiveBlocked = false,
    ): array {
        if (! $actor->hasPermission('catalog.write')) {
            throw ValidationException::withMessages(['permissions' => ['Você não possui permissão para arquivar ou excluir produtos.']]);
        }

        $existingBatch = BulkEditBatch::query()
            ->where('idempotency_key', $idempotencyKey)
            ->with(['items', 'user:id,name'])
            ->first();

        if ($existingBatch) {
            return [
                'batch' => $existingBatch,
                'idempotent_replay' => true,
                'counts' => [
                    'completed' => $existingBatch->updated_count,
                    'skipped' => $existingBatch->skipped_count,
                    'pending' => $existingBatch->pending_count,
                ],
                'blocked_items' => [],
            ];
        }

        $preview = $this->previewLifecycle($selection, $action);

        $completedCount = 0;
        $skippedCount = 0;
        $blockedItems = [];
        $batchLogs = [];

        $batch = DB::transaction(function () use (
            $preview,
            $action,
            $actor,
            $idempotencyKey,
            $archiveBlocked,
            &$completedCount,
            &$skippedCount,
            &$blockedItems,
            &$batchLogs,
        ): BulkEditBatch {
            $batch = BulkEditBatch::query()->create([
                'batch_code' => 'LIFE-'.now()->format('ymd').'-'.strtoupper(Str::random(5)),
                'idempotency_key' => $idempotencyKey,
                'user_id' => $actor->id,
                'source' => 'bulk_lifecycle',
                'operation_type' => $action,
                'status' => 'completed',
                'total_rows' => (int) $preview['total_products'],
                'created_count' => 0,
                'updated_count' => 0,
                'skipped_count' => 0,
                'pending_count' => 0,
                'failed_count' => 0,
                'summary' => [
                    'action' => $action,
                    'total_products' => $preview['total_products'],
                    'total_variants_affected' => $preview['total_variants_affected'],
                ],
            ]);

            foreach ($preview['items'] as $entry) {
                $product = Product::withTrashed()->lockForUpdate()->find((int) $entry['product_id']);
                if (! $product) {
                    $skippedCount++;

                    continue;
                }

                if ($action === 'archive') {
                    $product->update(['is_active' => false]);
                    $product->variants()->update(['is_active' => false]);
                    if (! $product->trashed()) {
                        $product->delete();
                    }
                    $completedCount++;
                    $batchLogs[] = [
                        'product_id' => $product->id,
                        'product_variant_id' => null,
                        'sku' => $product->sku,
                        'action' => 'archived',
                        'old_values' => ['is_active' => true],
                        'new_values' => ['is_active' => false, 'archived' => true],
                        'error_message' => null,
                    ];
                } elseif ($action === 'restore') {
                    if ($product->trashed()) {
                        $product->restore();
                    }
                    $product->update(['is_active' => true]);
                    $product->variants()->update(['is_active' => true]);
                    $completedCount++;
                    $batchLogs[] = [
                        'product_id' => $product->id,
                        'product_variant_id' => null,
                        'sku' => $product->sku,
                        'action' => 'restored',
                        'old_values' => ['archived' => true],
                        'new_values' => ['is_active' => true, 'archived' => false],
                        'error_message' => null,
                    ];
                } elseif ($action === 'delete') {
                    $links = $this->inspectLinks($product);
                    if (! $links['can_delete']) {
                        if ($archiveBlocked) {
                            $product->update(['is_active' => false]);
                            $product->variants()->update(['is_active' => false]);
                            if (! $product->trashed()) {
                                $product->delete();
                            }
                            $completedCount++;
                            $batchLogs[] = [
                                'product_id' => $product->id,
                                'product_variant_id' => null,
                                'sku' => $product->sku,
                                'action' => 'archived',
                                'old_values' => ['reason' => $links['impediment_reason']],
                                'new_values' => ['archived' => true],
                                'error_message' => null,
                            ];
                        } else {
                            $skippedCount++;
                            $blockedItems[] = [
                                'product_id' => $product->id,
                                'name' => $product->name,
                                'sku' => $product->sku,
                                'reason' => $links['impediment_reason'],
                            ];
                            $batchLogs[] = [
                                'product_id' => $product->id,
                                'product_variant_id' => null,
                                'sku' => $product->sku,
                                'action' => 'skipped',
                                'old_values' => null,
                                'new_values' => null,
                                'error_message' => $links['impediment_reason'],
                            ];
                        }
                    } else {
                        // Safe permanent delete of unlinked product
                        $skuSnap = $product->sku;
                        $nameSnap = $product->name;
                        $product->categories()->detach();
                        $product->attributeValues()->detach();
                        $product->wholesaleGroupItems()->delete();
                        $product->wholesaleRuleProducts()->delete();
                        $product->variants()->delete();
                        $product->images()->delete();
                        $product->forceDelete();

                        $completedCount++;
                        $batchLogs[] = [
                            'product_id' => null,
                            'product_variant_id' => null,
                            'sku' => $skuSnap,
                            'action' => 'deleted',
                            'old_values' => ['name' => $nameSnap, 'sku' => $skuSnap],
                            'new_values' => null,
                            'error_message' => null,
                        ];
                    }
                }
            }

            foreach ($batchLogs as $log) {
                BulkEditBatchItem::query()->create(array_merge($log, [
                    'bulk_edit_batch_id' => $batch->id,
                ]));
            }

            $batch->update([
                'status' => $skippedCount > 0 && $completedCount > 0 ? 'partial' : ($completedCount === 0 && $skippedCount > 0 ? 'blocked' : 'completed'),
                'updated_count' => $completedCount,
                'skipped_count' => $skippedCount,
                'pending_count' => count($blockedItems),
                'failed_count' => count($blockedItems),
            ]);

            return $batch;
        });

        $this->bulkRules->flushStorefrontCaches();
        $this->audit->record(
            "catalog.bulk_{$action}",
            $actor,
            'bulk_edit_batch',
            $batch->id,
            null,
            [
                'action' => $action,
                'completed' => $completedCount,
                'skipped' => $skippedCount,
                'blocked' => count($blockedItems),
            ]
        );

        return [
            'batch' => $batch->fresh(['items', 'user:id,name']),
            'idempotent_replay' => false,
            'counts' => [
                'completed' => $completedCount,
                'skipped' => $skippedCount,
                'pending' => count($blockedItems),
            ],
            'blocked_items' => $blockedItems,
        ];
    }
}
