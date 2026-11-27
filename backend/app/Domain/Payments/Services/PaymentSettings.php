<?php

declare(strict_types=1);

namespace App\Domain\Payments\Services;

use App\Domain\Settings\Services\StoreSettingsService;
use App\Models\IntegrationSetting;

class PaymentSettings
{
    public function get(string $provider, string $key, mixed $default = null): mixed
    {
        $row = IntegrationSetting::where('provider', $provider)->first();
        if ($row) {
            if ($key === 'enabled') {
                return $row->is_active;
            }
            if ($key === 'environment') {
                return $row->environment;
            }
            $value = ($row->encrypted_credentials ?? [])[$key] ?? ($row->public_config ?? [])[$key] ?? null;
            if ($value !== null && $value !== '') {
                return $value;
            }
        }

        return config("checkout.$provider.$key", $default);
    }

    public function provider(): string
    {
        $value = app(StoreSettingsService::class)->getPublicConfig()['payment_provider'] ?? config('checkout.provider');

        return in_array($value, ['mercadopago', 'plupag', 'asaas'], true) ? $value : 'mercadopago';
    }

    public function available(?string $provider = null): bool
    {
        $provider ??= $this->provider();
        if (! $this->get($provider, 'enabled') || ! in_array($this->get($provider, 'environment'), ['sandbox', 'production'], true)) {
            return false;
        }
        $requiredKeys = match ($provider) {
            'mercadopago' => ['access_token', 'public_key', 'webhook_secret'],
            'plupag' => ['api_key', 'api_secret'],
            default => ['api_key', 'webhook_token'],
        };
        foreach ($requiredKeys as $key) {
            if (! $this->get($provider, $key)) {
                return false;
            }
        }

        return true;
    }

    /**
     * @return array<int, array{id: string, name: string, environment: string, public_key: string|null, methods: string[]}>
     */
    public function availableProviders(): array
    {
        $all = [
            'mercadopago' => [
                'id' => 'mercadopago',
                'name' => 'Mercado Pago',
                'environment' => $this->get('mercadopago', 'environment', 'sandbox'),
                'public_key' => $this->get('mercadopago', 'public_key'),
                'methods' => ['pix', 'credit_card', 'boleto'],
            ],
            'plupag' => [
                'id' => 'plupag',
                'name' => 'Plupag',
                'environment' => $this->get('plupag', 'environment', 'sandbox'),
                'public_key' => $this->get('plupag', 'public_key'),
                'methods' => ['pix', 'credit_card'],
            ],
        ];

        $active = [];
        foreach ($all as $provider => $config) {
            if ($this->available($provider)) {
                $active[] = $config;
            }
        }

        return $active;
    }

    public function publicConfig(): array
    {
        $provider = $this->provider();

        return [
            'enabled' => $this->available(),
            'provider' => $provider,
            'environment' => $this->get($provider, 'environment'),
            'public_key' => $provider === 'mercadopago' && $this->available('mercadopago') ? $this->get('mercadopago', 'public_key') : null,
            'plupag_public_key' => $this->available('plupag') ? $this->get('plupag', 'public_key') : null,
            'available_providers' => $this->availableProviders(),
        ];
    }

    public static function digest(array $data): string
    {
        foreach ($data as &$value) {
            if (is_array($value)) {
                $value = self::sort($value);
            }
        }
        ksort($data);

        return hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
    }

    private static function sort(array $data): array
    {
        foreach ($data as &$value) {
            if (is_array($value)) {
                $value = self::sort($value);
            }
        }
        ksort($data);

        return $data;
    }

    public static function cents(mixed $value): int
    {
        $value = str_replace(',', '.', (string) $value);
        abort_unless(is_numeric($value) && is_finite((float) $value), 502, 'Valor monetário inválido.');

        return (int) round((float) $value * 100);
    }

    public static function document(string $number): bool
    {
        if (! preg_match('/^(\d{11}|\d{14})$/D', $number) || preg_match('/^(\d)\1+$/D', $number)) {
            return false;
        }
        $base = substr($number, 0, -2);
        for ($round = 0; $round < 2; $round++) {
            $sum = 0;
            $length = strlen($base);
            for ($i = 0; $i < $length; $i++) {
                $weight = strlen($number) === 11 ? $length + 1 - $i : (($length - 1 - $i) % 8) + 2;
                $sum += (int) $base[$i] * $weight;
            }
            $digit = $sum % 11 < 2 ? 0 : 11 - $sum % 11;
            if ((int) $number[$length] !== $digit) {
                return false;
            }
            $base .= $digit;
        }

        return true;
    }
}
