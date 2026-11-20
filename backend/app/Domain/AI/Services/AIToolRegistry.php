<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use App\Domain\Orders\Services\OrderAfterSalesService;
use App\Models\AiExecution;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class AIToolRegistry
{
    public function __construct(
        private readonly AIUsageTracker $tracker,
        private readonly OrderAfterSalesService $afterSales,
        private readonly ReplenishmentCalculator $replenishmentCalculator,
    ) {}

    /** @var array<string, string> */
    private const TOOL_PERMISSIONS = [
        'get_order_details' => 'ai.support',
        'get_payment_status' => 'ai.support',
        'get_order_timeline' => 'ai.support',
        'get_shipping_status' => 'ai.support',
        'get_tracking_information' => 'ai.support',
        'get_order_occurrences' => 'ai.support',
        'save_internal_note' => 'orders.view',
        'search_existing_products' => 'ai.catalog',
        'search_existing_variants' => 'ai.catalog',
        'get_product_categories' => 'ai.catalog',
        'get_registered_brands' => 'ai.catalog',
        'detect_duplicate_skus' => 'ai.catalog',
        'calculate_replenishment_metrics' => 'ai.replenishment',
    ];

    /**
     * Executes a permission-checked backend tool on behalf of an authenticated staff member.
     *
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    public function callTool(
        string $toolName,
        array $args,
        User $actor,
        ?AiExecution $execution = null,
    ): array {
        $requiredPerm = self::TOOL_PERMISSIONS[$toolName] ?? null;
        if ($requiredPerm === null) {
            throw ValidationException::withMessages([
                'tool' => ["Ferramenta de IA não autorizada: {$toolName}"],
            ]);
        }

        if (! $actor->hasPermission($requiredPerm)) {
            throw ValidationException::withMessages([
                'permission' => ["Usuário sem permissão ({$requiredPerm}) para executar {$toolName}."],
            ]);
        }

        $result = match ($toolName) {
            'get_order_details' => $this->getOrderDetails((int) ($args['order_id'] ?? 0)),
            'get_payment_status' => $this->getPaymentStatus((int) ($args['order_id'] ?? 0)),
            'get_order_timeline' => $this->getOrderTimeline((int) ($args['order_id'] ?? 0)),
            'get_shipping_status' => $this->getShippingStatus((int) ($args['order_id'] ?? 0)),
            'get_tracking_information' => $this->getTrackingInformation((int) ($args['order_id'] ?? 0)),
            'get_order_occurrences' => $this->getOrderOccurrences((int) ($args['order_id'] ?? 0)),
            'save_internal_note' => $this->saveInternalNote($args, $actor),
            'search_existing_products' => $this->searchExistingProducts((string) ($args['query'] ?? '')),
            'search_existing_variants' => $this->searchExistingVariants((string) ($args['query'] ?? '')),
            'get_product_categories' => $this->getProductCategories(),
            'get_registered_brands' => $this->getRegisteredBrands(),
            'detect_duplicate_skus' => $this->detectDuplicateSkus(is_array($args['skus'] ?? null) ? $args['skus'] : []),
            'calculate_replenishment_metrics' => $this->replenishmentCalculator->calculate($args),
            default => throw ValidationException::withMessages(['tool' => ["Ferramenta de IA desconhecida: {$toolName}"]]),
        };

        if ($execution !== null) {
            $this->tracker->logEvent($execution, 'tool_called', $toolName, "Ferramenta {$toolName} executada com sucesso.", [
                'args' => $args,
                'actor_id' => $actor->id,
            ]);
        }

        return $result;
    }

    /** @return array<string, mixed> */
    private function getOrderDetails(int $orderId): array
    {
        $order = Order::query()->with(['items', 'payments', 'shipment', 'occurrences'])->findOrFail($orderId);

        return [
            'id' => $order->id,
            'order_number' => $order->order_number,
            'status' => $order->status->value,
            'created_at' => $order->created_at?->toIso8601String(),
            'has_issue' => (bool) $order->has_issue,
            'issue_reason' => $order->issue_reason,
            'shipping_deadline_at' => $order->shipping_deadline_at?->toIso8601String(),
            'subtotal_cents' => $order->subtotal_cents,
            'total_cents' => $order->total_cents,
            'items' => $order->items->map(fn ($i): array => [
                'id' => $i->id,
                'product_name' => $i->product_name_snapshot,
                'variant_name' => $i->variant_name_snapshot,
                'sku' => $i->sku_snapshot,
                'quantity' => $i->quantity,
            ])->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function getPaymentStatus(int $orderId): array
    {
        $order = Order::query()->with('payments')->findOrFail($orderId);
        $latest = $order->payments->sortByDesc('id')->first();

        return [
            'order_id' => $order->id,
            'order_status' => $order->status->value,
            'paid_at' => $order->paid_at?->toIso8601String(),
            'latest_payment' => $latest ? [
                'method' => $latest->method->value,
                'status' => $latest->status->value,
                'provider' => $latest->provider,
                'gross_amount_cents' => $latest->gross_amount_cents,
                'paid_at' => $latest->paid_at?->toIso8601String(),
            ] : null,
            'is_confirmed_paid' => $order->paid_at !== null || ($latest !== null && ($latest->paid_at !== null || $latest->status->value === 'approved')),
        ];
    }

    /** @return array<string, mixed> */
    private function getOrderTimeline(int $orderId): array
    {
        $order = Order::query()->findOrFail($orderId);

        return [
            'events' => $this->afterSales->buildUnifiedTimeline($order),
        ];
    }

    /** @return array<string, mixed> */
    private function getShippingStatus(int $orderId): array
    {
        $order = Order::query()->with('shipment')->findOrFail($orderId);
        $deadline = $order->shipping_deadline_at;
        $ship = $order->shipment;
        $isDelayed = $deadline !== null
            && $deadline->isPast()
            && ! in_array($order->status->value, ['shipped', 'delivered', 'cancelled', 'refunded'], true);

        return [
            'order_status' => $order->status->value,
            'shipping_deadline_at' => $deadline?->toIso8601String(),
            'is_delayed' => $isDelayed,
            'carrier' => $ship?->carrier,
            'service_name' => $ship?->service_name,
            'label_status' => $ship?->label_status,
            'shipped_at' => $ship?->shipped_at?->toIso8601String(),
            'delivered_at' => $ship?->delivered_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function getTrackingInformation(int $orderId): array
    {
        $order = Order::query()->with('shipment.trackingEvents')->findOrFail($orderId);
        $ship = $order->shipment;

        return [
            'has_tracking' => $ship !== null && ! empty($ship->tracking_code),
            'carrier' => $ship?->carrier,
            'tracking_code' => $ship?->tracking_code,
            'tracking_url' => $ship?->tracking_url,
            'events' => $ship ? $ship->trackingEvents->map(fn ($ev): array => [
                'description' => $ev->description,
                'location' => $ev->location,
                'occurred_at' => $ev->occurred_at?->toIso8601String(),
            ])->values()->all() : [],
        ];
    }

    /** @return array<string, mixed> */
    private function getOrderOccurrences(int $orderId): array
    {
        $order = Order::query()->with('occurrences')->findOrFail($orderId);

        return [
            'has_issue' => (bool) $order->has_issue,
            'issue_reason' => $order->issue_reason,
            'occurrences' => $order->occurrences->map(fn ($occ): array => [
                'id' => $occ->id,
                'occurrence_number' => $occ->occurrence_number,
                'type' => $occ->type,
                'status' => $occ->status,
                'priority' => $occ->priority,
                'description' => $occ->description,
                'resolution_notes' => $occ->resolution_notes,
            ])->values()->all(),
        ];
    }

    /**
     * @param  array<string, mixed>  $args
     * @return array<string, mixed>
     */
    private function saveInternalNote(array $args, User $actor): array
    {
        $order = Order::query()->findOrFail((int) ($args['order_id'] ?? 0));
        $note = $this->afterSales->addNote($order, [
            'note_type' => (string) ($args['note_type'] ?? 'internal'),
            'body' => (string) ($args['body'] ?? ''),
            'next_action' => $args['next_action'] ?? null,
        ], $actor);

        return [
            'note_id' => $note->id,
            'saved_at' => $note->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    private function searchExistingProducts(string $query): array
    {
        $q = Product::query()->with('brand:id,name')->where('is_active', true);
        if (trim($query) !== '') {
            $like = '%'.trim($query).'%';
            $q->where(fn ($w) => $w->where('name', 'like', $like)->orWhere('sku', 'like', $like));
        }

        return [
            'products' => $q->limit(25)->get()->map(fn (Product $p): array => [
                'id' => $p->id,
                'name' => $p->name,
                'sku' => $p->sku,
                'gtin' => $p->gtin,
                'brand_name' => $p->brand?->name,
                'price_cents' => $p->price_cents,
            ])->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function searchExistingVariants(string $query): array
    {
        $q = ProductVariant::query()->with('product:id,name,sku');
        if (trim($query) !== '') {
            $like = '%'.trim($query).'%';
            $q->where(fn ($w) => $w->where('sku', 'like', $like)->orWhere('name', 'like', $like)->orWhere('gtin', 'like', $like));
        }

        return [
            'variants' => $q->limit(30)->get()->map(fn (ProductVariant $v): array => [
                'id' => $v->id,
                'product_id' => $v->product_id,
                'product_name' => $v->product->name ?? '',
                'sku' => $v->sku,
                'name' => $v->name,
                'price_cents' => $v->price_cents,
                'stock_qty' => $v->stock_qty,
            ])->values()->all(),
        ];
    }

    /** @return array<string, mixed> */
    private function getProductCategories(): array
    {
        return [
            'categories' => Category::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'slug', 'parent_id'])
                ->toArray(),
        ];
    }

    /** @return array<string, mixed> */
    private function getRegisteredBrands(): array
    {
        return [
            'brands' => Brand::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'slug'])
                ->toArray(),
        ];
    }

    /**
     * @param  list<string>  $skus
     * @return array<string, mixed>
     */
    private function detectDuplicateSkus(array $skus): array
    {
        $clean = array_values(array_unique(array_filter(array_map(fn ($s): string => strtoupper(trim((string) $s)), $skus))));
        if ($clean === []) {
            return ['matches' => []];
        }

        $variants = ProductVariant::query()
            ->whereIn('sku', $clean)
            ->with('product:id,name,sku')
            ->get()
            ->keyBy(fn (ProductVariant $v): string => strtoupper($v->sku));

        return [
            'matches' => $variants->map(fn (ProductVariant $v): array => [
                'sku' => $v->sku,
                'variant_id' => $v->id,
                'product_id' => $v->product_id,
                'product_name' => $v->product->name ?? '',
                'variant_name' => $v->name,
                'price_cents' => $v->price_cents,
                'stock_qty' => $v->stock_qty,
            ])->all(),
        ];
    }
}
