<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Cart\Services\CartService;
use App\Domain\Shipping\Services\ShippingQuoteService;
use App\Http\Controllers\Controller;
use App\Models\ProductVariant;
use App\Models\ShippingQuote;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CartController extends Controller
{
    public function __construct(
        private readonly CartService $carts,
        private readonly ShippingQuoteService $shipping,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $cart = $this->carts->resolveCart($request, true);
        $summary = $this->carts->buildSummary($cart, $request->user());

        return $this->respondWithCartToken($summary, $cart->token);
    }

    public function addItem(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'variant_id' => ['required', 'integer', 'exists:product_variants,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:99'],
        ]);

        $cart = $this->carts->resolveCart($request, true);
        $variant = ProductVariant::query()->findOrFail((int) $validated['variant_id']);
        $cart = $this->carts->addItem($cart, $variant, (int) $validated['quantity']);

        $summary = $this->carts->buildSummary($cart, $request->user());

        return $this->respondWithCartToken($summary, $cart->token, 201);
    }

    public function updateItem(Request $request, int $itemId): JsonResponse
    {
        $validated = $request->validate([
            'quantity' => ['required', 'integer', 'min:0', 'max:99'],
        ]);

        $cart = $this->carts->resolveCart($request, true);
        $item = $cart->items()->findOrFail($itemId);
        $cart = $this->carts->updateItemQuantity($cart, $item, (int) $validated['quantity']);

        $summary = $this->carts->buildSummary($cart, $request->user());

        return $this->respondWithCartToken($summary, $cart->token);
    }

    public function removeItem(Request $request, int $itemId): JsonResponse
    {
        $cart = $this->carts->resolveCart($request, true);
        $item = $cart->items()->findOrFail($itemId);
        $item->delete();
        $this->carts->invalidateShippingQuote($cart);

        $summary = $this->carts->buildSummary($cart->fresh(), $request->user());

        return $this->respondWithCartToken($summary, $cart->token);
    }

    public function applyCoupon(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:60'],
            'customer_email' => ['nullable', 'email'],
            'state' => ['nullable', 'string', 'size:2'],
        ]);

        $cart = $this->carts->resolveCart($request, true);
        $cart->update(['coupon_code' => strtoupper(trim($validated['code']))]);
        $summary = $this->carts->buildSummary(
            $cart->fresh(),
            $request->user(),
            $validated['customer_email'] ?? null,
            $validated['state'] ?? null,
        );

        if ($summary['coupon_error']) {
            $cart->update(['coupon_code' => null]);

            return response()->json([
                'message' => $summary['coupon_error'],
                'errors' => ['code' => [$summary['coupon_error']]],
                'data' => $this->carts->buildSummary($cart->fresh(), $request->user()),
            ], 422);
        }

        return $this->respondWithCartToken($summary, $cart->token);
    }

    public function removeCoupon(Request $request): JsonResponse
    {
        $cart = $this->carts->resolveCart($request, true);
        $cart->update(['coupon_code' => null]);
        $summary = $this->carts->buildSummary($cart->fresh(), $request->user());

        return $this->respondWithCartToken($summary, $cart->token);
    }

    public function quoteShipping(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'cep' => ['required', 'string', 'max:12'],
        ]);

        $cart = $this->carts->resolveCart($request, true);
        $cart->load('items.product', 'items.variant');
        if ($cart->items->isEmpty()) {
            return response()->json(['message' => 'Adicione itens ao carrinho antes de calcular o frete.'], 422);
        }

        $itemsPayload = [];
        $subtotalCents = 0;
        foreach ($cart->items as $item) {
            if (! $item->product || ! $item->variant) {
                continue;
            }
            $price = $item->variant->effectivePriceCents();
            $subtotalCents += $price * $item->quantity;
            $itemsPayload[] = [
                'id' => $item->variant->sku,
                'width' => $item->variant->width_cm ?? $item->product->width_cm ?? 11,
                'height' => $item->variant->height_cm ?? $item->product->height_cm ?? 6,
                'length' => $item->variant->length_cm ?? $item->product->length_cm ?? 16,
                'weight_grams' => $item->variant->weight_grams ?? $item->product->weight_grams ?? 200,
                'insurance_cents' => $price,
                'quantity' => $item->quantity,
            ];
        }

        $result = $this->shipping->quoteForItems($validated['cep'], $itemsPayload, $subtotalCents, $cart);
        $cart->update([
            'shipping_cep' => $result['cep'],
            'shipping_quote_id' => $result['options'][0]['quote_id'] ?? null,
            'shipping_service_code' => $result['options'][0]['service_code'] ?? null,
        ]);

        return response()->json(['data' => $result])->header('X-Cart-Token', $cart->token);
    }

    public function selectShipping(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'quote_id' => ['required', 'integer', 'exists:shipping_quotes,id'],
        ]);

        $cart = $this->carts->resolveCart($request, true);
        $quote = ShippingQuote::query()
            ->where('id', (int) $validated['quote_id'])
            ->where(function ($q) use ($cart): void {
                $q->where('cart_id', $cart->id)->orWhereNull('cart_id');
            })
            ->firstOrFail();

        if ($quote->expires_at->isPast()) {
            return response()->json(['message' => 'Cotação expirada. Calcule o frete novamente.'], 422);
        }

        $cart->update([
            'shipping_cep' => $quote->cep,
            'shipping_quote_id' => $quote->id,
            'shipping_service_code' => $quote->service_code,
        ]);

        $summary = $this->carts->buildSummary($cart->fresh(), $request->user());

        return $this->respondWithCartToken($summary, $cart->token);
    }

    /** @param array<string, mixed> $summary */
    private function respondWithCartToken(array $summary, string $token, int $status = 200): JsonResponse
    {
        return response()
            ->json(['data' => $summary], $status)
            ->header('X-Cart-Token', $token)
            ->cookie('mf_cart_token', $token, 60 * 24 * 14, '/', null, app()->isProduction(), true, false, 'lax');
    }
}
