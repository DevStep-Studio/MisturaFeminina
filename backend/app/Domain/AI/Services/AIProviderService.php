<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use App\Domain\Settings\Services\StoreSettingsService;
use App\Models\IntegrationSetting;
use App\Models\StoreSetting;
use App\Models\User;
use Illuminate\Support\Facades\Http;

class AIProviderService
{
    public const CONFIG_SETTING_KEY = 'ai_central_config';

    public function __construct(
        private readonly StoreSettingsService $storeSettings,
    ) {}

    /** @return array<string, mixed> */
    public static function defaultConfig(): array
    {
        return [
            'provider' => 'openai',
            'base_url' => (string) config('services.openai.base_url', 'https://api.openai.com/v1'),
            'support_model' => 'gpt-4o-mini',
            'catalog_model' => 'gpt-4o-mini',
            'replenishment_model' => 'gpt-4o-mini',
            'max_tokens_per_operation' => 2500,
            'timeout_seconds' => 25,
            'max_retries' => 2,
            'daily_execution_limit' => 500,
            'daily_user_limit' => 100,
            'daily_budget_usd' => 15.0,
            'max_file_size_kb' => 5120,
            'max_batch_rows' => 500,
            'default_margin_pct' => 100.0,
            'default_lead_time_days' => 7,
            'safety_stock_days' => 3,
            'target_coverage_days' => 21,
            'auto_replenishment_schedule' => 'daily',
            'auto_replenishment_time' => '06:00',
            'naming_pattern' => '{produto} {marca} {tonalidade} — {volume}',
        ];
    }

    /** @return array<string, mixed> */
    public function getConfig(): array
    {
        $row = StoreSetting::query()->where('key', self::CONFIG_SETTING_KEY)->first();
        $saved = is_array($row?->value) && array_key_exists('val', $row->value) && is_array($row->value['val'])
            ? $row->value['val']
            : [];

        return array_merge(self::defaultConfig(), $saved);
    }

    /**
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    public function updateConfig(array $values): array
    {
        $allowed = array_keys(self::defaultConfig());
        $filtered = array_intersect_key($values, array_flip($allowed));
        $merged = array_merge($this->getConfig(), $filtered);
        $this->storeSettings->setMany([self::CONFIG_SETTING_KEY => $merged], 'ai', false);

        return $merged;
    }

    public function resolveApiKey(): ?string
    {
        $setting = IntegrationSetting::query()->where('provider', 'openai')->first();
        $dbKey = is_array($setting?->encrypted_credentials) ? ($setting->encrypted_credentials['api_key'] ?? null) : null;
        if (is_string($dbKey) && trim($dbKey) !== '') {
            return trim($dbKey);
        }

        $envKey = config('services.openai.api_key');

        return is_string($envKey) && trim($envKey) !== '' ? trim($envKey) : null;
    }

    /** @return array<string, mixed> */
    public function connectionStatus(): array
    {
        $cfg = $this->getConfig();
        $setting = IntegrationSetting::query()->where('provider', 'openai')->first();
        $apiKey = $this->resolveApiKey();
        $hasKey = $apiKey !== null;

        $status = 'not_configured';
        $label = 'Configuração necessária';
        if ($hasKey) {
            if ($setting?->last_healthcheck_status === 'connected') {
                $status = 'connected';
                $label = 'Conectado';
            } else {
                $status = 'configured';
                $label = 'Credencial configurada';
            }
        }

        return [
            'provider' => (string) $cfg['provider'],
            'status' => $status,
            'label' => $label,
            'has_api_key' => $hasKey,
            'masked_key' => $apiKey ? substr($apiKey, 0, 5).'...'.substr($apiKey, -4) : null,
            'base_url' => (string) $cfg['base_url'],
            'models' => [
                'support' => (string) $cfg['support_model'],
                'catalog' => (string) $cfg['catalog_model'],
                'replenishment' => (string) $cfg['replenishment_model'],
            ],
            'last_healthcheck_at' => $setting?->last_healthcheck_at?->toIso8601String(),
            'last_healthcheck_status' => $setting?->last_healthcheck_status,
        ];
    }

    /** @return array{status: string, latency_ms: int, message: string, http_status: int|null} */
    public function testConnection(?User $actor = null): array
    {
        $cfg = $this->getConfig();
        $apiKey = $this->resolveApiKey();
        if ($apiKey === null) {
            return [
                'status' => 'not_configured',
                'latency_ms' => 0,
                'message' => 'Configuração necessária: cadastre a chave OPENAI_API_KEY no servidor ou nas integrações do painel.',
                'http_status' => null,
            ];
        }

        $baseUrl = rtrim((string) $cfg['base_url'], '/');
        $started = microtime(true);

        try {
            $response = Http::timeout(max(3, min(30, (int) $cfg['timeout_seconds'])))
                ->withToken($apiKey)
                ->acceptJson()
                ->get("{$baseUrl}/models");

            $latency = (int) round((microtime(true) - $started) * 1000);
            $status = $response->successful() ? 'connected' : 'error_http_'.$response->status();

            IntegrationSetting::query()->updateOrCreate(
                ['provider' => 'openai'],
                [
                    'environment' => 'production',
                    'is_active' => true,
                    'last_healthcheck_at' => now(),
                    'last_healthcheck_status' => $status,
                ]
            );

            return [
                'status' => $status,
                'latency_ms' => $latency,
                'message' => $response->successful()
                    ? 'Conexão validada com sucesso no provedor de IA.'
                    : "Provedor respondeu HTTP {$response->status()}. Verifique chave e limites de cota.",
                'http_status' => $response->status(),
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'unreachable',
                'latency_ms' => (int) round((microtime(true) - $started) * 1000),
                'message' => 'Não foi possível contactar o provedor: '.$e->getMessage(),
                'http_status' => null,
            ];
        }
    }

    /**
     * Requests structured JSON output from the configured OpenAI-compatible Chat Completions endpoint.
     *
     * @param  array<string, mixed>  $jsonSchema
     * @param  list<string>  $imageDataUrls
     * @return array{connected: bool, content: array<string, mixed>|null, raw_text: string|null, model: string, prompt_tokens: int, completion_tokens: int, total_tokens: int, cost_usd: float, error: string|null}
     */
    public function chatStructured(
        string $agentType,
        string $systemPrompt,
        string $userPrompt,
        array $jsonSchema = [],
        array $imageDataUrls = [],
    ): array {
        $cfg = $this->getConfig();
        $modelKey = match ($agentType) {
            'catalog' => 'catalog_model',
            'replenishment' => 'replenishment_model',
            default => 'support_model',
        };
        $model = (string) ($cfg[$modelKey] ?? 'gpt-4o-mini');
        $apiKey = $this->resolveApiKey();

        if ($apiKey === null) {
            return [
                'connected' => false,
                'content' => null,
                'raw_text' => null,
                'model' => $model,
                'prompt_tokens' => 0,
                'completion_tokens' => 0,
                'total_tokens' => 0,
                'cost_usd' => 0.0,
                'error' => 'Configuração necessária: provedor de IA sem credencial configurada.',
            ];
        }

        $userContent = $imageDataUrls === []
            ? $userPrompt
            : array_merge(
                [['type' => 'text', 'text' => $userPrompt]],
                array_map(fn (string $url): array => ['type' => 'image_url', 'image_url' => ['url' => $url]], $imageDataUrls)
            );

        $payload = [
            'model' => $model,
            'messages' => [
                ['role' => 'system', 'content' => $systemPrompt],
                ['role' => 'user', 'content' => $userContent],
            ],
            'max_tokens' => max(200, (int) $cfg['max_tokens_per_operation']),
            'temperature' => 0.2,
        ];

        if ($jsonSchema !== []) {
            $payload['response_format'] = [
                'type' => 'json_schema',
                'json_schema' => [
                    'name' => 'mistura_agent_response',
                    'strict' => true,
                    'schema' => $jsonSchema,
                ],
            ];
        }

        $baseUrl = rtrim((string) $cfg['base_url'], '/');

        try {
            $http = Http::timeout(max(5, (int) $cfg['timeout_seconds']))
                ->withToken($apiKey)
                ->acceptJson();

            if ((int) $cfg['max_retries'] > 0) {
                $http = $http->retry((int) $cfg['max_retries'], 250, null, false);
            }

            $response = $http->post("{$baseUrl}/chat/completions", $payload);

            if (! $response->successful()) {
                return [
                    'connected' => true,
                    'content' => null,
                    'raw_text' => null,
                    'model' => $model,
                    'prompt_tokens' => 0,
                    'completion_tokens' => 0,
                    'total_tokens' => 0,
                    'cost_usd' => 0.0,
                    'error' => "Erro HTTP {$response->status()} do provedor de IA.",
                ];
            }

            /** @var array<string, mixed> $body */
            $body = $response->json() ?? [];
            $rawContent = (string) ($body['choices'][0]['message']['content'] ?? '');
            $usage = is_array($body['usage'] ?? null) ? $body['usage'] : [];
            $promptTokens = (int) ($usage['prompt_tokens'] ?? 0);
            $completionTokens = (int) ($usage['completion_tokens'] ?? 0);
            $totalTokens = (int) ($usage['total_tokens'] ?? ($promptTokens + $completionTokens));
            $costUsd = $this->estimateUsdCost($model, $promptTokens, $completionTokens);

            $decoded = json_decode($rawContent, true);

            return [
                'connected' => true,
                'content' => is_array($decoded) ? $decoded : null,
                'raw_text' => $rawContent,
                'model' => $model,
                'prompt_tokens' => $promptTokens,
                'completion_tokens' => $completionTokens,
                'total_tokens' => $totalTokens,
                'cost_usd' => $costUsd,
                'error' => null,
            ];
        } catch (\Throwable $e) {
            return [
                'connected' => true,
                'content' => null,
                'raw_text' => null,
                'model' => $model,
                'prompt_tokens' => 0,
                'completion_tokens' => 0,
                'total_tokens' => 0,
                'cost_usd' => 0.0,
                'error' => $e->getMessage(),
            ];
        }
    }

    private function estimateUsdCost(string $model, int $promptTokens, int $completionTokens): float
    {
        // Conservative published reference pricing per 1M tokens for gpt-4o-mini / gpt-4o families
        [$inRate, $outRate] = str_contains($model, '4o-mini')
            ? [0.15, 0.60]
            : [2.50, 10.00];

        return round((($promptTokens / 1_000_000) * $inRate) + (($completionTokens / 1_000_000) * $outRate), 6);
    }
}
