<?php

declare(strict_types=1);

namespace App\Domain\Shipping\Providers;

use App\Domain\Shipping\Contracts\ShippingProvider;
use App\Models\IntegrationSetting;
use Illuminate\Support\Facades\Http;

class MelhorEnvioProvider implements ShippingProvider
{
    public function code(): string
    {
        return 'melhor_envio';
    }

    public function isConfigured(): bool
    {
        $setting = IntegrationSetting::query()->where('provider', 'melhorenvio')->first();
        if (! $setting || ! $setting->is_active) {
            return false;
        }
        $token = $setting->encrypted_credentials['access_token'] ?? config('services.melhor_envio.token');

        return is_string($token) && $token !== '';
    }

    public function quote(string $originCep, string $destinationCep, array $items): array
    {
        $setting = IntegrationSetting::query()->where('provider', 'melhorenvio')->first();
        $token = $setting?->encrypted_credentials['access_token'] ?? config('services.melhor_envio.token');
        if (! is_string($token) || $token === '') {
            return [];
        }

        $baseUrl = ($setting ? $setting->environment : 'sandbox') === 'production'
            ? 'https://www.melhorenvio.com.br'
            : 'https://sandbox.melhorenvio.com.br';

        $userAgent = $setting?->public_config['user_agent'] ?? 'Mistura Feminina Cosmeticos (suporte@misturafeminina.local)';

        $products = array_map(fn (array $item): array => [
            'id' => $item['id'],
            'width' => max(11, $item['width']),
            'height' => max(2, $item['height']),
            'length' => max(16, $item['length']),
            'weight' => round(max(0.05, $item['weight_grams'] / 1000), 3),
            'insurance_value' => round($item['insurance_cents'] / 100, 2),
            'quantity' => $item['quantity'],
        ], $items);

        $response = Http::timeout(8)
            ->withHeaders([
                'Authorization' => 'Bearer '.$token,
                'Accept' => 'application/json',
                'User-Agent' => (string) $userAgent,
            ])
            ->post($baseUrl.'/api/v2/me/shipment/calculate', [
                'from' => ['postal_code' => $originCep],
                'to' => ['postal_code' => $destinationCep],
                'products' => $products,
                'options' => [
                    'receipt' => false,
                    'own_hand' => false,
                    'collect' => false,
                ],
            ]);

        if (! $response->successful()) {
            throw new \RuntimeException('Melhor Envio retornou status '.$response->status());
        }

        $rows = $response->json();
        if (! is_array($rows)) {
            return [];
        }

        $quotes = [];
        foreach ($rows as $row) {
            if (! is_array($row) || ! empty($row['error']) || empty($row['custom_price'])) {
                continue;
            }
            $price = (float) $row['custom_price'];
            if ($price <= 0) {
                continue;
            }
            $quotes[] = [
                'provider' => $this->code(),
                'service_code' => 'me_'.($row['id'] ?? 'std'),
                'service_name' => (string) ($row['name'] ?? 'Frete'),
                'carrier' => (string) ($row['company']['name'] ?? 'Transportadora'),
                'price_cents' => (int) round($price * 100),
                'estimated_days' => max(1, (int) ($row['custom_delivery_time'] ?? $row['delivery_time'] ?? 5)),
                'raw' => $row,
            ];
        }

        return $quotes;
    }
}
