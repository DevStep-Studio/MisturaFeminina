<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Cart\Services\CartService;
use App\Domain\Checkout\Services\CheckoutService;
use App\Domain\Payments\Services\PaymentService;
use App\Domain\Payments\Services\PaymentSettings;
use App\Domain\Shared\Enums\PaymentMethod;
use App\Http\Controllers\Controller;
use App\Models\AnalyticsEvent;
use App\Models\Order;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CheckoutController extends Controller
{
    public function __construct(
        private readonly CartService $carts,
        private readonly CheckoutService $checkout,
    ) {}

    public function config(): JsonResponse
    {
        return response()->json(['data' => app(PaymentSettings::class)->publicConfig()]);
    }

    public function refreshPayment(string $publicToken): JsonResponse
    {
        $order = Order::where('public_token', $publicToken)->with('latestPayment')->firstOrFail();
        if ($order->latestPayment) {
            app(PaymentService::class)->refresh($order->latestPayment);
        }

        return $this->trackByToken($publicToken);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'customer_name' => ['required', 'string', 'min:3', 'max:150'],
            'customer_email' => ['required', 'email', 'max:190'],
            'customer_phone' => ['required', 'string', 'min:8', 'max:30'],
            'customer_cpf_cnpj' => ['required', 'string', 'min:11', 'max:20', function (string $attribute, mixed $value, \Closure $fail): void {
                if (! is_string($value) || ! PaymentSettings::document(preg_replace('/\D/', '', $value) ?? '')) {
                    $fail('CPF ou CNPJ inválido.');
                }
            }],
            'defer_payment' => ['sometimes', 'boolean'],
            'shipping_quote_id' => ['nullable', 'integer', 'exists:shipping_quotes,id'],
            'shipping_address' => ['required', 'array:recipient_name,cep,street,number,complement,neighborhood,city,state'],
            'shipping_address.recipient_name' => ['nullable', 'string', 'max:150'],
            'shipping_address.cep' => ['required', 'string', 'min:8', 'max:9'],
            'shipping_address.street' => ['required', 'string', 'max:180'],
            'shipping_address.number' => ['required', 'string', 'max:30'],
            'shipping_address.complement' => ['nullable', 'string', 'max:120'],
            'shipping_address.neighborhood' => ['required', 'string', 'max:120'],
            'shipping_address.city' => ['required', 'string', 'max:120'],
            'shipping_address.state' => ['required', Rule::in(explode(',', 'AC,AL,AP,AM,BA,CE,DF,ES,GO,MA,MT,MS,MG,PA,PB,PR,PE,PI,RJ,RN,RS,RO,RR,SC,SP,SE,TO'))],
            'payment_method' => ['required', Rule::enum(PaymentMethod::class)],
            'payment_data' => ['nullable', 'array:installments,payment_method_id,card_token,card_last_four,issuer_id'],
            'payment_data.installments' => ['nullable', 'integer', 'min:1', 'max:1'],
            'payment_data.payment_method_id' => ['nullable', 'string', 'max:40'],
            'payment_data.card_token' => ['nullable', 'string', 'max:255'],
            'payment_data.card_last_four' => ['nullable', 'string', 'max:4'],
            'payment_data.issuer_id' => ['nullable', 'string', 'max:40'],
            'notes_customer' => ['nullable', 'string', 'max:500'],
        ]);

        $idempotencyKey = trim((string) ($request->header('X-Idempotency-Key') ?: $request->input('idempotency_key') ?: Str::uuid()->toString()));
        abort_unless(strlen($idempotencyKey) <= 100 && preg_match('/^[a-zA-Z0-9:_-]+$/D', $idempotencyKey), 422, 'Chave de pedido inválida.');

        $cart = $this->carts->resolveCart($request, false);
        if (! $cart) {
            return response()->json([
                'message' => 'Carrinho não encontrado ou vazio.',
                'errors' => ['cart' => ['Carrinho não encontrado ou vazio.']],
            ], 422);
        }

        $result = $this->checkout->submitCheckout($cart, $request->user(), $validated, $idempotencyKey);
        $order = $result['order'];
        $payment = $result['payment'];

        AnalyticsEvent::query()->create([
            'session_id' => $request->header('X-Cart-Token') ?? ($request->hasSession() ? $request->session()->getId() : $order->public_token),
            'user_id' => $request->user()?->id,
            'order_id' => $order->id,
            'event_name' => 'purchase_created',
            'path' => '/checkout',
            'payload' => [
                'order_number' => $order->order_number,
                'total_cents' => $order->total_cents,
                'payment_method' => $payment?->method->value ?? $validated['payment_method'],
                'payment_status' => $payment?->status->value,
            ],
        ]);

        return response()->json([
            'data' => [
                'order' => $this->serializePublicOrder($order),
                'payment' => $payment ? $this->serializePayment($payment) : null,
            ],
        ], 201);
    }

    public function trackByToken(string $publicToken): JsonResponse
    {
        $order = Order::query()
            ->where('public_token', $publicToken)
            ->with(['items', 'latestPayment', 'statusHistories', 'shipment.trackingEvents'])
            ->firstOrFail();

        return response()->json([
            'data' => [
                'order' => $this->serializePublicOrder($order),
                'payment' => $order->latestPayment ? $this->serializePayment($order->latestPayment) : null,
            ],
        ]);
    }

    public function trackLookup(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order_number' => ['required', 'string', 'max:40'],
            'identifier' => ['required', 'string', 'max:190'],
        ]);

        $orderNumber = strtoupper(trim($validated['order_number']));
        $identifier = trim($validated['identifier']);
        $cleanDigits = preg_replace('/\D/', '', $identifier) ?? '';

        $order = Order::query()
            ->where('order_number', $orderNumber)
            ->with(['items', 'latestPayment', 'statusHistories', 'shipment.trackingEvents'])
            ->first();

        if (! $order) {
            return response()->json(['message' => 'Pedido não encontrado ou dados não conferem.'], 404);
        }

        $emailMatches = strcasecmp($order->customer_email, $identifier) === 0;
        $docMatches = $cleanDigits !== '' && $order->customer_cpf_cnpj !== null
            && (preg_replace('/\D/', '', $order->customer_cpf_cnpj) === $cleanDigits);

        if (! $emailMatches && ! $docMatches) {
            return response()->json(['message' => 'Pedido não encontrado ou dados não conferem.'], 404);
        }

        return response()->json([
            'data' => [
                'order' => $this->serializePublicOrder($order),
                'payment' => $order->latestPayment ? $this->serializePayment($order->latestPayment) : null,
            ],
        ]);
    }

    public function retryPayment(Request $request, string $publicToken): JsonResponse
    {
        $validated = $request->validate([
            'payment_method' => ['required', Rule::enum(PaymentMethod::class)],
            'payment_data' => ['nullable', 'array:installments,payment_method_id,card_token,card_last_four,issuer_id'],
            'payment_data.installments' => ['nullable', 'integer', 'min:1', 'max:1'],
            'payment_data.payment_method_id' => ['nullable', 'string', 'max:40'],
            'payment_data.card_token' => ['nullable', 'string', 'max:255'],
            'payment_data.card_last_four' => ['nullable', 'string', 'max:4'],
        ]);

        $order = Order::query()->where('public_token', $publicToken)->with('items')->firstOrFail();
        $idempotencyKey = trim((string) ($request->header('X-Idempotency-Key') ?: Str::uuid()->toString()));
        abort_unless(strlen($idempotencyKey) <= 100 && preg_match('/^[a-zA-Z0-9:_-]+$/D', $idempotencyKey), 422, 'Chave de pagamento inválida.');
        $payment = $this->checkout->retryPayment(
            $order,
            PaymentMethod::from((string) $validated['payment_method']),
            is_array($validated['payment_data'] ?? null) ? $validated['payment_data'] : [],
            $idempotencyKey,
        );

        return response()->json([
            'data' => [
                'order' => $this->serializePublicOrder($order->fresh(['items', 'latestPayment', 'statusHistories', 'shipment.trackingEvents'])),
                'payment' => $this->serializePayment($payment),
            ],
        ]);
    }

    /** @return array<string, mixed> */
    private function serializePublicOrder(Order $order): array
    {
        return [
            'id' => $order->id,
            'order_number' => $order->order_number,
            'public_token' => $order->public_token,
            'status' => $order->status->value, 'payment_provider' => $order->payment_provider, 'payment_environment' => $order->payment_environment, 'payment_method' => $order->payment_method,
            'customer_first_name' => Str::before(trim($order->customer_name), ' ') ?: 'Cliente',
            'subtotal_cents' => $order->subtotal_cents,
            'discount_cents' => $order->discount_cents,
            'coupon_code' => $order->coupon_code,
            'shipping_cents' => $order->shipping_cents,
            'total_cents' => $order->total_cents,
            'shipping_city' => $order->shipping_address_snapshot['city'] ?? null,
            'shipping_state' => $order->shipping_address_snapshot['state'] ?? null,
            'shipping_service' => $order->shipping_service_snapshot,
            'stock_reserved_until' => $order->stock_reserved_until?->toIso8601String(),
            'paid_at' => $order->paid_at?->toIso8601String(),
            'created_at' => $order->created_at?->toIso8601String(),
            'items' => $order->items->map(fn ($item): array => [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'product_variant_id' => $item->product_variant_id,
                'product_name' => $item->product_name_snapshot,
                'variant_name' => $item->variant_name_snapshot,
                'sku' => $item->sku_snapshot,
                'quantity' => $item->quantity,
                'unit_price_cents' => $item->unit_price_cents,
                'total_cents' => $item->total_cents,
            ])->values(),
            'status_histories' => $order->statusHistories->map(fn ($h): array => [
                'from_status' => $h->from_status,
                'to_status' => $h->to_status,
                'note' => $h->note,
                'created_at' => $h->created_at?->toIso8601String(),
            ])->values(),
            'shipment' => $order->shipment ? [
                'carrier' => $order->shipment->carrier,
                'service_name' => $order->shipment->service_name,
                'tracking_code' => $order->shipment->tracking_code,
                'tracking_url' => $order->shipment->tracking_url,
                'shipped_at' => $order->shipment->shipped_at?->toIso8601String(),
                'delivered_at' => $order->shipment->delivered_at?->toIso8601String(),
                'tracking_events' => $order->shipment->trackingEvents->map(fn ($ev): array => [
                    'occurred_at' => $ev->occurred_at?->toIso8601String(),
                    'status' => $ev->status,
                    'location' => $ev->location,
                    'description' => $ev->description,
                ])->values(),
            ] : null,
        ];
    }

    /** @return array<string, mixed> */
    private function serializePayment(Payment $payment): array
    {
        return [
            'id' => $payment->id,
            'provider' => $payment->provider,
            'environment' => $payment->environment,
            'method' => $payment->method->value,
            'installments' => $payment->installments,
            'gross_amount_cents' => $payment->gross_amount_cents,
            'status' => $payment->status->value,
            'pix_qr_code_base64' => $payment->pix_qr_code_base64,
            'pix_copy_paste' => $payment->pix_copy_paste,
            'pix_expires_at' => $payment->pix_expires_at?->toIso8601String(),
            'card_last_four' => $payment->card_last_four,
            'card_brand' => $payment->card_brand,
            'failure_reason' => $payment->failure_reason, 'checkout_url' => $payment->checkout_url, 'boleto_url' => $payment->boleto_url, 'barcode' => $payment->barcode,
            'paid_at' => $payment->paid_at?->toIso8601String(),
        ];
    }
}
