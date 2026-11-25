<?php

declare(strict_types=1);

namespace App\Domain\Shared\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;

/**
 * Fetches public HTTP(S) resources safely with strict SSRF protection,
 * DNS resolution checks, manual re-validated redirects, and byte caps.
 */
class SafeExternalHttpClient
{
    private const MAX_REDIRECTS = 3;

    /**
     * Fetches a public external resource safely with validated redirects.
     *
     * @param  array<string, string>  $acceptHeaders
     * @return array{body: string, content_type: string, final_url: string, status: int}
     */
    public function fetch(
        string $url,
        int $maxBytes = 5_242_880,
        int $timeoutSeconds = 12,
        array $acceptHeaders = ['Accept' => '*/*'],
    ): array {
        $currentUrl = trim($url);

        for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
            $this->assertSafePublicUrl($currentUrl);

            try {
                $response = Http::timeout($timeoutSeconds)
                    ->connectTimeout(5)
                    ->withHeaders(array_merge([
                        'User-Agent' => 'MisturaFemininaCatalogBot/1.0 (+https://misturafeminina.com.br)',
                    ], $acceptHeaders))
                    ->withOptions([
                        'allow_redirects' => false,
                    ])
                    ->get($currentUrl);
            } catch (\Throwable $e) {
                throw ValidationException::withMessages([
                    'url' => ['Não foi possível conectar à origem informada: '.$e->getMessage()],
                ]);
            }

            $status = $response->status();
            if ($status >= 300 && $status < 400) {
                $location = $response->header('Location');
                if (trim($location) === '') {
                    throw ValidationException::withMessages([
                        'url' => ['Redirecionamento inválido sem destino retornado pelo servidor de origem.'],
                    ]);
                }

                $currentUrl = $this->resolveRedirectUrl($currentUrl, trim($location));
                if ($hop === self::MAX_REDIRECTS) {
                    throw ValidationException::withMessages([
                        'url' => ['Limite de redirecionamentos excedido ao baixar o recurso externo.'],
                    ]);
                }

                continue;
            }

            if ($status === 401 || $status === 403 || $status === 429) {
                throw ValidationException::withMessages([
                    'url' => ['O site de origem bloqueou o acesso automático a este endereço (HTTP '.$status.'). Escolha outra candidata ou envie sua foto manualmente.'],
                ]);
            }

            if (! $response->successful()) {
                throw ValidationException::withMessages([
                    'url' => ['O endereço externo respondeu com erro (HTTP '.$status.'). Escolha outra opção ou envie manualmente.'],
                ]);
            }

            $contentLengthHeader = trim($response->header('Content-Length'));
            if ($contentLengthHeader !== '' && (int) $contentLengthHeader > $maxBytes) {
                throw ValidationException::withMessages([
                    'url' => ['O arquivo externo excede o limite máximo permitido de '.round($maxBytes / 1_048_576, 1).' MB.'],
                ]);
            }

            $body = $response->body();
            if (strlen($body) > $maxBytes) {
                throw ValidationException::withMessages([
                    'url' => ['O arquivo externo excede o limite máximo permitido de '.round($maxBytes / 1_048_576, 1).' MB.'],
                ]);
            }

            if ($body === '') {
                throw ValidationException::withMessages([
                    'url' => ['O endereço externo retornou conteúdo vazio.'],
                ]);
            }

            return [
                'body' => $body,
                'content_type' => $response->header('Content-Type'),
                'final_url' => $currentUrl,
                'status' => $status,
            ];
        }

        throw ValidationException::withMessages([
            'url' => ['Falha ao validar os redirecionamentos da URL externa.'],
        ]);
    }

    public function assertSafePublicUrl(string $url): void
    {
        $parts = parse_url(trim($url));
        if (! is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            throw ValidationException::withMessages([
                'url' => ['Informe um endereço web público válido começando com https:// ou http://.'],
            ]);
        }

        $scheme = strtolower((string) $parts['scheme']);
        if (! in_array($scheme, ['http', 'https'], true)) {
            throw ValidationException::withMessages([
                'url' => ['Somente endereços HTTP ou HTTPS públicos são permitidos.'],
            ]);
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            throw ValidationException::withMessages([
                'url' => ['Endereços com credenciais embutidas não são permitidos.'],
            ]);
        }

        if (isset($parts['port']) && ! in_array((int) $parts['port'], [80, 443], true)) {
            throw ValidationException::withMessages([
                'url' => ['Somente portas padrão HTTP (80) e HTTPS (443) são permitidas.'],
            ]);
        }

        $host = strtolower(trim((string) $parts['host'], '[]'));
        if (
            $host === '' ||
            $host === 'localhost' ||
            str_ends_with($host, '.localhost') ||
            str_ends_with($host, '.local') ||
            str_ends_with($host, '.internal') ||
            $host === 'metadata.google.internal'
        ) {
            throw ValidationException::withMessages([
                'url' => ['Endereço interno ou reservado não é permitido por segurança.'],
            ]);
        }

        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            if (! $this->isPublicIp($host)) {
                throw ValidationException::withMessages([
                    'url' => ['Endereços IP privados ou locais não são permitidos para importação.'],
                ]);
            }

            return;
        }

        $ips = $this->resolveHostIps($host);
        if ($ips === []) {
            if ($this->allowUnresolvedInFakeTests()) {
                return;
            }

            throw ValidationException::withMessages([
                'url' => ['Não foi possível resolver o endereço DNS do domínio informado.'],
            ]);
        }

        foreach ($ips as $ip) {
            if (! $this->isPublicIp($ip)) {
                throw ValidationException::withMessages([
                    'url' => ['O domínio informado resolve para um endereço interno protegido.'],
                ]);
            }
        }
    }

    private function isPublicIp(string $ip): bool
    {
        return filter_var(
            $ip,
            FILTER_VALIDATE_IP,
            FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
        ) !== false;
    }

    /** @return list<string> */
    private function resolveHostIps(string $host): array
    {
        $ips = [];
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        if (is_array($records)) {
            foreach ($records as $record) {
                if (! empty($record['ip'])) {
                    $ips[] = (string) $record['ip'];
                } elseif (! empty($record['ipv6'])) {
                    $ips[] = (string) $record['ipv6'];
                }
            }
        }

        if ($ips === []) {
            $v4 = @gethostbynamel($host);
            if (is_array($v4)) {
                $ips = array_values(array_filter($v4, 'is_string'));
            }
        }

        return array_values(array_unique($ips));
    }

    private function allowUnresolvedInFakeTests(): bool
    {
        return app()->runningUnitTests() && Http::getFacadeRoot() !== null;
    }

    private function resolveRedirectUrl(string $baseUrl, string $location): string
    {
        if (str_starts_with($location, 'http://') || str_starts_with($location, 'https://')) {
            return $location;
        }

        $base = parse_url($baseUrl);
        if (! is_array($base) || empty($base['scheme']) || empty($base['host'])) {
            return $location;
        }

        $scheme = (string) $base['scheme'];
        $host = (string) $base['host'];
        $port = isset($base['port']) ? ':'.$base['port'] : '';

        if (str_starts_with($location, '//')) {
            return "{$scheme}:{$location}";
        }

        if (str_starts_with($location, '/')) {
            return "{$scheme}://{$host}{$port}{$location}";
        }

        $basePath = (string) ($base['path'] ?? '/');
        $dir = rtrim(dirname($basePath), '/');

        return "{$scheme}://{$host}{$port}{$dir}/{$location}";
    }
}
