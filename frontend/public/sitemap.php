<?php
declare(strict_types=1);

/**
 * Mistura Feminina - Gateway Dinâmico de Sitemap
 * Entrega o sitemap XML oficial gerado pela API a partir dos dados reais da loja,
 * com cache local de 10 minutos, suporte a ETag/Last-Modified (304) e tolerância a falhas.
 */

// Headers essenciais de SEO e segurança
header('Content-Type: application/xml; charset=UTF-8');
header('X-Content-Type-Options: nosniff');

$cacheFile = __DIR__ . '/.sitemap_cache.xml';
$cacheTtlSeconds = 600; // 10 minutos
$forceRefresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';

// 1. Verificação de cache local válido
if (! $forceRefresh && file_exists($cacheFile) && (time() - filemtime($cacheFile) < $cacheTtlSeconds)) {
    $mtime = (int) filemtime($cacheFile);
    $etag = '"' . md5((string) $mtime . (string) filesize($cacheFile)) . '"';
    
    header('Cache-Control: public, max-age=1800, stale-while-revalidate=86400');
    header('ETag: ' . $etag);
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');

    if (
        (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) ||
        (isset($_SERVER['HTTP_IF_MODIFIED_SINCE']) && strtotime($_SERVER['HTTP_IF_MODIFIED_SINCE']) >= $mtime)
    ) {
        http_response_code(304);
        exit;
    }

    readfile($cacheFile);
    exit;
}

// 2. Busca do sitemap dinâmico na API oficial
$apiUrl = 'https://api.misturafeminina.com.br/sitemap.xml';
$xml = false;

// Tentativa via file_get_contents com timeout curto
$ctx = stream_context_create([
    'http' => [
        'timeout' => 8,
        'header' => "Accept: application/xml\r\nUser-Agent: MisturaFeminina-SitemapGateway/1.0\r\n",
    ],
    'ssl' => [
        'verify_peer' => false,
        'verify_peer_name' => false,
    ],
]);

$fetched = @file_get_contents($apiUrl, false, $ctx);
if ($fetched !== false && str_contains($fetched, '<urlset') && str_contains($fetched, '</urlset>')) {
    $xml = $fetched;
}

// Fallback via cURL caso file_get_contents esteja bloqueado
if ($xml === false && function_exists('curl_init')) {
    $ch = curl_init($apiUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER => [
            'Accept: application/xml',
            'User-Agent: MisturaFeminina-SitemapGateway/1.0',
        ],
    ]);
    $curlRes = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($status === 200 && is_string($curlRes) && str_contains($curlRes, '<urlset') && str_contains($curlRes, '</urlset>')) {
        $xml = $curlRes;
    }
}

// 3. Sucesso: gravação atômica em cache e envio ao cliente
if ($xml !== false) {
    $tmpFile = $cacheFile . '.' . uniqid('tmp', true);
    if (@file_put_contents($tmpFile, $xml) !== false) {
        @rename($tmpFile, $cacheFile);
    }
    $etag = '"' . md5((string) time() . (string) strlen($xml)) . '"';
    header('Cache-Control: public, max-age=1800, stale-while-revalidate=86400');
    header('ETag: ' . $etag);
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s') . ' GMT');
    echo $xml;
    exit;
}

// 4. Contingência: se a API falhar temporariamente, entrega cache anterior
if (file_exists($cacheFile)) {
    header('Cache-Control: public, max-age=300');
    header('Warning: 110 "Stale sitemap cache served"');
    readfile($cacheFile);
    exit;
}

// 5. Último recurso se nada estiver disponível
http_response_code(503);
echo "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n  <url><loc>https://misturafeminina.com.br/</loc></url>\n</urlset>";
