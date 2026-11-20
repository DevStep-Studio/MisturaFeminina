<?php

declare(strict_types=1);

namespace App\Domain\Admin\Services;

use App\Domain\Shared\Enums\OrderStatus;
use App\Models\GoodsReceipt;
use App\Models\InventoryLot;
use App\Models\InventoryMovement;
use App\Models\OperationalTask;
use App\Models\Order;
use App\Models\OrderOccurrence;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\RestockRequest;
use App\Models\User;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class TodayWorkService
{
    /** @return array<string, mixed> */
    public function summary(User $user, array $taskFilters = []): array
    {
        $permissions = $user->permissionSlugs();
        $canOrders = in_array('orders.view', $permissions, true);
        $canCatalog = in_array('catalog.view', $permissions, true);

        $shipTodayCount = $canOrders ? $this->shipTodayOrdersQuery()->count() : 0;
        $orderIssuesCount = $canOrders ? $this->issueOrdersQuery()->count() : 0;
        $productsReviewCount = $canCatalog ? $this->reviewProductsQuery()->count() : 0;
        $outOfStockVariantsCount = $canCatalog ? $this->outOfStockVariantsQuery()->count() : 0;

        $this->syncOperationalTasks();

        $tasksQuery = OperationalTask::query()
            ->with(['assignedTo:id,name,email', 'createdBy:id,name'])
            ->whereIn('required_permission', $permissions);

        $scope = (string) ($taskFilters['scope'] ?? 'all');
        if ($scope === 'mine') {
            $tasksQuery->where('assigned_to_user_id', $user->id)->whereIn('status', ['pending', 'in_progress']);
        } elseif ($scope === 'unassigned') {
            $tasksQuery->whereNull('assigned_to_user_id')->whereIn('status', ['pending', 'in_progress']);
        } elseif ($scope === 'overdue') {
            $tasksQuery->whereIn('status', ['pending', 'in_progress'])->whereNotNull('due_at')->where('due_at', '<', now());
        } elseif ($scope === 'completed') {
            $tasksQuery->where('status', 'completed');
        } else {
            $tasksQuery->whereIn('status', ['pending', 'in_progress']);
        }

        if (! empty($taskFilters['priority'])) {
            $tasksQuery->where('priority', (string) $taskFilters['priority']);
        }
        if (! empty($taskFilters['task_type'])) {
            $tasksQuery->where('task_type', (string) $taskFilters['task_type']);
        }

        $tasks = $tasksQuery
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END")
            ->orderByRaw('CASE WHEN due_at IS NULL THEN 1 ELSE 0 END')
            ->orderBy('due_at')
            ->orderByDesc('id')
            ->limit(40)
            ->get()
            ->map(fn (OperationalTask $t): array => $this->serializeTask($t))
            ->values()
            ->all();

        $outOfStockItems = $canCatalog ? $this->listOutOfStockVariants(20) : [];

        return [
            'cards' => [
                'ship_today_count' => $shipTodayCount,
                'order_issues_count' => $orderIssuesCount,
                'products_review_count' => $productsReviewCount,
                'out_of_stock_variants_count' => $outOfStockVariantsCount,
            ],
            'tasks' => $tasks,
            'out_of_stock_variants' => $outOfStockItems,
            'generated_at' => now()->toIso8601String(),
        ];
    }

    /** @return Builder<Order> */
    public function shipTodayOrdersQuery(): Builder
    {
        return Order::query()
            ->whereIn('status', [OrderStatus::Paid->value, OrderStatus::Preparing->value])
            ->where('has_issue', false)
            ->whereDoesntHave('occurrences', fn ($q) => $q->whereNotIn('status', ['resolved', 'closed']))
            ->where(function ($q): void {
                $q->whereDoesntHave('shipment')
                    ->orWhereHas('shipment', fn ($sq) => $sq->whereNull('shipped_at'));
            });
    }

    /** @return Builder<Order> */
    public function issueOrdersQuery(): Builder
    {
        return Order::query()
            ->whereNotIn('status', [OrderStatus::Cancelled->value, OrderStatus::Refunded->value])
            ->where(function ($q): void {
                $q->where('status', OrderStatus::PaymentFailed->value)
                    ->orWhere('has_issue', true)
                    ->orWhereHas('occurrences', fn ($oq) => $oq->whereNotIn('status', ['resolved', 'closed']))
                    ->orWhereHas('shipment', fn ($sq) => $sq->where('label_status', 'cancelled'));
            });
    }

    /** @return Builder<Product> */
    public function reviewProductsQuery(): Builder
    {
        return Product::query()
            ->where('is_active', true)
            ->where(function ($q): void {
                $q->whereNull('sku')
                    ->orWhere('sku', '')
                    ->orWhere('price_cents', '<=', 0)
                    ->orWhere(function ($pq): void {
                        $pq->whereNotNull('promo_price_cents')
                            ->whereColumn('promo_price_cents', '>=', 'price_cents');
                    })
                    ->orWhereDoesntHave('images')
                    ->orWhereDoesntHave('variants', fn ($vq) => $vq->where('is_active', true));
            });
    }

    /** @return Builder<ProductVariant> */
    public function outOfStockVariantsQuery(): Builder
    {
        return ProductVariant::query()
            ->where('is_active', true)
            ->whereHas('product', fn ($q) => $q->where('is_active', true))
            ->whereRaw('(stock_qty - reserved_qty) <= 0');
    }

    /** @return list<array<string, mixed>> */
    public function listOutOfStockVariants(int $limit = 30): array
    {
        $variants = $this->outOfStockVariantsQuery()
            ->with(['product:id,name,slug,sku', 'product.brand:id,name'])
            ->withCount(['restockRequests as pending_restock_count' => fn ($q) => $q->where('status', 'pending')])
            ->orderByDesc('pending_restock_count')
            ->orderBy('id')
            ->limit($limit)
            ->get();

        $variantIds = $variants->pluck('id')->all();
        $lastMovements = $variantIds !== []
            ? InventoryMovement::query()
                ->whereIn('product_variant_id', $variantIds)
                ->latest('id')
                ->get()
                ->unique('product_variant_id')
                ->keyBy('product_variant_id')
            : collect();

        return $variants->map(function (ProductVariant $v) use ($lastMovements): array {
            /** @var InventoryMovement|null $lastMov */
            $lastMov = $lastMovements->get($v->id);
            $prod = $v->product;

            return [
                'id' => $v->id,
                'product_id' => $v->product_id,
                'product_name' => $prod->name ?? 'Produto',
                'product_slug' => $prod->slug ?? '',
                'brand_name' => $prod?->brand?->name,
                'variant_name' => $v->name,
                'shade_code' => $v->shade_code,
                'sku' => $v->sku,
                'stock_qty' => $v->stock_qty,
                'reserved_qty' => $v->reserved_qty,
                'available_stock' => $v->availableStock(),
                'pending_restock_count' => (int) ($v->getAttribute('pending_restock_count') ?? 0),
                'last_movement_at' => $lastMov?->created_at?->toIso8601String(),
                'last_movement_reason' => $lastMov?->reason,
            ];
        })->values()->all();
    }

    /** @return list<string> */
    public function resolveReviewIssuesForProduct(Product $product): array
    {
        $issues = [];
        if (trim($product->sku) === '') {
            $issues[] = 'SKU ausente';
        }
        if ($product->price_cents <= 0) {
            $issues[] = 'Preço inválido';
        }
        if ($product->promo_price_cents !== null && $product->promo_price_cents >= $product->price_cents) {
            $issues[] = 'Preço promocional >= preço normal';
        }
        if ($product->images->isEmpty()) {
            $issues[] = 'Sem imagem principal';
        }
        if ($product->variants->where('is_active', true)->isEmpty()) {
            $issues[] = 'Sem variação ativa';
        }

        return $issues;
    }

    public function syncOperationalTasks(): void
    {
        $nowSp = CarbonImmutable::now('America/Sao_Paulo');
        $cutoffHour = 14;
        $activeKeys = [];

        DB::transaction(function () use ($nowSp, $cutoffHour, &$activeKeys): void {
            // 1. Ship today orders
            $shipOrders = $this->shipTodayOrdersQuery()->with('shipment')->orderBy('created_at')->limit(15)->get();
            foreach ($shipOrders as $order) {
                $key = "ship_order_{$order->id}";
                $activeKeys[] = $key;
                $deadline = $order->shipping_deadline_at
                    ? CarbonImmutable::parse($order->shipping_deadline_at)->timezone('America/Sao_Paulo')
                    : $this->computeShippingDeadline($order->paid_at ?? $order->created_at ?? $nowSp, $cutoffHour);
                $priority = $nowSp->greaterThan($deadline)
                    ? 'urgent'
                    : ($deadline->isSameDay($nowSp) ? 'high' : 'normal');

                $this->upsertSyncedTask($key, [
                    'title' => "Pedido {$order->order_number} pronto para postagem",
                    'description' => "Cliente {$order->customer_name} aguardando separação/postagem.",
                    'task_type' => 'shipping',
                    'priority' => $priority,
                    'entity_type' => 'order',
                    'entity_id' => $order->id,
                    'action_url' => "/admin/pedidos?filter=ship_today&order={$order->id}",
                    'required_permission' => 'orders.view',
                    'due_at' => $deadline,
                ]);
            }

            // 2. Open occurrences & order issues
            $openOccurrences = OrderOccurrence::query()
                ->whereNotIn('status', ['resolved', 'closed'])
                ->with('order:id,order_number,customer_name')
                ->latest('id')
                ->limit(15)
                ->get();
            foreach ($openOccurrences as $occ) {
                $key = "occurrence_{$occ->id}";
                $activeKeys[] = $key;
                $orderNum = $occ->order->order_number ?? "#{$occ->order_id}";
                $this->upsertSyncedTask($key, [
                    'title' => "Resolver ocorrência {$occ->occurrence_number} ({$orderNum})",
                    'description' => Str::limit($occ->description, 140),
                    'task_type' => 'occurrence',
                    'priority' => in_array($occ->priority, ['urgent', 'high', 'normal', 'low'], true) ? $occ->priority : 'high',
                    'entity_type' => 'order_occurrence',
                    'entity_id' => $occ->id,
                    'action_url' => "/admin/pedidos?filter=issues&order={$occ->order_id}",
                    'required_permission' => 'orders.view',
                    'assigned_to_user_id' => $occ->assigned_to_user_id,
                    'due_at' => $occ->due_at,
                ]);
            }

            // 3. Discrepancy goods receipts
            $discrepancyReceipts = GoodsReceipt::query()
                ->where('status', 'discrepancy')
                ->with('supplier:id,name')
                ->latest('id')
                ->limit(10)
                ->get();
            foreach ($discrepancyReceipts as $rec) {
                $key = "receipt_discrepancy_{$rec->id}";
                $activeKeys[] = $key;
                $this->upsertSyncedTask($key, [
                    'title' => "Conferir divergência no recebimento {$rec->receipt_number}",
                    'description' => 'Fornecedor: '.($rec->supplier->name ?? 'N/I'),
                    'task_type' => 'receipt_discrepancy',
                    'priority' => 'high',
                    'entity_type' => 'goods_receipt',
                    'entity_id' => $rec->id,
                    'action_url' => '/admin/produtos?tab=recebimentos',
                    'required_permission' => 'inventory.manage',
                ]);
            }

            // 4. Demanded out-of-stock SKUs
            $demandedSkus = RestockRequest::query()
                ->where('status', 'pending')
                ->whereNotNull('product_variant_id')
                ->selectRaw('product_variant_id, COUNT(*) as waiting')
                ->groupBy('product_variant_id')
                ->orderByDesc('waiting')
                ->limit(10)
                ->get();
            if ($demandedSkus->isNotEmpty()) {
                $variantMap = ProductVariant::query()
                    ->whereIn('id', $demandedSkus->pluck('product_variant_id')->all())
                    ->with('product:id,name')
                    ->get()
                    ->keyBy('id');
                foreach ($demandedSkus as $row) {
                    /** @var ProductVariant|null $v */
                    $v = $variantMap->get((int) $row->product_variant_id);
                    if (! $v || $v->availableStock() > 0) {
                        continue;
                    }
                    $key = "restock_demand_{$v->id}";
                    $activeKeys[] = $key;
                    $waitingCount = (int) $row->getAttribute('waiting');
                    $this->upsertSyncedTask($key, [
                        'title' => "Repor {$v->product?->name} — {$v->name} ({$waitingCount} esperando)",
                        'description' => "SKU {$v->sku} esgotado com demanda ativa de clientes.",
                        'task_type' => 'stock_replenishment',
                        'priority' => $waitingCount >= 5 ? 'high' : 'normal',
                        'entity_type' => 'product_variant',
                        'entity_id' => $v->id,
                        'action_url' => '/admin/produtos?tab=recebimentos&sku='.urlencode($v->sku),
                        'required_permission' => 'inventory.manage',
                    ]);
                }
            }

            // 5. Expiring inventory lots within 30 days
            $expiringLots = InventoryLot::query()
                ->where('remaining_qty', '>', 0)
                ->whereNotNull('expires_at')
                ->where('expires_at', '<=', now()->addDays(30))
                ->with(['product:id,name', 'variant:id,name,sku'])
                ->limit(10)
                ->get();
            foreach ($expiringLots as $lot) {
                $key = "lot_expiring_{$lot->id}";
                $activeKeys[] = $key;
                $isExpired = $lot->expires_at && $lot->expires_at->isPast();
                $this->upsertSyncedTask($key, [
                    'title' => ($isExpired ? 'Lote vencido: ' : 'Lote próximo do vencimento: ').$lot->lot_code,
                    'description' => ($lot->product->name ?? '').' ('.($lot->variant->sku ?? '').')',
                    'task_type' => 'lot_expiry',
                    'priority' => $isExpired ? 'urgent' : 'normal',
                    'entity_type' => 'inventory_lot',
                    'entity_id' => $lot->id,
                    'action_url' => '/admin/produtos?tab=recebimentos&lots=expiring',
                    'required_permission' => 'catalog.view',
                    'due_at' => $lot->expires_at,
                ]);
            }

            // Auto-complete previously synced tasks whose underlying condition cleared
            $staleSynced = OperationalTask::query()
                ->whereNotNull('task_key')
                ->whereIn('status', ['pending', 'in_progress'])
                ->when($activeKeys !== [], fn ($q) => $q->whereNotIn('task_key', $activeKeys))
                ->get();

            foreach ($staleSynced as $task) {
                $task->update([
                    'status' => 'completed',
                    'completed_at' => now(),
                ]);
            }
        });
    }

    /** @param array<string, mixed> $data */
    public function createManualTask(array $data, User $actor): OperationalTask
    {
        $task = OperationalTask::query()->create([
            'task_key' => null,
            'title' => trim((string) $data['title']),
            'description' => isset($data['description']) ? trim((string) $data['description']) ?: null : null,
            'task_type' => (string) ($data['task_type'] ?? 'manual'),
            'priority' => (string) ($data['priority'] ?? 'normal'),
            'status' => 'pending',
            'action_url' => isset($data['action_url']) ? trim((string) $data['action_url']) ?: null : null,
            'required_permission' => (string) ($data['required_permission'] ?? 'dashboard.view'),
            'assigned_to_user_id' => isset($data['assigned_to_user_id']) ? (int) $data['assigned_to_user_id'] : null,
            'created_by_user_id' => $actor->id,
            'due_at' => ! empty($data['due_at']) ? CarbonImmutable::parse((string) $data['due_at']) : null,
        ]);

        return $task->fresh(['assignedTo:id,name,email', 'createdBy:id,name']) ?? $task;
    }

    /** @param array<string, mixed> $data */
    public function updateTask(OperationalTask $task, array $data): OperationalTask
    {
        $updates = [];
        if (array_key_exists('status', $data)) {
            $status = (string) $data['status'];
            $updates['status'] = $status;
            $updates['completed_at'] = $status === 'completed' ? now() : null;
        }
        if (array_key_exists('priority', $data)) {
            $updates['priority'] = (string) $data['priority'];
        }
        if (array_key_exists('assigned_to_user_id', $data)) {
            $updates['assigned_to_user_id'] = $data['assigned_to_user_id'] ? (int) $data['assigned_to_user_id'] : null;
        }
        if (array_key_exists('due_at', $data)) {
            $updates['due_at'] = $data['due_at'] ? CarbonImmutable::parse((string) $data['due_at']) : null;
        }

        if ($updates !== []) {
            $task->update($updates);
        }

        return $task->fresh(['assignedTo:id,name,email', 'createdBy:id,name']) ?? $task;
    }

    /** @param array<string, mixed> $attrs */
    private function upsertSyncedTask(string $taskKey, array $attrs): void
    {
        $existing = OperationalTask::query()->where('task_key', $taskKey)->first();
        if ($existing) {
            $updateFields = [
                'title' => $attrs['title'],
                'description' => $attrs['description'] ?? null,
                'priority' => $attrs['priority'],
                'action_url' => $attrs['action_url'] ?? null,
                'due_at' => $attrs['due_at'] ?? null,
            ];
            if ($existing->status === 'completed') {
                $updateFields['status'] = 'pending';
                $updateFields['completed_at'] = null;
            }
            if (array_key_exists('assigned_to_user_id', $attrs) && $existing->assigned_to_user_id === null) {
                $updateFields['assigned_to_user_id'] = $attrs['assigned_to_user_id'];
            }
            $existing->update($updateFields);

            return;
        }

        OperationalTask::query()->create(array_merge([
            'task_key' => $taskKey,
            'status' => 'pending',
        ], $attrs));
    }

    private function computeShippingDeadline(CarbonInterface $reference, int $cutoffHour): CarbonImmutable
    {
        $dt = CarbonImmutable::parse($reference)->timezone('America/Sao_Paulo');
        if ($dt->hour >= $cutoffHour || $dt->isWeekend()) {
            $dt = $dt->nextWeekday();
        }

        return $dt->setTime(17, 0);
    }

    /** @return array<string, mixed> */
    private function serializeTask(OperationalTask $t): array
    {
        return [
            'id' => $t->id,
            'title' => $t->title,
            'description' => $t->description,
            'task_type' => $t->task_type,
            'priority' => $t->priority,
            'status' => $t->status,
            'entity_type' => $t->entity_type,
            'entity_id' => $t->entity_id,
            'action_url' => $t->action_url,
            'required_permission' => $t->required_permission,
            'assigned_to' => $t->assignedTo ? [
                'id' => $t->assignedTo->id,
                'name' => $t->assignedTo->name,
            ] : null,
            'due_at' => $t->due_at?->toIso8601String(),
            'is_overdue' => $t->due_at !== null && $t->status !== 'completed' && $t->due_at->isPast(),
            'completed_at' => $t->completed_at?->toIso8601String(),
            'created_at' => $t->created_at?->toIso8601String(),
        ];
    }
}
