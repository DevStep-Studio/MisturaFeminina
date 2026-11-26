<?php

declare(strict_types=1);

namespace App\Domain\Checkout\Services;

use App\Domain\Cart\Services\CartService;
use App\Domain\Catalog\Services\InventoryService;
use App\Domain\Orders\Services\OrderCostService;
use App\Domain\Orders\Services\OrderEmailService;
use App\Domain\Payments\Services\PaymentService;
use App\Domain\Payments\Services\PaymentSettings;
use App\Domain\Payments\Services\WebhookProcessorService;
use App\Domain\Shared\Enums\OrderStatus;
use App\Domain\Shared\Enums\PaymentMethod;
use App\Domain\Shared\Enums\PaymentStatus;
use App\Domain\Shipping\Services\ShippingQuoteService;
use App\Models\Cart;
use App\Models\CartItem;
use App\Models\Coupon;
use App\Models\CouponRedemption;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusHistory;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ShippingQuote;
use App\Models\StockReservation;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class CheckoutService
{
    public function __construct(
        private readonly CartService $carts,
        private readonly InventoryService $inventory,
        private readonly ShippingQuoteService $shipping,
        private readonly PaymentService $payments,
        private readonly WebhookProcessorService $webhooks,
        private readonly OrderCostService $orderCost,
    ) {}

    /**
     * @param  array<string, mixed>  $input
     * @return array{order: Order, payment: Payment|null}
     */
    public function submitCheckout(Cart $cart, ?User $user, array $input, string $idempotencyKey): array
    {
        $settings = app(PaymentSettings::class);
        abort_unless($settings->available(), 503, 'Checkout indisponível. Configure os pagamentos.');
        abort_if(($input['payment_method'] ?? '') === 'debit_card', 422, 'Selecione Pix, crédito ou boleto.');
        if ($settings->provider() === 'mercadopago' && $input['payment_method'] === 'credit_card' && ! ($input['defer_payment'] ?? false)) {
            abort_unless(! empty($input['payment_data']['card_token']) && ! empty($input['payment_data']['payment_method_id']), 422, 'Preencha o cartão no formulário seguro.');
        }
        $fingerprint = PaymentSettings::digest($input);
        $existingOrder = Order::where('idempotency_key', $idempotencyKey)->with('latestPayment')->first();
        if ($existingOrder) {
            abort_unless($existingOrder->checkout_cart_id === $cart->id && $existingOrder->checkout_fingerprint === $fingerprint, 409, 'Chave de pedido já utilizada com outros dados.');

            return ['order' => $existingOrder, 'payment' => $existingOrder->latestPayment];
        }
        $address = $input['shipping_address'];
        $cep = $this->shipping->normalizeCep((string) $address['cep']);
        $uf = strtoupper((string) $address['state']);
        $customerEmail = strtolower(trim((string) $input['customer_email']));

        $order = DB::transaction(function () use ($cart, $user, $input, $address, $cep, $uf, $customerEmail, $idempotencyKey, $fingerprint, $settings): Order {
            /** @var Cart $lockedCart */
            $lockedCart = Cart::query()->whereKey($cart->id)->with(['items.product', 'items.variant', 'shippingQuote'])->lockForUpdate()->firstOrFail();

            $existing = Order::where('idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                abort_unless($existing->checkout_cart_id === $cart->id && $existing->checkout_fingerprint === $fingerprint, 409, 'Chave de pedido já utilizada.');

                return $existing;
            }
            if ($lockedCart->items->isEmpty()) {
                throw ValidationException::withMessages(['cart' => ['Seu carrinho está vazio.']]);
            }

            $summary = $this->carts->buildSummary($lockedCart, $user, $customerEmail, $uf);
            if (count($summary['items']) === 0) {
                throw ValidationException::withMessages(['cart' => ['Nenhum item válido disponível no carrinho.']]);
            }

            $quote = null;
            if (! empty($input['shipping_quote_id'])) {
                $quote = ShippingQuote::query()->whereKey((int) $input['shipping_quote_id'])->where('cart_id', $lockedCart->id)->lockForUpdate()->first();
            }
            if (! $quote && empty($input['shipping_quote_id']) && $lockedCart->shippingQuote) {
                $quote = $lockedCart->shippingQuote;
            }
            if (! $quote || $quote->cart_id !== $lockedCart->id || $quote->expires_at->isPast() || $quote->cep !== $cep || $quote->items_fingerprint !== $this->shipping->cartFingerprint($lockedCart)) {
                throw ValidationException::withMessages(['shipping_quote_id' => ['Cotação de frete ausente, expirada ou divergente do CEP. Calcule o frete novamente.']]);
            }

            $lockedCart->update(['shipping_quote_id' => $quote->id, 'shipping_cep' => $cep]);
            $summary = $this->carts->buildSummary($lockedCart, $user, $customerEmail, $uf);
            $shippingCents = $summary['coupon_code'] && $summary['shipping_quote'] !== null
                ? (int) $summary['shipping_quote']['price_cents']
                : (int) $quote->price_cents;

            $subtotalCents = (int) $summary['subtotal_cents'];
            $discountCents = (int) $summary['discount_cents'];
            $totalCents = max(0, $subtotalCents - $discountCents + $shippingCents);

            $orderNumber = 'MF-'.now()->format('Ymd').'-'.strtoupper(Str::random(6));
            $order = Order::query()->create([
                'order_number' => $orderNumber,
                'public_token' => Str::uuid()->toString(),
                'idempotency_key' => $idempotencyKey,
                'checkout_cart_id' => $lockedCart->id, 'checkout_fingerprint' => $fingerprint,
                'payment_provider' => $settings->provider(), 'payment_environment' => $settings->get($settings->provider(), 'environment'), 'payment_method' => $input['payment_method'],
                'user_id' => $user?->id,
                'is_guest' => $user === null,
                'customer_name' => trim((string) $input['customer_name']),
                'customer_email' => $customerEmail,
                'customer_phone' => trim((string) $input['customer_phone']),
                'customer_cpf_cnpj' => $input['customer_cpf_cnpj'] ?? null,
                'shipping_address_snapshot' => [
                    'recipient_name' => (string) ($address['recipient_name'] ?? $input['customer_name']),
                    'cep' => $cep,
                    'street' => (string) $address['street'],
                    'number' => (string) $address['number'],
                    'complement' => $address['complement'] ?? null,
                    'neighborhood' => (string) $address['neighborhood'],
                    'city' => (string) $address['city'],
                    'state' => $uf,
                ],
                'shipping_service_snapshot' => [
                    'quote_id' => $quote->id,
                    'provider' => $quote->provider,
                    'service_code' => $quote->service_code,
                    'service_name' => $quote->service_name,
                    'carrier' => $quote->carrier,
                    'estimated_days' => $quote->estimated_days,
                    'is_fallback' => $quote->is_fallback,
                ],
                'subtotal_cents' => $subtotalCents,
                'discount_cents' => $discountCents,
                'coupon_code' => $summary['coupon_code'],
                'shipping_cents' => $shippingCents,
                'tax_cents' => 0,
                'total_cents' => $totalCents,
                'status' => OrderStatus::PendingPayment,
                'notes_customer' => $input['notes_customer'] ?? null,
                'stock_reserved_until' => now()->addMinutes(15),
            ]);

            $lineTotals = array_map(static fn (array $line): int => max(0, (int) $line['line_total_cents']), $summary['items']);
            $discountAllocations = $this->orderCost->allocateOrderDiscounts($lineTotals, $discountCents);

            foreach ($summary['items'] as $idx => $line) {
                $wholesaleDiscountCents = (int) ($line['wholesale_discount_cents'] ?? 0);
                $lineTotalCents = (int) $line['line_total_cents'];
                $allocOrderDiscount = $discountAllocations[$idx] ?? 0;
                OrderItem::query()->create([
                    'order_id' => $order->id,
                    'product_id' => $line['product_id'],
                    'product_variant_id' => $line['variant_id'],
                    'product_name_snapshot' => $line['product_name'],
                    'variant_name_snapshot' => $line['variant_name'],
                    'sku_snapshot' => $line['sku'],
                    'quantity' => $line['quantity'],
                    'unit_price_cents' => $line['unit_price_cents'],
                    'discount_cents' => $wholesaleDiscountCents * $line['quantity'],
                    'order_discount_allocated_cents' => $allocOrderDiscount,
                    'total_cents' => $lineTotalCents,
                    'net_revenue_cents' => max(0, $lineTotalCents - $allocOrderDiscount),
                    'weight_grams_snapshot' => (int) ($line['weight_grams'] ?? 200),
                    'wholesale_rule_id' => $line['wholesale_rule_id'] ?? null,
                    'wholesale_rule_name' => $line['wholesale_rule_name'] ?? null,
                    'wholesale_tier_min_qty' => $line['wholesale_tier_min_qty'] ?? null,
                    'wholesale_discount_cents' => $wholesaleDiscountCents,
                    'wholesale_unit_price_cents' => ! empty($line['wholesale_applied']) ? $line['unit_price_cents'] : null,
                    'original_unit_price_cents' => $line['original_price_cents'] ?? $line['unit_price_cents'],
                ]);
            }

            $this->inventory->reserveForOrder($order, $lockedCart->items, 15);

            if ($summary['coupon_code']) {
                $coupon = Coupon::query()->where('code', $summary['coupon_code'])->lockForUpdate()->first();
                if ($coupon) {
                    $coupon->increment('uses_count');
                    CouponRedemption::query()->create([
                        'coupon_id' => $coupon->id,
                        'order_id' => $order->id,
                        'user_id' => $user?->id,
                        'customer_email' => $customerEmail,
                        'discount_cents' => (int) $summary['coupon_discount_cents'],
                    ]);
                }
            }

            OrderStatusHistory::query()->create([
                'order_id' => $order->id,
                'user_id' => $user?->id,
                'from_status' => null,
                'to_status' => OrderStatus::PendingPayment->value,
                'note' => 'Pedido criado aguardando pagamento.',
            ]);

            $lockedCart->items()->delete();
            $lockedCart->update([
                'coupon_code' => null,
                'shipping_service_code' => null,
                'shipping_quote_id' => null,
            ]);

            app(OrderEmailService::class)->statusChanged($order);

            return $order;
        });

        if (($input['defer_payment'] ?? false) && $order->payment_provider === 'mercadopago') {
            return ['order' => $order->fresh(['items', 'latestPayment', 'statusHistories', 'shipment']), 'payment' => $order->latestPayment];
        }
        $method = PaymentMethod::from((string) $input['payment_method']);
        $payment = $this->payments->createOrderPayment(
            $order,
            $method,
            is_array($input['payment_data'] ?? null) ? $input['payment_data'] : [],
            hash('sha256', $idempotencyKey.':pay:1'),
        );

        if ($payment->status === PaymentStatus::Approved) {
            $this->webhooks->applyPaymentTransition($payment, PaymentStatus::Approved, $payment->fee_cents, 'Aprovação imediata na criação do pagamento');
        } elseif ($payment->status === PaymentStatus::Rejected) {
            $this->webhooks->applyPaymentTransition($payment, PaymentStatus::Rejected, 0, $payment->failure_reason ?? 'Pagamento recusado');
        } elseif ($payment->status === PaymentStatus::Expired) {
            $this->webhooks->applyPaymentTransition($payment, PaymentStatus::Expired, 0, 'Pagamento expirado');
        }

        return ['order' => $order->fresh(['items', 'latestPayment', 'statusHistories', 'shipment']), 'payment' => $payment->fresh()];
    }

    /**
     * @param  array<string, mixed>  $paymentInput
     */
    public function retryPayment(Order $order, PaymentMethod $method, array $paymentInput, string $idempotencyKey): Payment
    {
        if (! in_array($order->status, [OrderStatus::PendingPayment, OrderStatus::PaymentFailed], true)) {
            throw ValidationException::withMessages(['order' => ['Este pedido não aceita nova tentativa de pagamento no status atual.']]);
        }

        $existing = Payment::query()->where('idempotency_key', $idempotencyKey)->first();
        if ($existing) {
            abort_unless($existing->order_id === $order->id && $existing->request_fingerprint === PaymentSettings::digest(['method' => $method->value, 'input' => $paymentInput]), 409, 'Chave já utilizada.');

            return $existing;
        }

        abort_if($order->payments()->whereIn('status', ['processing', 'unknown', 'pending', 'approved'])->exists(), 409, 'Já existe pagamento em andamento. Consulte o pedido.');

        // Re-reserve stock if previous failure released reservation
        DB::transaction(function () use ($order): void {
            $hasActiveReservation = $order->items()->exists() && StockReservation::query()
                ->where('order_id', $order->id)
                ->where('status', 'active')
                ->exists();
            if (! $hasActiveReservation) {
                $fakeCartItems = $order->items->map(function (OrderItem $oi): CartItem {
                    $ci = new CartItem([
                        'product_id' => $oi->product_id,
                        'product_variant_id' => $oi->product_variant_id,
                        'quantity' => $oi->quantity,
                    ]);
                    $ci->setRelation('product', Product::find($oi->product_id));

                    return $ci;
                });
                $this->inventory->reserveForOrder($order, $fakeCartItems, 30);
            }
            $order->update(['status' => OrderStatus::PendingPayment, 'stock_reserved_until' => now()->addMinutes(15)]);
        });

        $payment = $this->payments->createOrderPayment($order, $method, $paymentInput, $idempotencyKey);
        if ($payment->status === PaymentStatus::Approved) {
            $this->webhooks->applyPaymentTransition($payment, PaymentStatus::Approved, $payment->fee_cents, 'Aprovação em nova tentativa');
        } elseif ($payment->status === PaymentStatus::Rejected) {
            $this->webhooks->applyPaymentTransition($payment, PaymentStatus::Rejected, 0, $payment->failure_reason ?? 'Pagamento recusado');
        }

        return $payment->fresh();
    }
}
