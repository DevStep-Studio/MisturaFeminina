<?php

declare(strict_types=1);

namespace App\Domain\Shipping\Providers;

use App\Domain\Shipping\Contracts\ShippingProvider;
use App\Models\IntegrationSetting;
use Illuminate\Support\Facades\Http;

class CorreiosProvider implements ShippingProvider
{
    public function code(): string
    {
        return 'correios';
    }

    public function isConfigured(): bool
    {
        $setting = IntegrationSetting::query()->where('provider', 'correios')->first();
        if (! $setting || ! $setting->is_active) {
            return false;
        }
        $token = $setting->encrypted_credentials['token'] ?? config('services.correios.token');

        return is_string($token) && $token !== '';
    }

    public function quote(string $originCep, string $destinationCep, array $items): array
    {
        $setting = IntegrationSetting::query()->where('provider', 'correios')->first();
        $token = $setting?->encrypted_credentials['token'] ?? config('services.correios.token');
        if (! is_string($token) || $token === '') {
            return [];
        }

        $totalWeightGrams = max(300, array_sum(array_map(fn (array $i): int => $i['weight_grams'] * $i['quantity'], $items)));
        $baseUrl = ($setting ? $setting->environment : 'sandbox') === 'production'
            ? 'https://api.correios.com.br'
            : 'https://apihom.correios.com.br';

        $quotes = [];
        foreach (['03220' => 'SEDEX', '03298' => 'PAC'] as $serviceCode => $label) {
            $resp = Http::timeout(6)
                ->withToken($token)
                ->get($baseUrl.'/preco/v1/nacional/'.$serviceCode, [
                    'cepOrigem' => $originCep,
                    'cepDestino' => $destinationCep,
                    'psObjeto' => (string) $totalWeightGrams,
                    'tpObjeto' => '2',
                    'comprimento' => '20',
                    'largura' => '16',
                    'altura' => '10',
                ]);

            if (! $resp->successful()) {
                continue;
            }
            $data = $resp->json();
            $rawPrice = str_replace(',', '.', (string) ($data['pcFinal'] ?? '0'));
            $price = (float) $rawPrice;
            if ($price <= 0) {
                continue;
            }
            $quotes[] = [
                'provider' => $this->code(),
                'service_code' => 'correios_'.$serviceCode,
                'service_name' => 'Correios '.$label,
                'carrier' => 'Correios',
                'price_cents' => (int) round($price * 100),
                'estimated_days' => max(1, (int) ($data['prazoEntrega'] ?? ($serviceCode === '03220' ? 3 : 7))),
                'raw' => is_array($data) ? $data : [],
            ];
        }

        return $quotes;
    }
}
