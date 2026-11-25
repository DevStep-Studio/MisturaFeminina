<?php

declare(strict_types=1);

namespace App\Domain\AI\Services;

use App\Domain\Shared\Services\SafeExternalHttpClient;
use App\Models\IntegrationSetting;
use Illuminate\Support\Facades\Http;

/**
 * Integrates with documented JSON search APIs supporting Google Web + Google Images
 * (Serper.dev recommended due to Google CSE restriction on new projects, plus legacy
 * Google Custom Search JSON API when cx + api_key are already provisioned), and extracts
 * factual OpenGraph / Product JSON-LD metadata from specific product pages.
 */
class GoogleProductSearchService
{
    public const PROVIDER_KEY = 'google_search';

    public function __construct(
        private readonly SafeExternalHttpClient $externalHttp,
    ) {}

    /** @return array<string, mixed> */
    public function resolveSettings(): array
    {
        $row = IntegrationSetting::query()->where('provider', self::PROVIDER_KEY)->first();
        $pub = is_array($row?->public_config) ? $row->public_config : [];
        $creds = is_array($row?->encrypted_credentials) ? $row->encrypted_credentials : [];

        $serperKey = trim((string) ($creds['serper_api_key'] ?? config('services.google_search.serper_api_key', '')));
        $cseApiKey = trim((string) ($creds['api_key'] ?? config('services.google_search.api_key', '')));
        $cseEngineId = trim((string) ($pub['engine_id'] ?? $creds['engine_id'] ?? config('services.google_search.engine_id', '')));

        $configuredDriver = (string) ($pub['driver'] ?? config('services.google_search.driver', 'serper'));
        if ($configuredDriver === 'serper' && $serperKey === '' && $cseApiKey !== '' && $cseEngineId !== '') {
            $configuredDriver = 'google_custom_search';
        } elseif ($configuredDriver === 'google_custom_search' && ($cseApiKey === '' || $cseEngineId === '') && $serperKey !== '') {
            $configuredDriver = 'serper';
        }

        $serperBaseUrl = rtrim((string) ($pub['serper_base_url'] ?? config('services.google_search.serper_base_url', 'https://google.serper.dev')), '/');

        return [
            'row' => $row,
            'driver' => $configuredDriver,
            'serper_api_key' => $serperKey,
            'serper_base_url' => $serperBaseUrl,
            'cse_api_key' => $cseApiKey,
            'cse_engine_id' => $cseEngineId,
        ];
    }

    /** @return array<string, mixed> */
    public function connectionStatus(): array
    {
        $cfg = $this->resolveSettings();
        /** @var IntegrationSetting|null $row */
        $row = $cfg['row'];
        $driver = (string) $cfg['driver'];

        $activeKey = $driver === 'google_custom_search'
            ? (string) $cfg['cse_api_key']
            : (string) $cfg['serper_api_key'];

        $hasCredentials = $driver === 'google_custom_search'
            ? ($cfg['cse_api_key'] !== '' && $cfg['cse_engine_id'] !== '')
            : ($cfg['serper_api_key'] !== '');

        $status = 'not_configured';
        $label = 'Configuração necessária';
        if ($hasCredentials) {
            if ($row?->last_healthcheck_status === 'connected') {
                $status = 'connected';
                $label = 'Conectado';
            } elseif (is_string($row?->last_healthcheck_status) && str_starts_with($row->last_healthcheck_status, 'error_')) {
                $status = $row->last_healthcheck_status;
                $label = 'Falha na última verificação';
            } else {
                $status = 'configured';
                $label = 'Credencial configurada';
            }
        }

        return [
            'provider' => self::PROVIDER_KEY,
            'driver' => $driver,
            'driver_label' => $driver === 'google_custom_search'
                ? 'Google Custom Search JSON API (CX)'
                : 'Serper (Google Busca Web e Imagens)',
            'status' => $status,
            'label' => $label,
            'has_credentials' => $hasCredentials,
            'has_api_key' => $hasCredentials,
            'masked_key' => $activeKey !== '' ? $this->maskKey($activeKey) : null,
            'engine_id' => $cfg['cse_engine_id'] !== '' ? (string) $cfg['cse_engine_id'] : null,
            'last_healthcheck_at' => $row?->last_healthcheck_at?->toIso8601String(),
            'last_healthcheck_status' => $row?->last_healthcheck_status,
            'env_vars_hint' => $driver === 'google_custom_search'
                ? ['GOOGLE_SEARCH_PROVIDER=google_custom_search', 'GOOGLE_SEARCH_API_KEY', 'GOOGLE_SEARCH_ENGINE_ID']
                : ['GOOGLE_SEARCH_PROVIDER=serper', 'SERPER_API_KEY'],
        ];
    }

    /** @return array{status: string, driver: string, latency_ms: int, message: string, http_status: int|null} */
    public function testConnection(): array
    {
        $cfg = $this->resolveSettings();
        $driver = (string) $cfg['driver'];
        $statusInfo = $this->connectionStatus();

        if (! $statusInfo['has_credentials']) {
            return [
                'status' => 'not_configured',
                'driver' => $driver,
                'latency_ms' => 0,
                'message' => $driver === 'google_custom_search'
                    ? 'Configuração necessária: informe GOOGLE_SEARCH_API_KEY e GOOGLE_SEARCH_ENGINE_ID ou mude para Serper (SERPER_API_KEY).'
                    : 'Configuração necessária: cadastre SERPER_API_KEY na Central de IA ou em Marca & Integrações.',
                'http_status' => null,
            ];
        }

        $started = microtime(true);

        try {
            if ($driver === 'google_custom_search') {
                $response = Http::timeout(10)
                    ->acceptJson()
                    ->get('https://www.googleapis.com/customsearch/v1', [
                        'key' => $cfg['cse_api_key'],
                        'cx' => $cfg['cse_engine_id'],
                        'q' => 'esmalte em gel',
                        'num' => 1,
                        'hl' => 'pt-BR',
                    ]);
            } else {
                $response = Http::timeout(10)
                    ->withHeaders([
                        'X-API-KEY' => (string) $cfg['serper_api_key'],
                        'Content-Type' => 'application/json',
                    ])
                    ->post("{$cfg['serper_base_url']}/search", [
                        'q' => 'esmalte em gel',
                        'gl' => 'br',
                        'hl' => 'pt-br',
                        'num' => 1,
                    ]);
            }

            $latency = (int) round((microtime(true) - $started) * 1000);
            $status = $response->successful() ? 'connected' : 'error_http_'.$response->status();

            IntegrationSetting::query()->updateOrCreate(
                ['provider' => self::PROVIDER_KEY],
                [
                    'environment' => 'production',
                    'is_active' => true,
                    'last_healthcheck_at' => now(),
                    'last_healthcheck_status' => $status,
                ]
            );

            return [
                'status' => $status,
                'driver' => $driver,
                'latency_ms' => $latency,
                'message' => $response->successful()
                    ? 'Busca Google conectada e respondendo normalmente.'
                    : "Provedor de busca retornou HTTP {$response->status()}. Confira chave, cota ou Engine ID.",
                'http_status' => $response->status(),
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'unreachable',
                'driver' => $driver,
                'latency_ms' => (int) round((microtime(true) - $started) * 1000),
                'message' => 'Não foi possível contactar o serviço de busca: '.$e->getMessage(),
                'http_status' => null,
            ];
        }
    }

    /**
     * Queries Google Web Search and Google Image Search via the configured JSON API.
     *
     * @return array{
     *   ok: bool,
     *   credentials_missing: bool,
     *   driver: string,
     *   error: ?string,
     *   web_results: list<array{title: string, url: string, snippet: string, domain: string, position: int}>,
     *   image_results: list<array{title: string, image_url: string, thumb_url: string, source_page_url: string, domain: string, width: ?int, height: ?int}>
     * }
     */
    public function searchWebAndImages(string $query): array
    {
        $cfg = $this->resolveSettings();
        $driver = (string) $cfg['driver'];
        $status = $this->connectionStatus();

        if (! $status['has_credentials']) {
            return [
                'ok' => false,
                'credentials_missing' => true,
                'driver' => $driver,
                'error' => 'Credencial de busca Google não configurada no servidor.',
                'web_results' => [],
                'image_results' => [],
            ];
        }

        if ($driver === 'google_custom_search') {
            return $this->searchViaGoogleCse($query, (string) $cfg['cse_api_key'], (string) $cfg['cse_engine_id']);
        }

        return $this->searchViaSerper($query, (string) $cfg['serper_api_key'], (string) $cfg['serper_base_url']);
    }

    /**
     * Fetches factual metadata from a specific public product page (JSON-LD Product + OpenGraph)
     * without scraping Google result pages.
     *
     * @return array{
     *   ok: bool,
     *   final_url: string,
     *   title: ?string,
     *   description: ?string,
     *   brand: ?string,
     *   gtin: ?string,
     *   mpn: ?string,
     *   images: list<array{url: string, alt: string}>,
     *   raw_facts: list<string>,
     *   error: ?string
     * }
     */
    public function fetchPageStructuredFacts(string $url): array
    {
        try {
            $fetched = $this->externalHttp->fetch($url, 524_288, 8, [
                'Accept' => 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
            ]);
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'final_url' => $url,
                'title' => null,
                'description' => null,
                'brand' => null,
                'gtin' => null,
                'mpn' => null,
                'images' => [],
                'raw_facts' => [],
                'error' => $e->getMessage(),
            ];
        }

        $html = $fetched['body'];
        $title = $this->extractMetaContent($html, ['property="og:title"', "property='og:title'", 'name="twitter:title"'])
            ?? $this->extractHtmlTagText($html, 'title');
        $description = $this->extractMetaContent($html, ['property="og:description"', "property='og:description'", 'name="description"', "name='description'"]);
        $ogImage = $this->extractMetaContent($html, ['property="og:image"', "property='og:image'", 'property="og:image:secure_url"']);

        $jsonLdFacts = $this->extractJsonLdProduct($html);
        $images = [];
        foreach ($jsonLdFacts['images'] as $imgUrl) {
            $images[] = ['url' => $imgUrl, 'alt' => $jsonLdFacts['name'] ?? ($title ?? '')];
        }
        if ($ogImage && filter_var($ogImage, FILTER_VALIDATE_URL)) {
            $images[] = ['url' => html_entity_decode($ogImage, ENT_QUOTES, 'UTF-8'), 'alt' => $title ?? ''];
        }
        foreach ($this->extractHtmlContentImages($html, $fetched['final_url']) as $htmlImg) {
            $images[] = $htmlImg;
        }

        $dedupedImages = [];
        $seen = [];
        foreach ($images as $img) {
            $u = trim($img['url']);
            if ($u === '' || isset($seen[$u])) {
                continue;
            }
            $seen[$u] = true;
            $dedupedImages[] = [
                'url' => $u,
                'alt' => trim($img['alt']),
            ];
        }

        $rawFacts = array_values(array_filter([
            $jsonLdFacts['name'] ?: $title,
            $jsonLdFacts['description'] ?: $description,
            ...$jsonLdFacts['specs'],
        ], fn ($s): bool => is_string($s) && trim($s) !== ''));

        return [
            'ok' => true,
            'final_url' => $fetched['final_url'],
            'title' => $this->cleanText($jsonLdFacts['name'] ?: $title),
            'description' => $this->cleanText($jsonLdFacts['description'] ?: $description),
            'brand' => $this->cleanText($jsonLdFacts['brand']),
            'gtin' => $jsonLdFacts['gtin'],
            'mpn' => $jsonLdFacts['mpn'],
            'images' => array_slice($dedupedImages, 0, 8),
            'raw_facts' => $rawFacts,
            'error' => null,
        ];
    }

    /** @return array<string, mixed> */
    private function searchViaSerper(string $query, string $apiKey, string $baseUrl): array
    {
        try {
            $headers = [
                'X-API-KEY' => $apiKey,
                'Content-Type' => 'application/json',
            ];

            $webResp = Http::timeout(12)->withHeaders($headers)->post("{$baseUrl}/search", [
                'q' => $query,
                'gl' => 'br',
                'hl' => 'pt-br',
                'num' => 8,
            ]);

            if (! $webResp->successful()) {
                return [
                    'ok' => false,
                    'credentials_missing' => false,
                    'driver' => 'serper',
                    'error' => "Serviço de busca Google retornou HTTP {$webResp->status()}.",
                    'web_results' => [],
                    'image_results' => [],
                ];
            }

            $imgResp = Http::timeout(12)->withHeaders($headers)->post("{$baseUrl}/images", [
                'q' => $query,
                'gl' => 'br',
                'hl' => 'pt-br',
                'num' => 10,
            ]);

            /** @var array<string, mixed> $webBody */
            $webBody = $webResp->json() ?? [];
            /** @var array<string, mixed> $imgBody */
            $imgBody = $imgResp->successful() ? ($imgResp->json() ?? []) : [];

            $webResults = [];
            foreach (($webBody['organic'] ?? []) as $idx => $item) {
                if (! is_array($item) || empty($item['link'])) {
                    continue;
                }
                $link = (string) $item['link'];
                $webResults[] = [
                    'title' => trim((string) ($item['title'] ?? '')),
                    'url' => $link,
                    'snippet' => trim((string) ($item['snippet'] ?? '')),
                    'domain' => $this->domainOf($link),
                    'position' => (int) ($item['position'] ?? ($idx + 1)),
                ];
            }

            $imageResults = [];
            foreach (($imgBody['images'] ?? []) as $img) {
                if (! is_array($img) || empty($img['imageUrl'])) {
                    continue;
                }
                $imageUrl = (string) $img['imageUrl'];
                $sourcePage = (string) ($img['link'] ?? '');
                $imageResults[] = [
                    'title' => trim((string) ($img['title'] ?? '')),
                    'image_url' => $imageUrl,
                    'thumb_url' => (string) ($img['thumbnailUrl'] ?? $imageUrl),
                    'source_page_url' => $sourcePage,
                    'domain' => $this->domainOf($sourcePage !== '' ? $sourcePage : $imageUrl),
                    'width' => isset($img['imageWidth']) ? (int) $img['imageWidth'] : null,
                    'height' => isset($img['imageHeight']) ? (int) $img['imageHeight'] : null,
                ];
            }

            return [
                'ok' => true,
                'credentials_missing' => false,
                'driver' => 'serper',
                'error' => null,
                'web_results' => $webResults,
                'image_results' => $imageResults,
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'credentials_missing' => false,
                'driver' => 'serper',
                'error' => 'Falha ao consultar busca Google: '.$e->getMessage(),
                'web_results' => [],
                'image_results' => [],
            ];
        }
    }

    /** @return array<string, mixed> */
    private function searchViaGoogleCse(string $query, string $apiKey, string $engineId): array
    {
        try {
            $webResp = Http::timeout(12)->acceptJson()->get('https://www.googleapis.com/customsearch/v1', [
                'key' => $apiKey,
                'cx' => $engineId,
                'q' => $query,
                'num' => 8,
                'gl' => 'br',
                'hl' => 'pt-BR',
            ]);

            if (! $webResp->successful()) {
                return [
                    'ok' => false,
                    'credentials_missing' => false,
                    'driver' => 'google_custom_search',
                    'error' => "Google Custom Search retornou HTTP {$webResp->status()}.",
                    'web_results' => [],
                    'image_results' => [],
                ];
            }

            $imgResp = Http::timeout(12)->acceptJson()->get('https://www.googleapis.com/customsearch/v1', [
                'key' => $apiKey,
                'cx' => $engineId,
                'q' => $query,
                'searchType' => 'image',
                'num' => 10,
                'gl' => 'br',
                'hl' => 'pt-BR',
            ]);

            /** @var array<string, mixed> $webBody */
            $webBody = $webResp->json() ?? [];
            /** @var array<string, mixed> $imgBody */
            $imgBody = $imgResp->successful() ? ($imgResp->json() ?? []) : [];

            $webResults = [];
            foreach (($webBody['items'] ?? []) as $idx => $item) {
                if (! is_array($item) || empty($item['link'])) {
                    continue;
                }
                $link = (string) $item['link'];
                $webResults[] = [
                    'title' => trim((string) ($item['title'] ?? '')),
                    'url' => $link,
                    'snippet' => trim((string) ($item['snippet'] ?? '')),
                    'domain' => $this->domainOf($link),
                    'position' => $idx + 1,
                ];
            }

            $imageResults = [];
            foreach (($imgBody['items'] ?? []) as $img) {
                if (! is_array($img) || empty($img['link'])) {
                    continue;
                }
                $imageUrl = (string) $img['link'];
                $imgMeta = is_array($img['image'] ?? null) ? $img['image'] : [];
                $sourcePage = (string) ($imgMeta['contextLink'] ?? '');
                $imageResults[] = [
                    'title' => trim((string) ($img['title'] ?? '')),
                    'image_url' => $imageUrl,
                    'thumb_url' => (string) ($imgMeta['thumbnailLink'] ?? $imageUrl),
                    'source_page_url' => $sourcePage,
                    'domain' => $this->domainOf($sourcePage !== '' ? $sourcePage : $imageUrl),
                    'width' => isset($imgMeta['width']) ? (int) $imgMeta['width'] : null,
                    'height' => isset($imgMeta['height']) ? (int) $imgMeta['height'] : null,
                ];
            }

            return [
                'ok' => true,
                'credentials_missing' => false,
                'driver' => 'google_custom_search',
                'error' => null,
                'web_results' => $webResults,
                'image_results' => $imageResults,
            ];
        } catch (\Throwable $e) {
            return [
                'ok' => false,
                'credentials_missing' => false,
                'driver' => 'google_custom_search',
                'error' => 'Falha ao consultar Google Custom Search: '.$e->getMessage(),
                'web_results' => [],
                'image_results' => [],
            ];
        }
    }

    /**
     * @return array{name: ?string, description: ?string, brand: ?string, gtin: ?string, mpn: ?string, images: list<string>, specs: list<string>}
     */
    private function extractJsonLdProduct(string $html): array
    {
        $out = [
            'name' => null,
            'description' => null,
            'brand' => null,
            'gtin' => null,
            'mpn' => null,
            'images' => [],
            'specs' => [],
        ];

        if (! preg_match_all('#<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>#is', $html, $matches)) {
            return $out;
        }

        foreach ($matches[1] as $rawJson) {
            $decoded = json_decode(trim($rawJson), true);
            if (! is_array($decoded)) {
                continue;
            }
            $nodes = isset($decoded['@graph']) && is_array($decoded['@graph'])
                ? $decoded['@graph']
                : (isset($decoded[0]) ? $decoded : [$decoded]);

            foreach ($nodes as $node) {
                if (! is_array($node)) {
                    continue;
                }
                $type = $node['@type'] ?? '';
                $types = is_array($type) ? $type : [$type];
                if (! in_array('Product', $types, true)) {
                    continue;
                }
                $out['name'] ??= isset($node['name']) ? (string) $node['name'] : null;
                $out['description'] ??= isset($node['description']) ? (string) $node['description'] : null;
                if (is_array($node['brand'] ?? null) && ! empty($node['brand']['name'])) {
                    $out['brand'] = (string) $node['brand']['name'];
                } elseif (is_string($node['brand'] ?? null)) {
                    $out['brand'] = $node['brand'];
                }
                $out['gtin'] ??= isset($node['gtin13']) ? (string) $node['gtin13'] : (isset($node['gtin']) ? (string) $node['gtin'] : null);
                $out['mpn'] ??= isset($node['mpn']) ? (string) $node['mpn'] : null;

                $rawImgs = $node['image'] ?? [];
                if (is_string($rawImgs)) {
                    $out['images'][] = $rawImgs;
                } elseif (is_array($rawImgs)) {
                    foreach ($rawImgs as $entry) {
                        if (is_string($entry)) {
                            $out['images'][] = $entry;
                        } elseif (is_array($entry) && ! empty($entry['url'])) {
                            $out['images'][] = (string) $entry['url'];
                        }
                    }
                }
            }
        }

        $out['images'] = array_values(array_filter(array_unique($out['images']), fn ($u): bool => filter_var($u, FILTER_VALIDATE_URL) !== false));

        return $out;
    }

    /** @param list<string> $attrFragments */
    private function extractMetaContent(string $html, array $attrFragments): ?string
    {
        foreach ($attrFragments as $frag) {
            $quoted = preg_quote($frag, '#');
            if (preg_match("#<meta[^>]*{$quoted}[^>]*content=[\"']([^\"']+)[\"']#is", $html, $m)) {
                return trim(html_entity_decode($m[1], ENT_QUOTES, 'UTF-8'));
            }
            if (preg_match("#<meta[^>]*content=[\"']([^\"']+)[\"'][^>]*{$quoted}#is", $html, $m)) {
                return trim(html_entity_decode($m[1], ENT_QUOTES, 'UTF-8'));
            }
        }

        return null;
    }

    private function extractHtmlTagText(string $html, string $tag): ?string
    {
        if (preg_match("#<{$tag}[^>]*>(.*?)</{$tag}>#is", $html, $m)) {
            return trim(html_entity_decode(strip_tags($m[1]), ENT_QUOTES, 'UTF-8'));
        }

        return null;
    }

    /** @return list<array{url: string, alt: string}> */
    private function extractHtmlContentImages(string $html, string $pageUrl): array
    {
        $results = [];
        if (! preg_match_all('#<img\b([^>]+)>#is', $html, $matches)) {
            return [];
        }

        $base = parse_url($pageUrl);
        $origin = is_array($base) && ! empty($base['scheme']) && ! empty($base['host'])
            ? "{$base['scheme']}://{$base['host']}"
            : '';

        foreach (array_slice($matches[1], 0, 20) as $attrs) {
            if (! preg_match('#(?:src|data-src)=["\']([^"\']+)["\']#is', $attrs, $srcM)) {
                continue;
            }
            $rawSrc = html_entity_decode(trim($srcM[1]), ENT_QUOTES, 'UTF-8');
            if ($rawSrc === '' || str_starts_with($rawSrc, 'data:') || preg_match('#\.(svg|gif)(\?|$)#i', $rawSrc)) {
                continue;
            }
            if (preg_match('#/(logo|icon|sprite|avatar|badge|pixel|banner-cookie)#i', $rawSrc)) {
                continue;
            }
            $abs = str_starts_with($rawSrc, 'http')
                ? $rawSrc
                : ($origin !== '' ? $origin.(str_starts_with($rawSrc, '/') ? $rawSrc : '/'.$rawSrc) : '');
            if ($abs === '' || filter_var($abs, FILTER_VALIDATE_URL) === false) {
                continue;
            }
            $alt = '';
            if (preg_match('#alt=["\']([^"\']*)["\']#is', $attrs, $altM)) {
                $alt = html_entity_decode(trim($altM[1]), ENT_QUOTES, 'UTF-8');
            }
            $results[] = ['url' => $abs, 'alt' => $alt];
        }

        return $results;
    }

    private function cleanText(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        $clean = trim((string) preg_replace('/\s+/', ' ', strip_tags(html_entity_decode($value, ENT_QUOTES, 'UTF-8'))));

        return $clean !== '' ? $clean : null;
    }

    private function domainOf(string $url): string
    {
        $host = (string) (parse_url($url, PHP_URL_HOST) ?? '');

        return preg_replace('/^www\./i', '', strtolower($host)) ?? '';
    }

    private function maskKey(string $key): string
    {
        if (strlen($key) <= 8) {
            return str_repeat('*', strlen($key));
        }

        return substr($key, 0, 5).'...'.substr($key, -4);
    }
}
