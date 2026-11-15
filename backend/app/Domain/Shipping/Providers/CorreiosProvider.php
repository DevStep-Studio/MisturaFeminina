<?php

namespace App\Domain\Shipping\Providers;

use App\Domain\Payments\Services\PaymentSettings;
use App\Domain\Shipping\Contracts\ShippingProvider;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

class CorreiosProvider implements ShippingProvider
{
    public function __construct(private PaymentSettings $settings) {}

    public function code(): string
    {
        return 'correios';
    }

    private function setting(string $key): mixed
    {
        return $this->settings->get('correios', $key);
    }

    public function isConfigured(): bool
    {
        if (! $this->setting('enabled')) {
            return false;
        }
        foreach (['username', 'password', 'card', 'contract', 'regional'] as $key) {
            if (! $this->setting($key)) {
                return false;
            }
        }

        return in_array($this->setting('environment'), ['sandbox', 'production'], true);
    }

    private function base(): string
    {
        return $this->setting('environment') === 'production' ? 'https://api.correios.com.br' : 'https://apihom.correios.com.br';
    }

    private function tokenKey(): string
    {
        return 'checkout:correios:'.hash('sha256', json_encode(array_map(fn ($key) => $this->setting($key), ['environment', 'username', 'password', 'card', 'contract', 'regional']), JSON_THROW_ON_ERROR));
    }

    private function token(): string
    {
        $key = $this->tokenKey();
        if ($cached = Cache::get($key)) {
            return Crypt::decryptString($cached);
        }

        return Cache::lock($key.':lock', 15)->block(5, function () use ($key): string {
            if ($cached = Cache::get($key)) {
                return Crypt::decryptString($cached);
            }
            try {
                $response = Http::acceptJson()->withBasicAuth($this->setting('username'), $this->setting('password'))->connectTimeout(5)->timeout(15)->post($this->base().'/token/v1/autentica/cartaopostagem', ['numero' => $this->setting('card')]);
            } catch (\Throwable) {
                abort(503, 'Não foi possível autenticar nos Correios.');
            }
            abort_unless($response->successful() && is_string($response->json('token')), 503, 'Verifique as credenciais e APIs contratadas dos Correios.');
            try {
                $expires = Carbon::parse($response->json('expiraEm'), $response->json('zoneOffset') ?? 'America/Sao_Paulo')->subMinutes(5);
            } catch (\Throwable) {
                abort(503, 'Validade de token dos Correios inválida.');
            }
            abort_unless($expires->isFuture(), 503, 'Token dos Correios expirado.');
            Cache::put($key, Crypt::encryptString($response->json('token')), $expires);

            return $response->json('token');
        });
    }

    private function get(string $path, array $query, bool $retry = true): array
    {
        try {
            $response = Http::acceptJson()->withToken($this->token())->connectTimeout(5)->timeout(15)->get($this->base().$path, $query);
        } catch (\Throwable) {
            abort(503, 'Correios indisponíveis. Tente cotar novamente.');
        }
        if ($response->status() === 401 && $retry) {
            Cache::forget($this->tokenKey());

            return $this->get($path, $query, false);
        }

        return $response->successful() && is_array($response->json()) ? $response->json() : [];
    }

    public function quote(string $originCep, string $destinationCep, array $items): array
    {
        abort_unless($this->isConfigured(), 503, 'Configure as credenciais dos Correios.');
        $weight = 0;
        $length = 0;
        $width = 0;
        $height = 0;
        foreach ($items as $item) {
            $weight += $item['weight_grams'] * $item['quantity'];
            $length = max($length, $item['length']);
            $width = max($width, $item['width']);
            $height += $item['height'] * $item['quantity'];
        }
        if ($weight <= 0 || $weight > 30000 || min($length, $width, $height) <= 0 || max($length, $width, $height) > 100 || $length + $width + $height > 200) {
            throw ValidationException::withMessages(['cart' => 'Embalagem excede os limites de envio dos Correios.']);
        }
        $common = ['cepOrigem' => $this->setting('origin_zip') ?: $originCep, 'cepDestino' => $destinationCep, 'nuContrato' => $this->setting('contract'), 'nuDR' => $this->setting('regional')];
        $services = $this->setting('services');
        if (is_string($services)) {
            $services = explode(',', $services);
        }
        $rows = [];
        foreach (array_slice(is_array($services) ? $services : [], 0, 5) as $service) {
            [$code,$label] = array_pad(explode(':', trim($service), 2), 2, null);
            if (! preg_match('/^\d{5}$/D', $code)) {
                continue;
            }
            $price = $this->get('/preco/v1/nacional/'.$code, [...$common, 'psObjeto' => $weight, 'tpObjeto' => '2', 'comprimento' => $length, 'largura' => $width, 'altura' => $height]);
            $deadline = $this->get('/prazo/v1/nacional/'.$code, $common);
            if (! isset($price['pcFinal'],$deadline['prazoEntrega']) || isset($price['coErro']) || isset($deadline['coErro']) || ! is_numeric(str_replace(',', '.', (string) $price['pcFinal'])) || ! is_numeric($deadline['prazoEntrega']) || (int) $deadline['prazoEntrega'] < 1) {
                continue;
            }
            $cents = PaymentSettings::cents($price['pcFinal']);
            if ($cents < 0) {
                continue;
            }
            $rows[] = ['provider' => 'correios', 'service_code' => 'correios_'.$code, 'service_name' => 'Correios '.($label ?: $code), 'carrier' => 'Correios', 'price_cents' => $cents, 'estimated_days' => (int) $deadline['prazoEntrega'], 'raw' => []];
        }

        return $rows;
    }
}
