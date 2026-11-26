<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Models\MarketingIntegration;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;

class MarketingIntegrationsService
{
    public function __construct(
        private readonly MarketingBaselineInitializer $initializer,
        private readonly GoogleOAuthTokenHelper $oauth,
        private readonly GoogleMerchantFeedService $merchantFeed,
    ) {}

    /** @return list<array<string, mixed>> */
    public function list(): array
    {
        $this->initializer->ensureIntegrations();

        return MarketingIntegration::query()
            ->orderBy('id')
            ->get()
            ->map(fn (MarketingIntegration $row): array => $this->merchantFeed->sanitizeIntegrationForClient($row) ?? [])
            ->all();
    }

    /**
     * Saves integration settings/credentials (encrypting secrets) and runs a real verification check.
     *
     * @param  array{
     *   platform: string,
     *   account_id?: string|null,
     *   account_name?: string|null,
     *   property_id?: string|null,
     *   pixel_id?: string|null,
     *   encrypted_credentials?: array<string, mixed>|null,
     *   settings?: array<string, mixed>|null
     * }  $payload
     * @return array<string, mixed>
     */
    public function connect(array $payload): array
    {
        $this->initializer->ensureIntegrations();

        $integration = MarketingIntegration::query()
            ->where('platform', $payload['platform'])
            ->firstOrFail();

        $existingCreds = $this->merchantFeed->decryptCredentials($integration->encrypted_credentials);
        $incomingCreds = is_array($payload['encrypted_credentials'] ?? null) ? $payload['encrypted_credentials'] : [];

        foreach ($incomingCreds as $k => $v) {
            if ($v === null) {
                unset($existingCreds[$k]);
            } elseif (is_string($v) && trim($v) !== '') {
                $existingCreds[$k] = trim($v);
            }
        }

        $encryptedToStore = [];
        foreach ($existingCreds as $k => $plain) {
            if (is_string($plain) && $plain !== '') {
                $encryptedToStore[$k] = Crypt::encryptString($plain);
            }
        }

        $update = [
            'encrypted_credentials' => $encryptedToStore !== [] ? $encryptedToStore : null,
        ];

        foreach (['account_id', 'account_name', 'property_id', 'pixel_id'] as $field) {
            if (array_key_exists($field, $payload)) {
                $val = is_string($payload[$field]) ? trim($payload[$field]) : null;
                $update[$field] = $val !== '' ? $val : null;
            }
        }

        if (isset($payload['settings']) && is_array($payload['settings'])) {
            $update['settings'] = array_merge($integration->settings ?? [], $payload['settings']);
        }

        $integration->update($update);

        $check = $this->testConnection($integration->platform);

        return $check['data'];
    }

    /**
     * Performs a real, honest connectivity and credential validation against the target platform.
     *
     * @return array<string, mixed>
     */
    public function testConnection(string $platform): array
    {
        $this->initializer->ensureIntegrations();

        $integration = MarketingIntegration::query()->where('platform', $platform)->firstOrFail();
        $creds = $this->merchantFeed->decryptCredentials($integration->encrypted_credentials);
        $started = microtime(true);

        $result = match ($platform) {
            'google_analytics_4' => $this->verifyGa4($integration, $creds),
            'google_ads' => $this->verifyGoogleAds($integration, $creds),
            'google_merchant_center' => $this->verifyMerchantCenter($integration),
            default => $this->verifyGeneric($integration, $creds),
        };

        $latencyMs = (int) max(1, round((microtime(true) - $started) * 1000));

        $integration->update([
            'status' => $result['status'],
            'last_healthcheck_at' => now(),
            'last_synced_at' => $result['status'] === 'connected' ? now() : $integration->last_synced_at,
            'last_healthcheck_status' => $result['status'],
            'last_healthcheck_message' => $result['message'],
        ]);

        return [
            'status' => $result['status'],
            'latency_ms' => $latencyMs,
            'message' => $result['message'],
            'missing_fields' => $result['missing_fields'] ?? [],
            'data' => $this->merchantFeed->sanitizeIntegrationForClient($integration->fresh()),
        ];
    }

    /**
     * @param  array<string, mixed>  $creds
     * @return array{status: string, message: string, missing_fields: list<string>}
     */
    private function verifyGa4(MarketingIntegration $integration, array $creds): array
    {
        $measurementId = strtoupper(trim((string) ($integration->pixel_id ?? '')));
        $gtmId = strtoupper(trim((string) ($integration->settings['gtm_id'] ?? '')));
        $propertyId = preg_replace('/^properties\//i', '', trim((string) ($integration->property_id ?? ''))) ?? '';
        $saJson = trim((string) ($creds['service_account_json'] ?? ''));

        $validGa4Tag = $measurementId !== ''
            && preg_match('/^G-[A-Z0-9]{4,}$/', $measurementId) === 1
            && preg_match('/^G-X+$/', $measurementId) !== 1
            && $measurementId !== 'G-MFEMININA01';

        $validGtmTag = $gtmId !== ''
            && preg_match('/^GTM-[A-Z0-9]{4,}$/', $gtmId) === 1
            && preg_match('/^GTM-X+$/', $gtmId) !== 1;

        if ($measurementId !== '' && ! $validGa4Tag) {
            return [
                'status' => 'error',
                'message' => 'Measurement ID inválido. Utilize o formato real G-XXXXXXXXXX da propriedade GA4.',
                'missing_fields' => ['pixel_id'],
            ];
        }

        if ($propertyId !== '' && $saJson !== '') {
            try {
                $token = $this->oauth->tokenFromServiceAccount($saJson, [
                    'https://www.googleapis.com/auth/analytics.readonly',
                ]);

                $res = Http::withToken($token)
                    ->timeout(15)
                    ->acceptJson()
                    ->post("https://analyticsdata.googleapis.com/v1beta/properties/{$propertyId}:runReport", [
                        'dateRanges' => [['startDate' => '7daysAgo', 'endDate' => 'today']],
                        'metrics' => [['name' => 'sessions']],
                    ]);

                if (! $res->successful()) {
                    $err = (string) ($res->json('error.message') ?? 'HTTP '.$res->status());

                    return [
                        'status' => 'error',
                        'message' => "Falha ao consultar GA4 Data API (propriedade {$propertyId}): {$err}",
                        'missing_fields' => [],
                    ];
                }

                return [
                    'status' => 'connected',
                    'message' => 'GA4 Data API autenticada e respondendo com métricas reais da propriedade '.$propertyId.'.',
                    'missing_fields' => [],
                ];
            } catch (\Throwable $e) {
                return [
                    'status' => 'error',
                    'message' => 'Erro na autenticação GA4 Data API: '.$e->getMessage(),
                    'missing_fields' => [],
                ];
            }
        }

        if ($validGa4Tag || $validGtmTag) {
            $missing = [];
            if ($propertyId === '') {
                $missing[] = 'Property ID numérico da propriedade GA4 (ex.: 412345678)';
            }
            if ($saJson === '') {
                $missing[] = 'JSON da Service Account com permissão Leitor na propriedade GA4';
            }

            return [
                'status' => 'not_configured',
                'message' => 'Tag de coleta ativa na vitrine ('.($validGa4Tag ? $measurementId : $gtmId).'), porém falta Property ID + Service Account JSON para importar relatórios da GA4 Data API no painel.',
                'missing_fields' => $missing,
            ];
        }

        return [
            'status' => 'not_configured',
            'message' => 'Pendente de configuração: informe o Measurement ID (G-...) e/ou Property ID + Service Account JSON do Google Analytics 4.',
            'missing_fields' => ['pixel_id', 'property_id', 'service_account_json'],
        ];
    }

    /**
     * @param  array<string, mixed>  $creds
     * @return array{status: string, message: string, missing_fields: list<string>}
     */
    private function verifyGoogleAds(MarketingIntegration $integration, array $creds): array
    {
        $customerId = preg_replace('/\D+/', '', (string) ($integration->account_id ?? '')) ?? '';
        $devToken = trim((string) ($creds['developer_token'] ?? config('services.google_ads.developer_token', '')));
        $clientId = trim((string) ($creds['client_id'] ?? config('services.google_ads.client_id', '')));
        $clientSecret = trim((string) ($creds['client_secret'] ?? config('services.google_ads.client_secret', '')));
        $refreshToken = trim((string) ($creds['refresh_token'] ?? config('services.google_ads.refresh_token', '')));
        $loginCustomerId = preg_replace('/\D+/', '', (string) ($integration->settings['login_customer_id'] ?? '')) ?? '';

        $missing = [];
        if ($customerId === '') {
            $missing[] = 'Customer ID da conta Google Ads (ex.: 123-456-7890)';
        }
        if ($devToken === '') {
            $missing[] = 'Developer Token da Google Ads API';
        }
        if ($clientId === '' || $clientSecret === '' || $refreshToken === '') {
            $missing[] = 'Client ID, Client Secret e Refresh Token OAuth2';
        }

        if ($missing !== []) {
            return [
                'status' => 'not_configured',
                'message' => 'Conexão Google Ads pendente de credenciais obrigatórias da Google Ads API.',
                'missing_fields' => $missing,
            ];
        }

        try {
            $accessToken = $this->oauth->tokenFromRefreshToken($clientId, $clientSecret, $refreshToken);
            $headers = [
                'developer-token' => $devToken,
            ];
            if ($loginCustomerId !== '') {
                $headers['login-customer-id'] = $loginCustomerId;
            }

            $res = Http::withToken($accessToken)
                ->withHeaders($headers)
                ->timeout(15)
                ->acceptJson()
                ->post("https://googleads.googleapis.com/v17/customers/{$customerId}/googleAds:searchStream", [
                    'query' => 'SELECT customer.id, customer.descriptive_name, customer.currency_code FROM customer LIMIT 1',
                ]);

            if (! $res->successful()) {
                $err = (string) ($res->json('0.error.message') ?? $res->json('error.message') ?? 'HTTP '.$res->status());

                return [
                    'status' => 'error',
                    'message' => "Google Ads API recusou a consulta de leitura: {$err}",
                    'missing_fields' => [],
                ];
            }

            return [
                'status' => 'connected',
                'message' => "Conta Google Ads ({$integration->account_id}) conectada em modo seguro de leitura.",
                'missing_fields' => [],
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'error',
                'message' => 'Falha ao conectar no Google Ads: '.$e->getMessage(),
                'missing_fields' => [],
            ];
        }
    }

    /** @return array{status: string, message: string, missing_fields: list<string>} */
    private function verifyMerchantCenter(MarketingIntegration $integration): array
    {
        $check = $this->merchantFeed->inspectMerchantCenterConnection($integration);

        return [
            'status' => (string) $check['status'],
            'message' => (string) $check['message'],
            'missing_fields' => (array) ($check['missing_fields'] ?? []),
        ];
    }

    /**
     * @param  array<string, mixed>  $creds
     * @return array{status: string, message: string, missing_fields: list<string>}
     */
    private function verifyGeneric(MarketingIntegration $integration, array $creds): array
    {
        if (empty($integration->account_id) || $creds === []) {
            return [
                'status' => 'not_configured',
                'message' => "Credenciais de {$integration->name} ainda não configuradas.",
                'missing_fields' => ['account_id', 'access_token'],
            ];
        }

        return [
            'status' => 'not_configured',
            'message' => "Credenciais salvas para {$integration->name}; aguardando verificação da API externa.",
            'missing_fields' => [],
        ];
    }
}
