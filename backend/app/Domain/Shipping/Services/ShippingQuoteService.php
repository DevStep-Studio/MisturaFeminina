<?php

declare(strict_types=1);

namespace App\Domain\Shipping\Services;

use App\Domain\Payments\Services\PaymentSettings;
use App\Domain\Settings\Services\StoreSettingsService;
use App\Domain\Shipping\Contracts\ShippingProvider;
use App\Domain\Shipping\Providers\CorreiosProvider;
use App\Domain\Shipping\Providers\MelhorEnvioProvider;
use App\Models\Cart;
use App\Models\Product;
use App\Models\ShippingQuote;
use App\Models\ShippingRule;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class ShippingQuoteService
{
    public function __construct(
        private readonly StoreSettingsService $settings,
        private readonly MelhorEnvioProvider $melhorEnvio,
        private readonly CorreiosProvider $correios,
    ) {}

    private function itemsFingerprint(array $items): string
    {
        $normalized = array_map(fn (array $item): array => ['id' => (string) $item['id'], 'quantity' => (int) $item['quantity'], 'price' => (int) $item['insurance_cents'], 'weight' => (int) $item['weight_grams'], 'width' => (int) $item['width'], 'height' => (int) $item['height'], 'length' => (int) $item['length']], $items);
        usort($normalized, fn (array $a, array $b): int => strcmp($a['id'], $b['id']));

        return PaymentSettings::digest($normalized);
    }

    public function cartFingerprint(Cart $cart): string
    {
        return $this->itemsFingerprint($cart->items()->with(['product', 'variant'])->get()->map(fn ($item): array => ['id' => $item->variant->sku, 'quantity' => $item->quantity, 'insurance_cents' => $item->variant->effectivePriceCents(), 'weight_grams' => $item->variant->weight_grams ?? $item->product->weight_grams, 'width' => $item->variant->width_cm ?? $item->product->width_cm, 'height' => $item->variant->height_cm ?? $item->product->height_cm, 'length' => $item->variant->length_cm ?? $item->product->length_cm])->all());
    }

    public function normalizeCep(string $cep): string
    {
        $digits = preg_replace('/\D/', '', $cep) ?? '';
        if (strlen($digits) !== 8 || preg_match('/^(\d)\1{7}$/', $digits) === 1) {
            throw ValidationException::withMessages(['cep' => ['CEP inválido. Informe 8 dígitos numéricos válidos.']]);
        }

        return $digits;
    }

    public function inferUfFromCep(string $cepDigits): string
    {
        $prefix = (int) substr($cepDigits, 0, 2);

        return match (true) {
            $prefix >= 1 && $prefix <= 19 => 'SP',
            $prefix >= 20 && $prefix <= 28 => 'RJ',
            $prefix === 29 => 'ES',
            $prefix >= 30 && $prefix <= 39 => 'MG',
            $prefix >= 40 && $prefix <= 48 => 'BA',
            $prefix === 49 => 'SE',
            $prefix >= 50 && $prefix <= 56 => 'PE',
            $prefix === 57 => 'AL',
            $prefix === 58 => 'PB',
            $prefix === 59 => 'RN',
            $prefix >= 60 && $prefix <= 63 => 'CE',
            $prefix === 64 => 'PI',
            $prefix === 65 => 'MA',
            $prefix >= 66 && $prefix <= 68 => 'PA',
            $prefix === 69 => 'AM',
            $prefix >= 70 && $prefix <= 73 => 'DF',
            $prefix >= 74 && $prefix <= 76 => 'GO',
            $prefix === 77 => 'TO',
            $prefix === 78 => 'MT',
            $prefix === 79 => 'MS',
            $prefix >= 80 && $prefix <= 87 => 'PR',
            $prefix >= 88 && $prefix <= 89 => 'SC',
            default => 'RS',
        };
    }

    /**
     * @param  list<array{id: string, width: int, height: int, length: int, weight_grams: int, insurance_cents: int, quantity: int}>  $items
     * @return array{cep: string, uf: string, fallback_used: bool, notice: string|null, options: list<array<string, mixed>>}
     */
    public function quoteForItems(string $rawCep, array $items, int $subtotalCents, ?Cart $cart = null): array
    {
        $cep = $this->normalizeCep($rawCep);
        $fingerprint = $this->itemsFingerprint($items);
        $uf = $this->inferUfFromCep($cep);
        $config = $this->settings->getPublicConfig();
        $originCep = preg_replace('/\D/', '', (string) ($config['origin_cep'] ?? '01001000')) ?: '01001000';

        $externalOptions = [];
        $externalAttempted = false;

        /** @var list<ShippingProvider> $providers */
        $providers = [$this->melhorEnvio, $this->correios];
        foreach ($providers as $provider) {
            if (! $provider->isConfigured()) {
                continue;
            }
            $externalAttempted = true;
            try {
                $quotes = $provider->quote($originCep, $cep, $items);
                foreach ($quotes as $q) {
                    $externalOptions[] = $q;
                }
            } catch (ValidationException $e) {
                throw $e;
            } catch (\Throwable $e) {
                Log::warning('Shipping provider error', ['provider' => $provider->code()]);
            }
        }

        abort_if($externalAttempted && $externalOptions === [], 503, 'Nenhuma tarifa em tempo real disponível. Tente calcular o frete novamente.');

        $totalWeightGrams = max(100, array_sum(array_map(fn (array $i): int => $i['weight_grams'] * $i['quantity'], $items)));
        $now = now();

        $rules = ShippingRule::query()
            ->where('is_active', true)
            ->where(function ($q) use ($now): void {
                $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now);
            })
            ->where(function ($q) use ($now): void {
                $q->whereNull('ends_at')->orWhere('ends_at', '>=', $now);
            })
            ->get();

        $ruleOptions = [];
        $freeShippingActive = false;

        foreach ($rules as $rule) {
            if ($subtotalCents < $rule->min_subtotal_cents) {
                continue;
            }
            if ($rule->max_weight_grams !== null && $totalWeightGrams > $rule->max_weight_grams) {
                continue;
            }
            if (is_array($rule->regions_ufs) && count($rule->regions_ufs) > 0 && ! in_array($uf, $rule->regions_ufs, true)) {
                continue;
            }
            if ($rule->cep_prefix_start && $cep < str_pad($rule->cep_prefix_start, 8, '0')) {
                continue;
            }
            if ($rule->cep_prefix_end && $cep > str_pad($rule->cep_prefix_end, 8, '9')) {
                continue;
            }

            if ($rule->mode === 'free_rule') {
                if ($rule->free_shipping_above_cents === null || $subtotalCents >= $rule->free_shipping_above_cents) {
                    $freeShippingActive = true;
                }

                continue;
            }

            if ($rule->mode === 'table' && count($externalOptions) > 0) {
                continue;
            }

            $kg = max(1, (int) ceil($totalWeightGrams / 1000));
            $priceCents = $rule->base_price_cents + ($kg > 1 ? ($kg - 1) * $rule->price_per_kg_cents : 0);
            if ($rule->free_shipping_above_cents !== null && $subtotalCents >= $rule->free_shipping_above_cents) {
                $priceCents = 0;
            }

            $ruleOptions[] = [
                'provider' => $rule->mode === 'table' ? 'table_fallback' : $rule->mode,
                'service_code' => $rule->code,
                'service_name' => $rule->name,
                'carrier' => $rule->carrier,
                'price_cents' => max(0, $priceCents),
                'estimated_days' => max(1, $rule->estimated_days + $rule->extra_prep_days),
                'is_fallback' => $rule->mode === 'table',
                'raw' => ['rule_id' => $rule->id, 'uf' => $uf],
            ];
        }

        $fallbackUsed = count($externalOptions) === 0;
        $combined = array_merge(
            array_map(fn (array $opt): array => [...$opt, 'is_fallback' => false], $externalOptions),
            $ruleOptions,
        );

        $globalFreeThreshold = (int) ($config['free_shipping_threshold_cents'] ?? 29900);
        if ($globalFreeThreshold > 0 && $subtotalCents >= $globalFreeThreshold) {
            $freeShippingActive = true;
        }

        if ($cart && $fingerprint !== $this->cartFingerprint($cart)) {
            throw ValidationException::withMessages(['cart' => 'Seu carrinho mudou durante a cotação. Calcule o frete novamente.']);
        }
        $persisted = [];
        foreach ($combined as $opt) {
            $finalPrice = $opt['price_cents'];
            if ($freeShippingActive && ! in_array($opt['provider'], ['motoboy'], true)) {
                $finalPrice = 0;
            }

            $quote = ShippingQuote::query()->create([
                'cart_id' => $cart?->id,
                'cep' => $cep,
                'provider' => $opt['provider'],
                'service_code' => $opt['service_code'],
                'service_name' => $opt['service_name'],
                'carrier' => $opt['carrier'],
                'price_cents' => $finalPrice,
                'estimated_days' => $opt['estimated_days'],
                'is_fallback' => $opt['is_fallback'],
                'raw_response' => $opt['raw'],
                'expires_at' => now()->addMinutes(15), 'items_fingerprint' => $cart ? $fingerprint : null,
            ]);

            $persisted[] = [
                'quote_id' => $quote->id, 'expires_at' => $quote->expires_at->toIso8601String(),
                'cep' => $quote->cep,
                'provider' => $quote->provider,
                'service_code' => $quote->service_code,
                'service_name' => $quote->service_name,
                'carrier' => $quote->carrier,
                'price_cents' => $quote->price_cents,
                'estimated_days' => $quote->estimated_days,
                'is_fallback' => $quote->is_fallback,
            ];
        }

        $notice = $fallbackUsed
            ? 'Tarifa calculada pelas modalidades cadastradas pela loja. Nenhuma transportadora online está configurada.'
            : null;

        return [
            'cep' => $cep,
            'uf' => $uf,
            'fallback_used' => $fallbackUsed,
            'notice' => $notice,
            'options' => $persisted,
        ];
    }

    /** @return array{cep: string, uf: string, fallback_used: bool, notice: string|null, options: list<array<string, mixed>>} */
    public function quoteForProduct(string $rawCep, Product $product, int $quantity = 1): array
    {
        $price = $product->effectivePriceCents();

        return $this->quoteForItems($rawCep, [[
            'id' => (string) $product->sku,
            'width' => $product->width_cm,
            'height' => $product->height_cm,
            'length' => $product->length_cm,
            'weight_grams' => $product->weight_grams,
            'insurance_cents' => $price,
            'quantity' => max(1, $quantity),
        ]], $price * max(1, $quantity));
    }
}
