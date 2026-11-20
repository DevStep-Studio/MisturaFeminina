<?php

declare(strict_types=1);

namespace App\Domain\Orders\Services;

use App\Domain\Cart\Services\CartService;
use App\Models\AssistedOrder;
use App\Models\AssistedOrderEvent;
use App\Models\Cart;
use App\Models\Order;
use App\Models\OrderTimelineEvent;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class AssistedOrderService
{
    public function __construct(
        private readonly CartService $carts,
    ) {}

    /** @return list<array<string, mixed>> */
    public function searchCatalog(string $query): array
    {
        $term = trim($query);
        $productsQuery = Product::query()
            ->where('is_active', true)
            ->with([
                'brand:id,name',
                'images',
                'variants' => fn ($q) => $q->where('is_active', true)->orderBy('sort_order')->orderBy('id'),
            ]);

        if ($term !== '') {
            $like = "%{$term}%";
            $productsQuery->where(function ($outer) use ($like): void {
                $outer->where('name', 'like', $like)
                    ->orWhere('sku', 'like', $like)
                    ->orWhereHas('brand', fn ($bq) => $bq->where('name', 'like', $like))
                    ->orWhereHas('variants', fn ($vq) => $vq
                        ->where('sku', 'like', $like)
                        ->orWhere('name', 'like', $like)
                        ->orWhere('shade_code', 'like', $like)
                        ->orWhere('color_family', 'like', $like));
            });
        } else {
            $productsQuery->orderByDesc('sales_count');
        }

        return $productsQuery->limit(25)->get()->map(function (Product $product): array {
            $primaryImg = $product->images->firstWhere('is_primary', true) ?? $product->images->first();

            return [
                'id' => $product->id,
                'name' => $product->name,
                'slug' => $product->slug,
                'sku' => $product->sku,
                'brand_name' => $product->brand?->name,
                'image_url' => $primaryImg?->path,
                'variants' => $product->variants->map(fn (ProductVariant $v): array => [
                    'id' => $v->id,
                    'sku' => $v->sku,
                    'name' => $v->name,
                    'shade_code' => $v->shade_code,
                    'color_family' => $v->color_family,
                    'color_hex' => $v->color_hex,
                    'price_cents' => $v->price_cents,
                    'effective_price_cents' => $v->effectivePriceCents(),
                    'available_stock' => $v->availableStock(),
                    'in_stock' => $v->availableStock() > 0,
                ])->values()->all(),
            ];
        })->values()->all();
    }

    /** @return list<array<string, mixed>> */
    public function searchCustomers(string $query): array
    {
        $term = trim($query);
        $q = User::query()
            ->where('is_active', true)
            ->orderBy('name');

        if ($term !== '') {
            $like = "%{$term}%";
            $q->where(function ($inner) use ($like): void {
                $inner->where('name', 'like', $like)
                    ->orWhere('email', 'like', $like)
                    ->orWhere('phone', 'like', $like);
            });
        }

        return $q->limit(20)->get(['id', 'name', 'email', 'phone'])->map(fn (User $u): array => [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'phone' => $u->phone,
        ])->values()->all();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function saveDraft(?int $id, array $data, User $actor): AssistedOrder
    {
        $rawItems = is_array($data['items'] ?? null) ? $data['items'] : [];
        if ($rawItems === []) {
            throw ValidationException::withMessages(['items' => ['Adicione ao menos um item ao pedido assistido.']]);
        }

        $aggregated = [];
        foreach ($rawItems as $row) {
            $vid = (int) ($row['variant_id'] ?? 0);
            $qty = max(1, min(999, (int) ($row['quantity'] ?? 1)));
            if ($vid > 0) {
                $aggregated[$vid] = ($aggregated[$vid] ?? 0) + $qty;
            }
        }

        if ($aggregated === []) {
            throw ValidationException::withMessages(['items' => ['Selecione variações válidas.']]);
        }

        $variants = ProductVariant::query()
            ->whereIn('id', array_keys($aggregated))
            ->with('product')
            ->get()
            ->keyBy('id');

        return DB::transaction(function () use ($id, $data, $actor, $aggregated, $variants): AssistedOrder {
            $assisted = null;
            if ($id !== null) {
                $assisted = AssistedOrder::query()->lockForUpdate()->findOrFail($id);
                if (in_array($assisted->status, ['converted', 'cancelled'], true)) {
                    throw ValidationException::withMessages([
                        'status' => ['Pedidos assistidos já convertidos ou cancelados não podem ser editados.'],
                    ]);
                }
            }

            $customerUser = ! empty($data['customer_user_id'])
                ? User::query()->find((int) $data['customer_user_id'])
                : null;

            $subtotalCents = 0;
            $linesToInsert = [];

            foreach ($aggregated as $variantId => $qty) {
                /** @var ProductVariant|null $variant */
                $variant = $variants->get($variantId);
                if (! $variant || ! $variant->is_active || ! $variant->product || ! $variant->product->is_active) {
                    throw ValidationException::withMessages([
                        'items' => ["Variação #{$variantId} indisponível no catálogo."],
                    ]);
                }
                if ($qty > $variant->availableStock()) {
                    throw ValidationException::withMessages([
                        'items' => ["Estoque insuficiente para {$variant->product->name} — {$variant->name} (disponível: {$variant->availableStock()})."],
                    ]);
                }
                $unitCents = $variant->effectivePriceCents();
                $subtotalCents += $unitCents * $qty;
                $linesToInsert[] = [
                    'product_id' => $variant->product_id,
                    'product_variant_id' => $variant->id,
                    'quantity' => $qty,
                    'unit_price_cents' => $unitCents,
                ];
            }

            $fields = [
                'customer_user_id' => $customerUser?->id,
                'customer_name' => trim((string) ($data['customer_name'] ?? $customerUser->name ?? '')) ?: null,
                'customer_email' => isset($data['customer_email'])
                    ? (strtolower(trim((string) $data['customer_email'])) ?: null)
                    : $customerUser?->email,
                'customer_phone' => isset($data['customer_phone'])
                    ? (trim((string) $data['customer_phone']) ?: null)
                    : $customerUser?->phone,
                'coupon_code' => ! empty($data['coupon_code']) ? strtoupper(trim((string) $data['coupon_code'])) : null,
                'notes' => isset($data['notes']) ? trim((string) $data['notes']) ?: null : null,
                'subtotal_cents' => $subtotalCents,
                'discount_cents' => 0,
                'estimated_total_cents' => $subtotalCents,
            ];

            if (! $assisted) {
                $token = Str::random(40);
                $assisted = AssistedOrder::query()->create(array_merge($fields, [
                    'order_code' => 'AS-'.now()->format('ymd').'-'.strtoupper(Str::random(5)),
                    'token' => $token,
                    'token_hash' => hash('sha256', $token),
                    'status' => 'draft',
                    'created_by_user_id' => $actor->id,
                ]));
                $eventType = 'created';
                $eventDesc = 'Rascunho de pedido assistido criado por '.$actor->name;
            } else {
                $assisted->update($fields);
                $assisted->items()->delete();
                $eventType = 'updated';
                $eventDesc = 'Rascunho atualizado por '.$actor->name;
            }

            foreach ($linesToInsert as $line) {
                $assisted->items()->create($line);
            }

            AssistedOrderEvent::query()->create([
                'assisted_order_id' => $assisted->id,
                'user_id' => $actor->id,
                'event_type' => $eventType,
                'description' => $eventDesc,
                'payload' => [
                    'items_count' => count($linesToInsert),
                    'subtotal_cents' => $subtotalCents,
                ],
            ]);

            return $assisted->fresh(['items.product.images', 'items.variant', 'createdBy:id,name', 'customerUser:id,name,email', 'events.user:id,name', 'convertedOrder:id,order_number,status,total_cents']) ?? $assisted;
        });
    }

    /** @return array<string, mixed> */
    public function generateLink(AssistedOrder $assisted, User $actor, int $expiresInHours = 72): array
    {
        if (in_array($assisted->status, ['converted', 'cancelled'], true)) {
            throw ValidationException::withMessages(['status' => ['Não é possível gerar link para pedido já convertido ou cancelado.']]);
        }

        $hours = max(1, min(720, $expiresInHours));
        $expiresAt = now()->addHours($hours);
        $assisted->update([
            'status' => 'link_generated',
            'link_generated_at' => now(),
            'expires_at' => $expiresAt,
        ]);

        AssistedOrderEvent::query()->create([
            'assisted_order_id' => $assisted->id,
            'user_id' => $actor->id,
            'event_type' => 'link_generated',
            'description' => "Link de checkout gerado por {$actor->name} (validade {$hours}h)",
            'payload' => ['expires_at' => $expiresAt->toIso8601String()],
        ]);

        $fresh = $assisted->fresh(['items.product.images', 'items.variant', 'createdBy:id,name', 'events.user:id,name']) ?? $assisted;
        $checkoutPath = "/checkout/assistido/{$fresh->token}";
        $storeBase = rtrim((string) config('app.frontend_url', config('app.url', '')), '/');
        $fullUrl = $storeBase !== '' ? $storeBase.$checkoutPath : $checkoutPath;

        return [
            'assisted_order' => $this->serialize($fresh),
            'token' => $fresh->token,
            'checkout_path' => $checkoutPath,
            'checkout_url' => $fullUrl,
            'whatsapp_message' => "Olá! Preparamos sua seleção de produtos na Mistura Feminina. Você pode conferir os itens, calcular o frete e finalizar o pagamento com segurança pelo link: {$fullUrl}",
        ];
    }

    public function findActiveByToken(string $token): AssistedOrder
    {
        $hash = hash('sha256', $token);
        /** @var AssistedOrder|null $assisted */
        $assisted = AssistedOrder::query()
            ->where(fn ($q) => $q->where('token', $token)->orWhere('token_hash', $hash))
            ->with(['items.product.images', 'items.variant'])
            ->first();

        abort_unless($assisted !== null, 404, 'Pedido assistido não encontrado.');
        abort_if($assisted->status === 'cancelled', 410, 'Este link de pedido assistido foi cancelado.');
        abort_if($assisted->status === 'converted', 409, 'Este pedido assistido já foi concluído.');
        abort_if($assisted->expires_at !== null && $assisted->expires_at->isPast(), 410, 'Este link de pedido assistido expirou. Solicite um novo link à equipe.');

        return $assisted;
    }

    /** @return array<string, mixed> */
    public function loadIntoCart(string $token, Cart $cart, ?User $user): array
    {
        $assisted = $this->findActiveByToken($token);
        $warnings = [];

        DB::transaction(function () use ($assisted, $cart, &$warnings): void {
            $cart->items()->delete();

            foreach ($assisted->items as $item) {
                $variant = $item->variant;
                $product = $item->product;
                if (! $variant || ! $product || ! $variant->is_active || ! $product->is_active) {
                    $warnings[] = "{$product?->name} ({$variant?->name}) não está mais disponível.";

                    continue;
                }
                $available = $variant->availableStock();
                if ($available <= 0) {
                    $warnings[] = "{$product->name} — {$variant->name} está sem estoque no momento.";

                    continue;
                }
                $qty = min($item->quantity, $available);
                if ($qty < $item->quantity) {
                    $warnings[] = "{$product->name} — {$variant->name}: ajustado de {$item->quantity} para {$qty} un. disponíveis.";
                }

                $this->carts->addItem($cart, $variant, $qty);
            }

            if ($assisted->coupon_code) {
                $cart->update(['coupon_code' => $assisted->coupon_code]);
            }

            if ($assisted->status === 'link_generated' || $assisted->status === 'draft') {
                $assisted->update(['status' => 'awaiting_checkout']);
                AssistedOrderEvent::query()->create([
                    'assisted_order_id' => $assisted->id,
                    'event_type' => 'opened_by_customer',
                    'description' => 'Cliente acessou o link e carregou o checkout.',
                ]);
            }
        });

        $summary = $this->carts->buildSummary($cart->fresh(), $user);

        return [
            'assisted_order' => $this->serialize($assisted->fresh(['items.product.images', 'items.variant']) ?? $assisted),
            'cart' => $summary,
            'stock_warnings' => $warnings,
        ];
    }

    public function markConvertedByToken(string $token, Order $order): void
    {
        $hash = hash('sha256', $token);
        /** @var AssistedOrder|null $assisted */
        $assisted = AssistedOrder::query()
            ->where(fn ($q) => $q->where('token', $token)->orWhere('token_hash', $hash))
            ->first();

        if (! $assisted || $assisted->status === 'converted') {
            return;
        }

        $assisted->update([
            'status' => 'converted',
            'converted_order_id' => $order->id,
            'converted_at' => now(),
        ]);

        $order->update(['assisted_order_id' => $assisted->id]);

        AssistedOrderEvent::query()->create([
            'assisted_order_id' => $assisted->id,
            'event_type' => 'converted',
            'description' => "Convertido no pedido {$order->order_number}",
            'payload' => ['order_id' => $order->id, 'order_number' => $order->order_number],
        ]);

        OrderTimelineEvent::query()->create([
            'order_id' => $order->id,
            'user_id' => $assisted->created_by_user_id,
            'category' => 'internal',
            'event_type' => 'assisted_order_converted',
            'title' => "Pedido originado de atendimento assistido ({$assisted->order_code})",
            'description' => 'Atendimento montado pela equipe e finalizado pela cliente no checkout oficial.',
            'origin' => 'staff',
            'actor_name' => $assisted->createdBy?->name,
            'occurred_at' => now(),
        ]);
    }

    /** @return array<string, mixed> */
    public function serialize(AssistedOrder $assisted): array
    {
        $liveTotal = 0;
        $items = $assisted->items->map(function ($item) use (&$liveTotal): array {
            $product = $item->product;
            $variant = $item->variant;
            $livePrice = $variant ? $variant->effectivePriceCents() : $item->unit_price_cents;
            $avail = $variant ? $variant->availableStock() : 0;
            $line = $livePrice * $item->quantity;
            $liveTotal += $line;
            $img = $product?->images?->firstWhere('is_primary', true) ?? $product?->images?->first();

            return [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'variant_id' => $item->product_variant_id,
                'product_name' => $product->name ?? 'Produto',
                'variant_name' => $variant->name ?? '',
                'shade_code' => $variant?->shade_code,
                'color_hex' => $variant?->color_hex,
                'sku' => $variant->sku ?? '',
                'image_url' => $img?->path,
                'quantity' => $item->quantity,
                'unit_price_cents' => $livePrice,
                'line_total_cents' => $line,
                'available_stock' => $avail,
                'in_stock' => $avail >= $item->quantity,
            ];
        })->values()->all();

        $checkoutPath = "/checkout/assistido/{$assisted->token}";
        $storeBase = rtrim((string) config('app.frontend_url', config('app.url', '')), '/');

        return [
            'id' => $assisted->id,
            'order_code' => $assisted->order_code,
            'token' => $assisted->token,
            'status' => $assisted->status,
            'customer_user_id' => $assisted->customer_user_id,
            'customer_name' => $assisted->customer_name,
            'customer_email' => $assisted->customer_email,
            'customer_phone' => $assisted->customer_phone,
            'coupon_code' => $assisted->coupon_code,
            'notes' => $assisted->notes,
            'subtotal_cents' => $liveTotal > 0 ? $liveTotal : $assisted->subtotal_cents,
            'estimated_total_cents' => $liveTotal > 0 ? $liveTotal : $assisted->estimated_total_cents,
            'checkout_path' => $checkoutPath,
            'checkout_url' => $storeBase !== '' ? $storeBase.$checkoutPath : $checkoutPath,
            'link_generated_at' => $assisted->link_generated_at?->toIso8601String(),
            'expires_at' => $assisted->expires_at?->toIso8601String(),
            'converted_at' => $assisted->converted_at?->toIso8601String(),
            'converted_order' => $assisted->convertedOrder ? [
                'id' => $assisted->convertedOrder->id,
                'order_number' => $assisted->convertedOrder->order_number,
                'status' => $assisted->convertedOrder->status->value,
                'total_cents' => $assisted->convertedOrder->total_cents,
            ] : null,
            'created_by' => $assisted->createdBy ? [
                'id' => $assisted->createdBy->id,
                'name' => $assisted->createdBy->name,
            ] : null,
            'items' => $items,
            'events' => $assisted->events->map(fn (AssistedOrderEvent $e): array => [
                'id' => $e->id,
                'event_type' => $e->event_type,
                'description' => $e->description,
                'actor_name' => $e->user?->name,
                'created_at' => $e->created_at?->toIso8601String(),
            ])->values()->all(),
            'created_at' => $assisted->created_at?->toIso8601String(),
        ];
    }
}
