<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Admin\Services\IntelligentReportsService;
use App\Domain\Admin\Services\TodayWorkService;
use App\Domain\Cart\Services\CartService;
use App\Domain\Catalog\Services\BulkVariantEditService;
use App\Domain\Catalog\Services\GoodsReceiptService;
use App\Domain\Orders\Services\AssistedOrderService;
use App\Domain\Orders\Services\OrderAfterSalesService;
use App\Domain\Security\Services\AuditLogger;
use App\Http\Controllers\Controller;
use App\Models\AssistedOrder;
use App\Models\AssistedOrderEvent;
use App\Models\BulkEditBatch;
use App\Models\GoodsReceipt;
use App\Models\OperationalTask;
use App\Models\Order;
use App\Models\OrderOccurrence;
use App\Models\OrderTimelineEvent;
use App\Models\ProductVariant;
use App\Models\SearchSynonym;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminOperationsController extends Controller
{
    public function __construct(
        private readonly TodayWorkService $todayWork,
        private readonly AssistedOrderService $assistedOrders,
        private readonly BulkVariantEditService $bulkEdit,
        private readonly GoodsReceiptService $receipts,
        private readonly OrderAfterSalesService $afterSales,
        private readonly IntelligentReportsService $reports,
        private readonly CartService $carts,
        private readonly AuditLogger $audit,
    ) {}

    // -------------------------------------------------------------------------
    // Modulo 01: Trabalho de Hoje & Tarefas Operacionais
    // -------------------------------------------------------------------------

    public function todayWork(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json([
            'data' => $this->todayWork->summary($user, [
                'scope' => $request->query('scope', 'all'),
                'priority' => $request->query('priority'),
                'task_type' => $request->query('task_type'),
            ]),
        ]);
    }

    public function storeTask(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'min:3', 'max:200'],
            'description' => ['nullable', 'string', 'max:1000'],
            'task_type' => ['nullable', 'string', 'max:50'],
            'priority' => ['nullable', Rule::in(['urgent', 'high', 'normal', 'low'])],
            'action_url' => ['nullable', 'string', 'max:255'],
            'required_permission' => ['nullable', 'string', 'max:60'],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'due_at' => ['nullable', 'date'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $task = $this->todayWork->createManualTask($validated, $actor);

        return response()->json(['data' => $task], 201);
    }

    public function updateTask(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['sometimes', Rule::in(['pending', 'in_progress', 'completed', 'cancelled'])],
            'priority' => ['sometimes', Rule::in(['urgent', 'high', 'normal', 'low'])],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'due_at' => ['nullable', 'date'],
        ]);

        $task = OperationalTask::query()->findOrFail($id);
        $updated = $this->todayWork->updateTask($task, $validated);

        return response()->json(['data' => $updated]);
    }

    public function teamMembers(): JsonResponse
    {
        $staff = User::query()
            ->where('is_active', true)
            ->whereHas('roles', fn ($q) => $q->where('slug', '!=', 'customer'))
            ->with('roles:id,name,slug')
            ->orderBy('name')
            ->get(['id', 'name', 'email']);

        return response()->json(['data' => $staff]);
    }

    // -------------------------------------------------------------------------
    // Modulo 02: Pedidos Assistidos (Admin + Checkout Publico)
    // -------------------------------------------------------------------------

    public function listAssistedOrders(Request $request): JsonResponse
    {
        $query = AssistedOrder::query()
            ->with(['items.product.images', 'items.variant', 'createdBy:id,name', 'customerUser:id,name,email', 'convertedOrder:id,order_number,status,total_cents', 'events.user:id,name'])
            ->latest('id');

        if ($request->filled('status')) {
            $query->where('status', (string) $request->query('status'));
        }
        if ($request->filled('search')) {
            $like = '%'.trim((string) $request->query('search')).'%';
            $query->where(function ($q) use ($like): void {
                $q->where('order_code', 'like', $like)
                    ->orWhere('customer_name', 'like', $like)
                    ->orWhere('customer_email', 'like', $like)
                    ->orWhere('customer_phone', 'like', $like);
            });
        }

        $items = $query->limit(50)->get()->map(fn (AssistedOrder $a): array => $this->assistedOrders->serialize($a))->values();

        return response()->json(['data' => $items]);
    }

    public function showAssistedOrder(int $id): JsonResponse
    {
        $assisted = AssistedOrder::query()
            ->with(['items.product.images', 'items.variant', 'createdBy:id,name', 'customerUser:id,name,email', 'convertedOrder:id,order_number,status,total_cents', 'events.user:id,name'])
            ->findOrFail($id);

        return response()->json(['data' => $this->assistedOrders->serialize($assisted)]);
    }

    public function catalogSearchAssisted(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->assistedOrders->searchCatalog((string) $request->query('q', '')),
        ]);
    }

    public function customerSearchAssisted(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->assistedOrders->searchCustomers((string) $request->query('q', '')),
        ]);
    }

    public function storeAssistedOrder(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'customer_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'customer_name' => ['nullable', 'string', 'max:150'],
            'customer_email' => ['nullable', 'email', 'max:190'],
            'customer_phone' => ['nullable', 'string', 'max:40'],
            'coupon_code' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:999'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $assisted = $this->assistedOrders->saveDraft(null, $validated, $actor);

        return response()->json(['data' => $this->assistedOrders->serialize($assisted)], 201);
    }

    public function updateAssistedOrder(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'customer_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'customer_name' => ['nullable', 'string', 'max:150'],
            'customer_email' => ['nullable', 'email', 'max:190'],
            'customer_phone' => ['nullable', 'string', 'max:40'],
            'coupon_code' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:999'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $assisted = $this->assistedOrders->saveDraft($id, $validated, $actor);

        return response()->json(['data' => $this->assistedOrders->serialize($assisted)]);
    }

    public function generateAssistedOrderLink(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'expires_in_hours' => ['nullable', 'integer', 'min:1', 'max:720'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $assisted = AssistedOrder::query()->findOrFail($id);
        $result = $this->assistedOrders->generateLink($assisted, $actor, (int) ($validated['expires_in_hours'] ?? 72));

        return response()->json(['data' => $result]);
    }

    public function cancelAssistedOrder(Request $request, int $id): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $assisted = AssistedOrder::query()->findOrFail($id);
        if ($assisted->status === 'converted') {
            return response()->json(['message' => 'Pedido já convertido em compra final não pode ser cancelado aqui.'], 422);
        }
        $assisted->update(['status' => 'cancelled']);
        AssistedOrderEvent::query()->create([
            'assisted_order_id' => $assisted->id,
            'user_id' => $actor->id,
            'event_type' => 'cancelled',
            'description' => 'Pedido assistido cancelado por '.$actor->name,
        ]);

        return response()->json(['data' => $this->assistedOrders->serialize($assisted->fresh(['items.product.images', 'items.variant', 'events.user:id,name']) ?? $assisted)]);
    }

    public function resolvePublicAssistedOrder(string $token): JsonResponse
    {
        $assisted = $this->assistedOrders->findActiveByToken($token);

        return response()->json(['data' => $this->assistedOrders->serialize($assisted)]);
    }

    public function loadAssistedOrderIntoCart(Request $request, string $token): JsonResponse
    {
        $cart = $this->carts->resolveCart($request, true);
        abort_unless($cart !== null, 500, 'Falha ao inicializar carrinho.');
        $payload = $this->assistedOrders->loadIntoCart($token, $cart, $request->user());

        return response()->json(['data' => $payload])
            ->withHeaders(['X-Cart-Token' => $payload['cart']['token']]);
    }

    // -------------------------------------------------------------------------
    // Modulo 03: Edicao em Massa & Colagem Excel
    // -------------------------------------------------------------------------

    public function listBulkVariants(Request $request): JsonResponse
    {
        $query = ProductVariant::query()
            ->with(['product:id,name,sku,slug,is_active', 'product.brand:id,name'])
            ->whereHas('product', fn ($pq) => $pq->where('is_active', true));

        if ($request->filled('product_id')) {
            $query->where('product_id', (int) $request->query('product_id'));
        }
        if ($request->filled('search')) {
            $like = '%'.trim((string) $request->query('search')).'%';
            $query->where(function ($q) use ($like): void {
                $q->where('sku', 'like', $like)
                    ->orWhere('name', 'like', $like)
                    ->orWhere('shade_code', 'like', $like)
                    ->orWhereHas('product', fn ($pq) => $pq->where('name', 'like', $like));
            });
        }

        $variants = $query->orderBy('product_id')->orderBy('sort_order')->orderBy('id')->limit(200)->get()
            ->map(fn (ProductVariant $v): array => [
                'variant_id' => $v->id,
                'product_id' => $v->product_id,
                'product_name' => $v->product->name ?? '',
                'product_sku' => $v->product->sku ?? '',
                'name' => $v->name,
                'shade_code' => $v->shade_code,
                'color_family' => $v->color_family,
                'color_hex' => $v->color_hex,
                'sku' => $v->sku,
                'gtin' => $v->gtin,
                'price_cents' => $v->price_cents,
                'promo_price_cents' => $v->promo_price_cents,
                'stock_qty' => $v->stock_qty,
                'reserved_qty' => $v->reserved_qty,
                'sort_order' => $v->sort_order,
                'is_active' => $v->is_active,
            ])->values();

        return response()->json(['data' => $variants]);
    }

    public function parseBulkVariants(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'raw_text' => ['required', 'string', 'max:200000'],
            'default_product_id' => ['nullable', 'integer', 'exists:products,id'],
        ]);

        $rows = $this->bulkEdit->parseTabularText(
            $validated['raw_text'],
            isset($validated['default_product_id']) ? (int) $validated['default_product_id'] : null
        );
        $preview = $this->bulkEdit->preview(
            $rows,
            isset($validated['default_product_id']) ? (int) $validated['default_product_id'] : null
        );

        return response()->json(['data' => $preview]);
    }

    public function previewBulkVariants(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'rows' => ['required', 'array', 'min:1', 'max:500'],
            'default_product_id' => ['nullable', 'integer', 'exists:products,id'],
        ]);

        $preview = $this->bulkEdit->preview(
            $validated['rows'],
            isset($validated['default_product_id']) ? (int) $validated['default_product_id'] : null
        );

        return response()->json(['data' => $preview]);
    }

    public function commitBulkVariants(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'rows' => ['required', 'array', 'min:1', 'max:500'],
            'idempotency_key' => ['nullable', 'string', 'max:100'],
            'source' => ['nullable', Rule::in(['grid', 'paste', 'csv'])],
            'default_product_id' => ['nullable', 'integer', 'exists:products,id'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $idempotencyKey = trim((string) ($validated['idempotency_key'] ?? $request->header('X-Idempotency-Key') ?? Str::uuid()->toString()));
        $result = $this->bulkEdit->commit(
            $validated['rows'],
            $actor,
            $idempotencyKey,
            (string) ($validated['source'] ?? 'grid'),
            isset($validated['default_product_id']) ? (int) $validated['default_product_id'] : null
        );

        return response()->json(['data' => $result], 201);
    }

    public function bulkEditBatches(): JsonResponse
    {
        $batches = BulkEditBatch::query()
            ->with(['user:id,name', 'items'])
            ->latest('id')
            ->limit(30)
            ->get();

        return response()->json(['data' => $batches]);
    }

    // -------------------------------------------------------------------------
    // Modulo 04: Fornecedores, Recebimento de Mercadorias & Lotes
    // -------------------------------------------------------------------------

    public function listSuppliers(): JsonResponse
    {
        return response()->json([
            'data' => Supplier::query()->where('is_active', true)->orderBy('name')->get(),
        ]);
    }

    public function storeSupplier(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'min:2', 'max:160'],
            'document' => ['nullable', 'string', 'max:40'],
            'contact_name' => ['nullable', 'string', 'max:120'],
            'email' => ['nullable', 'email', 'max:190'],
            'phone' => ['nullable', 'string', 'max:40'],
            'notes' => ['nullable', 'string', 'max:500'],
        ]);

        $supplier = Supplier::query()->create(array_merge($validated, ['is_active' => true]));

        return response()->json(['data' => $supplier], 201);
    }

    public function listGoodsReceipts(Request $request): JsonResponse
    {
        $query = GoodsReceipt::query()
            ->with(['supplier:id,name', 'receivedBy:id,name', 'confirmedBy:id,name', 'items.product:id,name', 'items.variant:id,name,sku,shade_code'])
            ->latest('id');

        if ($request->filled('status')) {
            $query->where('status', (string) $request->query('status'));
        }
        if ($request->boolean('discrepancy_only')) {
            $query->where('has_discrepancy', true);
        }

        return response()->json(['data' => $query->limit(50)->get()]);
    }

    public function showGoodsReceipt(int $id): JsonResponse
    {
        $receipt = GoodsReceipt::query()
            ->with(['supplier', 'receivedBy:id,name', 'confirmedBy:id,name', 'items.product:id,name', 'items.variant:id,name,sku,shade_code,stock_qty,reserved_qty'])
            ->findOrFail($id);

        return response()->json(['data' => $receipt]);
    }

    public function storeGoodsReceipt(Request $request): JsonResponse
    {
        $validated = $this->validateGoodsReceipt($request);
        /** @var User $actor */
        $actor = $request->user();
        $receipt = $this->receipts->saveReceipt(null, $validated, $actor);

        return response()->json(['data' => $receipt], 201);
    }

    public function updateGoodsReceipt(Request $request, int $id): JsonResponse
    {
        $validated = $this->validateGoodsReceipt($request);
        /** @var User $actor */
        $actor = $request->user();
        $receipt = $this->receipts->saveReceipt($id, $validated, $actor);

        return response()->json(['data' => $receipt]);
    }

    public function confirmGoodsReceipt(Request $request, int $id): JsonResponse
    {
        /** @var User $actor */
        $actor = $request->user();
        $receipt = $this->receipts->confirmReceipt($id, $actor);

        return response()->json(['data' => $receipt]);
    }

    public function lotExpirySummary(): JsonResponse
    {
        return response()->json(['data' => $this->receipts->lotExpirySummary()]);
    }

    // -------------------------------------------------------------------------
    // Modulo 05: Pos-Venda, Ocorrencias & Notas Internas em Pedidos
    // -------------------------------------------------------------------------

    public function flagOrderIssue(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'has_issue' => ['required', 'boolean'],
            'issue_reason' => ['nullable', 'string', 'max:255'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $order = Order::query()->findOrFail($id);
        $order->update([
            'has_issue' => (bool) $validated['has_issue'],
            'issue_reason' => (bool) $validated['has_issue'] ? ($validated['issue_reason'] ?? 'Sinalizado manualmente') : null,
        ]);

        OrderTimelineEvent::query()->create([
            'order_id' => $order->id,
            'user_id' => $actor->id,
            'category' => 'support',
            'event_type' => (bool) $validated['has_issue'] ? 'issue_flagged' : 'issue_cleared',
            'title' => (bool) $validated['has_issue'] ? 'Pedido sinalizado com pendência' : 'Pendência manual encerrada',
            'description' => $validated['issue_reason'] ?? null,
            'origin' => 'staff',
            'actor_name' => $actor->name,
            'occurred_at' => now(),
        ]);

        return response()->json(['data' => $order]);
    }

    public function createOccurrence(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'order_item_id' => ['nullable', 'integer', 'exists:order_items,id'],
            'type' => ['required', Rule::in(['wrong_product', 'wrong_shade', 'damaged', 'missing_item', 'delivery_delay', 'payment_issue', 'exchange', 'return', 'complaint', 'question', 'other'])],
            'priority' => ['nullable', Rule::in(['urgent', 'high', 'normal', 'low'])],
            'affected_qty' => ['nullable', 'integer', 'min:1', 'max:999'],
            'description' => ['required', 'string', 'min:3', 'max:2000'],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'due_at' => ['nullable', 'date'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $order = Order::query()->findOrFail($id);
        $occ = $this->afterSales->createOccurrence($order, $validated, $actor);

        return response()->json(['data' => $occ], 201);
    }

    public function updateOccurrence(Request $request, int $occurrenceId): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['sometimes', Rule::in(['open', 'in_progress', 'waiting_customer', 'waiting_carrier', 'waiting_supplier', 'resolved', 'closed'])],
            'priority' => ['sometimes', Rule::in(['urgent', 'high', 'normal', 'low'])],
            'assigned_to_user_id' => ['nullable', 'integer', 'exists:users,id'],
            'resolution_type' => ['nullable', 'string', 'max:40'],
            'resolution_notes' => ['nullable', 'string', 'max:2000'],
            'reverse_tracking_code' => ['nullable', 'string', 'max:80'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $occurrence = OrderOccurrence::query()->findOrFail($occurrenceId);
        $updated = $this->afterSales->updateOccurrence($occurrence, $validated, $actor);

        return response()->json(['data' => $updated]);
    }

    public function addOrderNote(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'order_occurrence_id' => ['nullable', 'integer', 'exists:order_occurrences,id'],
            'note_type' => ['nullable', Rule::in(['internal', 'customer_contact', 'carrier_contact', 'solution'])],
            'body' => ['required', 'string', 'min:2', 'max:2000'],
            'next_action' => ['nullable', 'string', 'max:255'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $order = Order::query()->findOrFail($id);
        $note = $this->afterSales->addNote($order, $validated, $actor);

        return response()->json(['data' => $note], 201);
    }

    // -------------------------------------------------------------------------
    // Modulo 06: Relatorios Inteligentes & Sinonimos de Busca
    // -------------------------------------------------------------------------

    public function zeroResultSearches(Request $request): JsonResponse
    {
        $from = $request->query('from') ? now()->parse((string) $request->query('from'))->startOfDay() : now()->subDays(30)->startOfDay();
        $to = $request->query('to') ? now()->parse((string) $request->query('to'))->endOfDay() : now()->endOfDay();

        return response()->json([
            'data' => $this->reports->zeroResultSearches($from, $to, $request->query('search')),
        ]);
    }

    public function demandedShadesReport(Request $request): JsonResponse
    {
        return response()->json([
            'data' => $this->reports->demandedShadesReport($request->query()),
        ]);
    }

    public function boughtTogetherReport(Request $request): JsonResponse
    {
        $from = $request->query('from') ? now()->parse((string) $request->query('from'))->startOfDay() : now()->subDays(90)->startOfDay();
        $to = $request->query('to') ? now()->parse((string) $request->query('to'))->endOfDay() : now()->endOfDay();

        return response()->json([
            'data' => $this->reports->boughtTogether($from, $to),
        ]);
    }

    public function exportIntelligentReportCsv(Request $request): Response
    {
        $type = (string) $request->query('type', 'zero_results');
        $from = $request->query('from') ? now()->parse((string) $request->query('from'))->startOfDay() : now()->subDays(30)->startOfDay();
        $to = $request->query('to') ? now()->parse((string) $request->query('to'))->endOfDay() : now()->endOfDay();

        $lines = [];
        if ($type === 'bought_together') {
            $data = $this->reports->boughtTogether($from, $to);
            $lines[] = 'produto_a;sku_a;produto_b;sku_b;pedidos_juntos;pct_em_a;pct_em_b;receita_brl;sugestao';
            foreach ($data['pairs'] as $pair) {
                $lines[] = implode(';', [
                    $this->reports->safeCsvCell($pair['product_a']['name']),
                    $this->reports->safeCsvCell($pair['product_a']['sku']),
                    $this->reports->safeCsvCell($pair['product_b']['name']),
                    $this->reports->safeCsvCell($pair['product_b']['sku']),
                    (string) $pair['joint_orders_count'],
                    (string) $pair['pct_of_a_orders'],
                    (string) $pair['pct_of_b_orders'],
                    number_format(((int) $pair['associated_revenue_cents']) / 100, 2, '.', ''),
                    $this->reports->safeCsvCell($pair['suggestion']),
                ]);
            }
        } elseif ($type === 'demanded_shades') {
            $data = $this->reports->demandedShadesReport($request->query());
            $lines[] = 'produto;tonalidade;sku;marca;estoque_disponivel;pendentes;historico_total;ultima_solicitacao';
            foreach ($data['items'] as $row) {
                $lines[] = implode(';', [
                    $this->reports->safeCsvCell($row['product_name']),
                    $this->reports->safeCsvCell($row['variant_name']),
                    $this->reports->safeCsvCell($row['sku']),
                    $this->reports->safeCsvCell($row['brand_name'] ?? ''),
                    (string) $row['available_stock'],
                    (string) $row['pending_count'],
                    (string) $row['total_historical_count'],
                    $this->reports->safeCsvCell($row['last_requested_at']),
                ]);
            }
        } else {
            $data = $this->reports->zeroResultSearches($from, $to, $request->query('search'));
            $lines[] = 'termo_buscado;termo_normalizado;ocorrencias;ultima_busca;categoria';
            foreach ($data['items'] as $item) {
                $lines[] = implode(';', [
                    $this->reports->safeCsvCell($item['sample_term']),
                    $this->reports->safeCsvCell($item['normalized_term']),
                    (string) $item['occurrences'],
                    $this->reports->safeCsvCell($item['last_searched_at']),
                    $this->reports->safeCsvCell($item['category_slug'] ?? ''),
                ]);
            }
        }

        return response(implode("\n", $lines), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="relatorio-inteligente-'.$type.'.csv"',
        ]);
    }

    public function listSearchSynonyms(): JsonResponse
    {
        return response()->json([
            'data' => SearchSynonym::query()->latest('id')->get(),
        ]);
    }

    public function storeSearchSynonym(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'term' => ['required', 'string', 'min:2', 'max:120'],
            'synonyms' => ['required', 'array', 'min:1'],
            'synonyms.*' => ['required', 'string', 'min:2', 'max:120'],
        ]);

        /** @var User $actor */
        $actor = $request->user();
        $syn = SearchSynonym::query()->updateOrCreate(
            ['term' => Str::ascii(mb_strtolower(trim($validated['term'])))],
            [
                'synonyms' => array_values(array_unique(array_map('trim', $validated['synonyms']))),
                'is_active' => true,
                'created_by_user_id' => $actor->id,
            ]
        );

        $this->audit->record('reports.search_synonym_saved', $actor, 'search_synonym', $syn->id, null, $validated);

        return response()->json(['data' => $syn], 201);
    }

    public function destroySearchSynonym(int $id): JsonResponse
    {
        SearchSynonym::query()->findOrFail($id)->delete();

        return response()->json(['message' => 'Sinônimo removido.']);
    }

    /** @return array<string, mixed> */
    private function validateGoodsReceipt(Request $request): array
    {
        return $request->validate([
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'new_supplier_name' => ['nullable', 'string', 'min:2', 'max:160'],
            'invoice_number' => ['nullable', 'string', 'max:60'],
            'purchase_reference' => ['nullable', 'string', 'max:80'],
            'status' => ['nullable', Rule::in(['draft', 'checking', 'discrepancy', 'verified'])],
            'received_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'items.*.expected_qty' => ['nullable', 'integer', 'min:0'],
            'items.*.received_qty' => ['required', 'integer', 'min:0'],
            'items.*.accepted_qty' => ['nullable', 'integer', 'min:0'],
            'items.*.discrepancy_reason' => ['nullable', 'string', 'max:40'],
            'items.*.discrepancy_notes' => ['nullable', 'string', 'max:255'],
            'items.*.unit_cost_cents' => ['nullable', 'integer', 'min:0'],
            'items.*.lot_code' => ['nullable', 'string', 'max:80'],
            'items.*.manufactured_at' => ['nullable', 'date'],
            'items.*.expires_at' => ['nullable', 'date'],
        ]);
    }
}
