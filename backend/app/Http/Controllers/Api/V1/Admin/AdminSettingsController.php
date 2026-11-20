<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Admin;

use App\Domain\Payments\Services\PaymentSettings;
use App\Domain\Security\Services\AuditLogger;
use App\Domain\Settings\Services\StoreSettingsService;
use App\Domain\Shipping\Providers\CorreiosProvider;
use App\Http\Controllers\Controller;
use App\Models\IntegrationSetting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\Rule;

class AdminSettingsController extends Controller
{
    public function __construct(
        private readonly StoreSettingsService $settings,
        private readonly AuditLogger $audit,
    ) {}

    public function showStore(): JsonResponse
    {
        return response()->json(['data' => $this->settings->getPublicConfig()]);
    }

    public function updateStore(Request $request): JsonResponse
    {
        $allowedKeys = array_keys(StoreSettingsService::defaults());
        $request->validate(['payment_provider' => ['sometimes', Rule::in(['mercadopago', 'asaas'])]]);
        $payload = $request->only($allowedKeys);

        if ($payload === []) {
            return response()->json(['message' => 'Nenhuma configuração válida enviada.'], 422);
        }

        $this->settings->setMany($payload, 'storefront', true);
        $this->audit->record('settings.store_updated', $request->user(), 'store_setting', null, null, ['keys' => array_keys($payload)], $request);

        return response()->json(['data' => $this->settings->getPublicConfig()]);
    }

    public function listIntegrations(): JsonResponse
    {
        $providers = ['mercadopago', 'asaas', 'melhorenvio', 'correios', 'smtp', 'analytics', 'openai'];
        $existing = IntegrationSetting::query()->get()->keyBy('provider');

        $settings = app(PaymentSettings::class);
        $list = array_map(function (string $provider) use ($existing, $settings): array {
            /** @var IntegrationSetting|null $row */
            $row = $existing->get($provider);

            return [
                'provider' => $provider,
                'environment' => $settings->get($provider, 'environment', 'sandbox'),
                'public_config' => $row ? $row->public_config : [],
                'is_active' => (bool) $settings->get($provider, 'enabled', false),
                'has_credentials' => is_array($row?->encrypted_credentials) && count(array_filter($row->encrypted_credentials)) > 0,
                'credential_keys' => is_array($row?->encrypted_credentials) ? array_keys(array_filter($row->encrypted_credentials)) : [],
                'last_healthcheck_at' => $row?->last_healthcheck_at?->toIso8601String(),
                'last_healthcheck_status' => $row?->last_healthcheck_status,
            ];
        }, $providers);

        return response()->json(['data' => $list]);
    }

    public function updateIntegration(Request $request, string $provider): JsonResponse
    {
        if (! in_array($provider, ['mercadopago', 'asaas', 'melhorenvio', 'correios', 'smtp', 'analytics', 'openai'], true)) {
            return response()->json(['message' => 'Provedor inválido.'], 404);
        }

        $validated = $request->validate([
            'environment' => ['required', Rule::in(['sandbox', 'production'])],
            'public_config' => ['nullable', 'array'],
            'credentials' => ['nullable', 'array'],
            'is_active' => ['boolean'],
        ]);

        $publicKeys = match ($provider) {
            'correios' => ['origin_zip', 'services'],
            'mercadopago' => ['public_key'],
            'openai' => ['base_url', 'support_model', 'catalog_model', 'replenishment_model'],
            default => [],
        };
        $secretKeys = match ($provider) {
            'mercadopago' => ['access_token', 'webhook_secret'],
            'asaas' => ['api_key', 'webhook_token'],
            'correios' => ['username', 'password', 'card', 'contract', 'regional'],
            'openai' => ['api_key', 'organization'],
            default => ['token', 'access_token'],
        };
        abort_if(array_diff(array_keys($validated['public_config'] ?? []), $publicKeys) !== [] || array_diff(array_keys($validated['credentials'] ?? []), $secretKeys) !== [], 422, 'Campos de integração inválidos.');
        $setting = IntegrationSetting::query()->firstOrNew(['provider' => $provider]);
        $currentCreds = is_array($setting->encrypted_credentials) ? $setting->encrypted_credentials : [];

        if (! empty($validated['credentials'])) {
            foreach ($validated['credentials'] as $k => $v) {
                if (is_string($v) && trim($v) !== '') {
                    $currentCreds[$k] = trim($v);
                }
            }
        }

        $setting->fill([
            'environment' => $validated['environment'],
            'public_config' => $validated['public_config'] ?? ($setting->public_config ?? []),
            'encrypted_credentials' => $currentCreds,
            'is_active' => (bool) ($validated['is_active'] ?? $setting->is_active ?? true),
        ]);
        $setting->save();

        $this->settings->forgetCache();
        $this->audit->record('integration.updated', $request->user(), 'integration_setting', $setting->id, null, [
            'provider' => $provider,
            'environment' => $setting->environment,
            'is_active' => $setting->is_active,
        ], $request);

        return response()->json([
            'data' => [
                'provider' => $setting->provider,
                'environment' => $setting->environment,
                'public_config' => $setting->public_config,
                'is_active' => $setting->is_active,
                'has_credentials' => count(array_filter($currentCreds)) > 0,
                'credential_keys' => array_keys(array_filter($currentCreds)),
            ],
        ]);
    }

    public function healthcheckIntegration(string $provider): JsonResponse
    {
        $setting = IntegrationSetting::query()->where('provider', $provider)->first();
        $status = 'not_configured';

        if ($provider === 'asaas') {
            $settings = app(PaymentSettings::class);
            $key = $settings->get('asaas', 'api_key');
            if ($key) {
                $base = $settings->get('asaas', 'environment') === 'production' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
                $resp = Http::timeout(6)->withHeaders(['access_token' => $key, 'User-Agent' => 'MisturaFeminina/1.0'])->get($base.'/customers', ['limit' => 1]);
                $status = $resp->successful() ? 'connected' : 'error_http_'.$resp->status();
            }
        } elseif ($provider === 'correios') {
            $status = app(CorreiosProvider::class)->isConfigured() ? 'configured' : 'not_configured';
        } elseif ($provider === 'mercadopago') {
            $token = $setting?->encrypted_credentials['access_token'] ?? config('services.mercadopago.access_token');
            if (is_string($token) && $token !== '') {
                $resp = Http::timeout(6)->withToken($token)->get('https://api.mercadopago.com/users/me');
                $status = $resp->successful() ? 'connected' : 'error_http_'.$resp->status();
            }
        } elseif ($provider === 'melhorenvio') {
            $token = $setting?->encrypted_credentials['access_token'] ?? $setting?->encrypted_credentials['token'] ?? config('services.melhor_envio.token');
            if (is_string($token) && $token !== '') {
                $base = ($setting ? $setting->environment : 'sandbox') === 'production'
                    ? 'https://melhorenvio.com.br'
                    : 'https://sandbox.melhorenvio.com.br';
                $resp = Http::timeout(6)->withToken($token)->acceptJson()->get($base.'/api/v2/me');
                $status = $resp->successful() ? 'connected' : 'error_http_'.$resp->status();
            }
        } elseif ($provider === 'openai') {
            $token = $setting?->encrypted_credentials['api_key'] ?? config('services.openai.api_key');
            $baseUrl = rtrim((string) ($setting?->public_config['base_url'] ?? config('services.openai.base_url', 'https://api.openai.com/v1')), '/');
            if (is_string($token) && $token !== '') {
                $resp = Http::timeout(6)->withToken($token)->acceptJson()->get($baseUrl.'/models');
                $status = $resp->successful() ? 'connected' : 'error_http_'.$resp->status();
            }
        } elseif ($setting && $setting->is_active) {
            $status = 'configured';
        }

        if ($setting) {
            $setting->update(['last_healthcheck_at' => now(), 'last_healthcheck_status' => $status]);
        }

        return response()->json([
            'data' => [
                'provider' => $provider,
                'status' => $status,
                'checked_at' => now()->toIso8601String(),
            ],
        ]);
    }
}
