<?php
declare(strict_types=1);

/**
 * Mistura Feminina - Dynamic SEO & SPA Gateway
 * 
 * Entrega metadados dinâmicos (Title, Description, Canonical estrita, OpenGraph,
 * Twitter Cards e Schema.org JSON-LD estruturado) e conteúdo semântico pré-renderizado
 * diretamente no primeiro GET para robôs de busca (Googlebot, Bing, redes sociais)
 * e navegadores. Garante indexação orgânica de produtos e categorias sem Erro Soft 404,
 * mantendo compatibilidade total com o ciclo de vida do SolidJS SPA.
 */

$htmlFile = __DIR__ . '/index.html';
if (!file_exists($htmlFile)) {
    http_response_code(503);
    header('Content-Type: text/plain; charset=UTF-8');
    echo 'Site temporariamente em atualização.';
    exit;
}

$rawHtml = (string) file_get_contents($htmlFile);

$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH) ?: '/';
$path = '/' . ltrim($path, '/');
if ($path !== '/' && str_ends_with($path, '/')) {
    $path = rtrim($path, '/');
}

$baseUrl = 'https://misturafeminina.com.br';
$brandName = 'Mistura Feminina Cosméticos';
$canonicalUrl = $baseUrl . ($path === '/' ? '/' : $path);

// Helper para sanitizar strings
function mf_clean_str(?string $str): string {
    if ($str === null) return '';
    $clean = strip_tags($str);
    $clean = html_entity_decode($clean, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace('/\s+/', ' ', $clean) ?? '');
}

// Conexão resiliente ao MySQL com cache
function mf_get_pdo(): ?PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $envPath = dirname(__DIR__) . '/backend/.env';
    if (!file_exists($envPath)) {
        return null;
    }

    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (!$lines) return null;

    $cfg = [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line && $line[0] !== '#' && strpos($line, '=') !== false) {
            list($k, $v) = explode('=', $line, 2);
            $cfg[trim($k)] = trim(trim($v), '"\'');
        }
    }

    try {
        $host = $cfg['DB_HOST'] ?? '127.0.0.1';
        $port = $cfg['DB_PORT'] ?? '3306';
        $dbname = $cfg['DB_DATABASE'] ?? 'misturafeminina';
        $user = $cfg['DB_USERNAME'] ?? 'root';
        $pass = $cfg['DB_PASSWORD'] ?? '';

        $pdo = new PDO("mysql:host={$host};port={$port};dbname={$dbname};charset=utf8mb4", $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 3,
        ]);
        return $pdo;
    } catch (Throwable) {
        return null;
    }
}

// Helper para cache em disco (10 minutos)
function mf_cache_get_or_set(string $key, callable $callback): mixed {
    $cacheDir = __DIR__ . '/.seo_cache';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0755, true);
    }
    $cacheFile = $cacheDir . '/' . md5($key) . '.json';
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < 600)) {
        $data = @json_decode((string) file_get_contents($cacheFile), true);
        if ($data !== null) return $data;
    }

    $val = $callback();
    if ($val !== null) {
        @file_put_contents($cacheFile, json_encode($val, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }
    return $val;
}

// Inicializa metadados padrão
$seoTitle = 'Mistura Feminina Cosméticos | Esmaltes em Gel, Alongamento e Beleza';
$seoDescription = 'Loja de cosméticos e produtos para unhas: esmaltes em gel, géis construtores, moldes F1, lixas, cabines e acessórios profissionais com entrega rápida.';
$seoImage = $baseUrl . '/og-cover.png';
$seoType = 'website';
$schemas = [];
$semanticBody = '';
$isProduct = false;
$productPrice = null;

// Rota: /produto/{slug}
if (preg_match('#^/produto/([a-zA-Z0-9_\-]+)$#', $path, $matches)) {
    $slug = $matches[1];
    $prodData = mf_cache_get_or_set('prod_' . $slug, function () use ($slug) {
        $pdo = mf_get_pdo();
        if (!$pdo) return null;
        try {
            $stmt = $pdo->prepare('
                SELECT p.id, p.name, p.slug, p.sku, p.gtin, p.price_cents, p.promo_price_cents,
                       p.short_description, p.description, p.seo_title, p.seo_description,
                       p.is_active, pi.path as primary_image
                FROM products p
                LEFT JOIN product_images pi ON pi.product_id = p.id AND pi.is_primary = 1
                WHERE p.slug = ? AND p.is_active = 1
                LIMIT 1
            ');
            $stmt->execute([$slug]);
            $p = $stmt->fetch();
            if (!$p) return null;

            // Categorias
            $stmtCat = $pdo->prepare('
                SELECT c.name, c.slug
                FROM categories c
                JOIN category_product cp ON cp.category_id = c.id
                WHERE cp.product_id = ?
                ORDER BY c.parent_id ASC
            ');
            $stmtCat->execute([$p['id']]);
            $cats = $stmtCat->fetchAll();

            // Estoque total
            $stmtStock = $pdo->prepare('
                SELECT COALESCE(SUM(stock_qty - reserved_qty), 0) as available_stock
                FROM product_variants
                WHERE product_id = ? AND is_active = 1
            ');
            $stmtStock->execute([$p['id']]);
            $stock = (int) $stmtStock->fetchColumn();

            $p['categories'] = $cats;
            $p['available_stock'] = $stock;
            return $p;
        } catch (Throwable) {
            return null;
        }
    });

    if ($prodData) {
        $isProduct = true;
        $seoType = 'product';
        $prodName = mf_clean_str($prodData['name']);
        $catName = !empty($prodData['categories']) ? mf_clean_str($prodData['categories'][count($prodData['categories']) - 1]['name']) : 'Beleza e Unhas';

        // Título otimizado
        if (!empty($prodData['seo_title'])) {
            $seoTitle = mf_clean_str($prodData['seo_title']);
            if (!str_contains(strtolower($seoTitle), 'mistura feminina')) {
                $seoTitle .= ' | Mistura Feminina';
            }
        } else {
            $seoTitle = "{$prodName} - {$catName} | Mistura Feminina";
        }

        // Descrição otimizada
        if (!empty($prodData['seo_description'])) {
            $seoDescription = mf_clean_str($prodData['seo_description']);
        } elseif (!empty($prodData['short_description'])) {
            $seoDescription = mf_clean_str($prodData['short_description']);
        } else {
            $cleanDesc = mf_clean_str($prodData['description']);
            if (mb_strlen($cleanDesc) > 30) {
                $seoDescription = mb_substr($cleanDesc, 0, 160) . '...';
            } else {
                $seoDescription = "Compre {$prodName} na Mistura Feminina Cosméticos. Qualidade profissional para nail designers e manicures com envio rápido para todo o Brasil.";
            }
        }

        if (!empty($prodData['primary_image'])) {
            $img = $prodData['primary_image'];
            $seoImage = str_starts_with($img, 'http') ? $img : $baseUrl . '/' . ltrim($img, '/');
        }

        $effectiveCents = (!empty($prodData['promo_price_cents']) && (int)$prodData['promo_price_cents'] < (int)$prodData['price_cents'])
            ? (int)$prodData['promo_price_cents']
            : (int)$prodData['price_cents'];
        $productPrice = number_format($effectiveCents / 100, 2, '.', '');
        $inStock = ((int)$prodData['available_stock']) > 0;

        // Schema.org Product
        $productSchema = [
            '@context' => 'https://schema.org/',
            '@type' => 'Product',
            'name' => $prodName,
            'image' => [$seoImage],
            'description' => $seoDescription,
            'sku' => $prodData['sku'] ?: ('MF-' . $prodData['id']),
            'brand' => [
                '@type' => 'Brand',
                'name' => 'Mistura Feminina',
            ],
            'offers' => [
                '@type' => 'Offer',
                'url' => $canonicalUrl,
                'priceCurrency' => 'BRL',
                'price' => $productPrice,
                'priceValidUntil' => date('Y') + 1 . '-12-31',
                'itemCondition' => 'https://schema.org/NewCondition',
                'availability' => $inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                'seller' => [
                    '@type' => 'Organization',
                    'name' => $brandName,
                ],
            ],
        ];

        if (!empty($prodData['gtin']) && preg_match('/^\d{8,14}$/', trim($prodData['gtin']))) {
            $productSchema['gtin'] = trim($prodData['gtin']);
        }

        $schemas[] = $productSchema;

        // Schema.org Breadcrumbs
        $breadcrumbElements = [
            [
                '@type' => 'ListItem',
                'position' => 1,
                'name' => 'Início',
                'item' => $baseUrl . '/',
            ],
        ];
        $pos = 2;
        if (!empty($prodData['categories'])) {
            foreach ($prodData['categories'] as $c) {
                $breadcrumbElements[] = [
                    '@type' => 'ListItem',
                    'position' => $pos++,
                    'name' => mf_clean_str($c['name']),
                    'item' => $baseUrl . '/categoria/' . $c['slug'],
                ];
            }
        }
        $breadcrumbElements[] = [
            '@type' => 'ListItem',
            'position' => $pos,
            'name' => $prodName,
            'item' => $canonicalUrl,
        ];

        $schemas[] = [
            '@context' => 'https://schema.org',
            '@type' => 'BreadcrumbList',
            'itemListElement' => $breadcrumbElements,
        ];

        // Conteúdo semântico para noscript / renderizadores estáticos
        $priceFmt = 'R$ ' . number_format($effectiveCents / 100, 2, ',', '.');
        $stockBadge = $inStock ? '<span style="color:#059669;font-weight:bold;">Em Estoque (Pronta Entrega)</span>' : '<span style="color:#dc2626;font-weight:bold;">Indisponível no momento</span>';
        
        $semanticBody = '
        <article itemscope itemtype="https://schema.org/Product" style="max-width:860px;margin:30px auto;padding:24px;font-family:sans-serif;color:#18181b;line-height:1.6;">
            <nav aria-label="Navegação Estrutural" style="font-size:13px;color:#71717a;margin-bottom:16px;">
                <a href="/" style="color:#93509E;text-decoration:none;">Início</a> &gt; ' . 
                (!empty($prodData['categories']) ? '<a href="/categoria/' . htmlspecialchars($prodData['categories'][0]['slug']) . '" style="color:#93509E;text-decoration:none;">' . htmlspecialchars($prodData['categories'][0]['name']) . '</a> &gt; ' : '') .
                '<span>' . htmlspecialchars($prodName) . '</span>
            </nav>
            <h1 itemprop="name" style="font-size:26px;font-weight:bold;margin:0 0 12px 0;color:#18181b;">' . htmlspecialchars($prodName) . '</h1>
            <p style="font-size:13px;color:#71717a;margin:0 0 16px 0;">SKU: <span itemprop="sku">' . htmlspecialchars($prodData['sku'] ?? 'N/A') . '</span></p>
            <div style="margin-bottom:20px;font-size:24px;font-weight:bold;color:#059669;">
                ' . $priceFmt . '
                <div style="font-size:14px;margin-top:4px;">' . $stockBadge . '</div>
            </div>
            <div itemprop="description" style="font-size:15px;color:#3f3f46;margin-bottom:24px;">
                <p><strong>' . htmlspecialchars($seoDescription) . '</strong></p>
                ' . ($prodData['description'] ?? '') . '
            </div>
            <div style="padding:16px;background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;font-size:14px;color:#581c87;">
                <strong>Mistura Feminina Cosméticos:</strong> Atendimento especializado para manicures e nail designers. Compre online com segurança e envio para todo o Brasil.
            </div>
        </article>';
    }
}

// Rota: /categoria/{slug}
elseif (preg_match('#^/categoria/([a-zA-Z0-9_\-]+)$#', $path, $matches)) {
    $slug = $matches[1];
    $catData = mf_cache_get_or_set('cat_' . $slug, function () use ($slug) {
        $pdo = mf_get_pdo();
        if (!$pdo) return null;
        try {
            $stmt = $pdo->prepare('SELECT id, name, slug, description FROM categories WHERE slug = ? AND is_active = 1 LIMIT 1');
            $stmt->execute([$slug]);
            return $stmt->fetch() ?: null;
        } catch (Throwable) {
            return null;
        }
    });

    if ($catData) {
        $cName = mf_clean_str($catData['name']);
        $seoTitle = "{$cName} para Unhas e Beleza | Mistura Feminina Cosméticos";
        $seoDescription = !empty($catData['description'])
            ? mf_clean_str($catData['description'])
            : "Compre produtos de {$cName} na Mistura Feminina Cosméticos. As melhores marcas para nail designers com pronta entrega e pagamento facilitado.";
        
        $schemas[] = [
            '@context' => 'https://schema.org',
            '@type' => 'CollectionPage',
            'name' => $cName,
            'description' => $seoDescription,
            'url' => $canonicalUrl,
        ];
    }
}

// Rotas institucionais conhecidas
$staticMeta = [
    '/categorias' => [
        'title' => 'Todas as Categorias | Mistura Feminina Cosméticos',
        'desc'  => 'Navegue pelo catálogo completo de produtos para unhas, cosméticos, esmaltes em gel, maquinários e beleza profissional na Mistura Feminina.'
    ],
    '/marcas' => [
        'title' => 'Marcas Oficiais de Cosméticos e Unhas | Mistura Feminina',
        'desc'  => 'Conheça todas as marcas profissionais parceiras disponíveis na Mistura Feminina Cosméticos.'
    ],
    '/promocoes' => [
        'title' => 'Promoções e Ofertas Especiais | Mistura Feminina',
        'desc'  => 'Descontos imperdíveis em esmaltes em gel, cabines, géis construtores e acessórios para manicure.'
    ],
    '/atacado' => [
        'title' => 'Venda no Atacado e Preço por Quantidade | Mistura Feminina',
        'desc'  => 'Condições exclusivas de atacado para revendedoras, salões de beleza e profissionais da estética de unhas.'
    ],
    '/contato' => [
        'title' => 'Atendimento e Fale Conosco | Mistura Feminina',
        'desc'  => 'Entre em contato com nossa equipe de suporte pelo WhatsApp ou e-mail. Horário comercial de segunda a sexta.'
    ],
];

if (isset($staticMeta[$path])) {
    $seoTitle = $staticMeta[$path]['title'];
    $seoDescription = $staticMeta[$path]['desc'];
}

// Injeção de Tags no HTML
$output = $rawHtml;

// 1. Substitui <title>
$output = preg_replace('/<title>.*?<\/title>/is', '<title>' . htmlspecialchars($seoTitle, ENT_QUOTES, 'UTF-8') . '</title>', $output);

// 2. Substitui meta description
$metaDescTag = '<meta name="description" content="' . htmlspecialchars($seoDescription, ENT_QUOTES, 'UTF-8') . '" />';
if (preg_match('/<meta\s+name=["\']description["\'][^>]*>/i', $output)) {
    $output = preg_replace('/<meta\s+name=["\']description["\'][^>]*>/i', $metaDescTag, $output);
} else {
    $output = str_replace('</head>', "  {$metaDescTag}\n</head>", $output);
}

// 3. Substitui link canonical (ESTRITO: nunca aponta para home em rotas internas!)
$canonicalTag = '<link rel="canonical" href="' . htmlspecialchars($canonicalUrl, ENT_QUOTES, 'UTF-8') . '" />';
if (preg_match('/<link\s+rel=["\']canonical["\'][^>]*>/i', $output)) {
    $output = preg_replace('/<link\s+rel=["\']canonical["\'][^>]*>/i', $canonicalTag, $output);
} else {
    $output = str_replace('</head>', "  {$canonicalTag}\n</head>", $output);
}

// 4. OpenGraph & Twitter
$ogTags = [
    'og:title' => $seoTitle,
    'og:description' => $seoDescription,
    'og:url' => $canonicalUrl,
    'og:type' => $seoType,
    'og:image' => $seoImage,
    'twitter:title' => $seoTitle,
    'twitter:description' => $seoDescription,
    'twitter:image' => $seoImage,
];
if ($isProduct && $productPrice !== null) {
    $ogTags['product:price:amount'] = $productPrice;
    $ogTags['product:price:currency'] = 'BRL';
}

foreach ($ogTags as $prop => $val) {
    $isOg = str_starts_with($prop, 'og:');
    $attr = $isOg ? 'property' : 'name';
    $newTag = '<meta ' . $attr . '="' . htmlspecialchars($prop) . '" content="' . htmlspecialchars($val, ENT_QUOTES, 'UTF-8') . '" />';
    $pattern = '/<meta\s+' . $attr . '=["\']' . preg_quote($prop, '/') . '["\'][^>]*>/i';
    if (preg_match($pattern, $output)) {
        $output = preg_replace($pattern, $newTag, $output);
    } else {
        $output = str_replace('</head>', "  {$newTag}\n</head>", $output);
    }
}

// 5. Injeta Schema.org JSON-LD
if (!empty($schemas)) {
    $jsonLdBlock = '';
    foreach ($schemas as $s) {
        $jsonLdBlock .= "\n    <script type=\"application/ld+json\">\n" . json_encode($s, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n    </script>";
    }
    $output = str_replace('</head>', "{$jsonLdBlock}\n</head>", $output);
}

// 6. Injeta conteúdo semântico no <noscript> ou corpo para Googlebot ler no primeiro GET
if (!empty($semanticBody)) {
    if (str_contains($output, '<noscript>')) {
        $output = preg_replace('/<noscript>.*?<\/noscript>/is', "<noscript>{$semanticBody}</noscript>", $output);
    } else {
        $output = str_replace('</body>', "<noscript>{$semanticBody}</noscript>\n</body>", $output);
    }
}

// Entrega cabeçalhos HTTP estritos
header('Content-Type: text/html; charset=UTF-8');
header('X-Robots-Tag: index, follow');
header('X-SEO-Gateway: MisturaFeminina-Prerender/1.0');

echo $output;
exit;
