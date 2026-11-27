<?php

declare(strict_types=1);

namespace App\Domain\Marketing\Services;

use App\Domain\Settings\Services\StoreSettingsService;
use App\Models\Category;
use App\Models\MarketingIntegration;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StoreSetting;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;

class GoogleMerchantFeedService
{
    public const FEED_CACHE_KEY = 'seo:merchant-feed:v2';

    public const FEED_STATUS_SETTING_KEY = 'google_merchant_feed_status';

    public function __construct(
        private readonly StoreSettingsService $storeSettings,
        private readonly GoogleOAuthTokenHelper $oauth,
    ) {}

    public function feedPublicUrl(): string
    {
        $apiBase = rtrim((string) config('app.url', 'https://api.misturafeminina.com.br'), '/');

        return "{$apiBase}/merchant-feed.xml";
    }

    public function feedStorefrontAliasUrl(): string
    {
        $frontBase = rtrim((string) config('app.frontend_url', config('app.url', 'https://misturafeminina.com.br')), '/');

        return "{$frontBase}/feed/google-merchant.xml";
    }

    public function clearCache(): void
    {
        Cache::forget(self::FEED_CACHE_KEY);
        Cache::forget('seo:merchant-feed');
    }

    public function renderXml(bool $forceRefresh = false): string
    {
        if ($forceRefresh) {
            $this->clearCache();
        }

        return Cache::remember(self::FEED_CACHE_KEY, 600, function (): string {
            $built = $this->analyzeAndBuildFeed(true);

            return $built['xml'];
        });
    }

    /**
     * Analyzes the real active catalog, builds valid Merchant Center RSS 2.0 XML
     * for eligible products/variants, and classifies incomplete products with exact reasons.
     *
     * @return array{
     *   xml: string,
     *   summary: array<string, mixed>,
     *   ready_products: list<array<string, mixed>>,
     *   incomplete_products: list<array<string, mixed>>,
     *   warning_products: list<array<string, mixed>>
     * }
     */
    public function analyzeAndBuildFeed(bool $persistStatus = false): array
    {
        $storeBase = rtrim((string) config('app.frontend_url', config('app.url', 'https://misturafeminina.com.br')), '/');
        $apiBase = rtrim((string) config('app.url', $storeBase), '/');

        $allCategories = Category::query()
            ->get(['id', 'parent_id', 'name', 'slug'])
            ->keyBy('id');

        $products = Product::query()
            ->where('is_active', true)
            ->with([
                'brand:id,name,slug',
                'categories:id,parent_id,name,slug',
                'images',
                'variants' => fn ($q) => $q->where('is_active', true)->whereNull('archived_at')->orderBy('sort_order')->orderBy('id'),
                'variants.image',
            ])
            ->orderBy('id')
            ->get();

        $xmlLines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
            '  <channel>',
            '    <title>Mistura Feminina Cosméticos — Catálogo Oficial</title>',
            '    <link>'.htmlspecialchars($storeBase.'/', ENT_XML1).'</link>',
            '    <description>Feed oficial de produtos da Mistura Feminina Cosméticos para Google Shopping e Merchant Center.</description>',
        ];

        $readyProducts = [];
        $incompleteProducts = [];
        $warningProducts = [];
        $emittedItemsCount = 0;
        $readyInStockCount = 0;
        $readyOutOfStockCount = 0;

        foreach ($products as $product) {
            $blockingIssues = [];
            $warnings = [];

            $name = trim((string) $product->name);
            $slug = trim((string) $product->slug);
            $sku = trim((string) $product->sku);

            if ($name === '' || $slug === '' || $sku === '') {
                $blockingIssues[] = [
                    'code' => 'missing_identity',
                    'field' => 'name/slug/sku',
                    'reason' => 'Nome, SKU ou URL amigável (slug) ausente.',
                    'guidance' => 'Edite o produto e preencha Nome, SKU único e URL amigável.',
                ];
            }

            $rasterImages = $this->resolveProductRasterImages($product, $storeBase, $apiBase);
            $primaryImageUrl = $rasterImages[0] ?? null;

            if ($primaryImageUrl === null) {
                $blockingIssues[] = [
                    'code' => 'missing_image',
                    'field' => 'image_link',
                    'reason' => 'Sem foto real do produto (o Google Shopping recusa itens sem imagem ou com placeholder SVG).',
                    'guidance' => 'Envie ao menos 1 foto real em JPG, PNG ou WebP na aba Produtos & Estoque.',
                ];
            }

            $activeVariants = $product->variants;
            $isMultiVariant = $product->usesVariations() && $activeVariants->count() > 1;
            $defaultVariant = $activeVariants->firstWhere('is_default', true) ?? $activeVariants->first();

            $basePriceCents = (int) ($defaultVariant?->price_cents ?? $product->price_cents);
            $effectivePriceCents = $defaultVariant
                ? $defaultVariant->effectivePriceCents()
                : $product->effectivePriceCents();

            if ($isMultiVariant) {
                $validPriceVariants = $activeVariants->filter(fn (ProductVariant $v): bool => $v->effectivePriceCents() > 0 && (int) $v->price_cents > 0);
                if ($validPriceVariants->isEmpty()) {
                    $blockingIssues[] = [
                        'code' => 'invalid_price',
                        'field' => 'price',
                        'reason' => 'Nenhuma variação ativa possui preço de venda maior que R$ 0,00.',
                        'guidance' => 'Defina o preço de venda das variações ativas.',
                    ];
                }
            } elseif ($basePriceCents <= 0 || $effectivePriceCents <= 0) {
                $blockingIssues[] = [
                    'code' => 'invalid_price',
                    'field' => 'price',
                    'reason' => 'Preço de venda zerado ou ausente.',
                    'guidance' => 'Informe um preço de venda válido maior que R$ 0,00.',
                ];
            }

            $rawDescription = trim((string) ($product->description ?: $product->short_description ?: ''));
            $cleanDescription = trim(preg_replace('/\s+/u', ' ', strip_tags($rawDescription)) ?? '');
            if (mb_strlen($cleanDescription) < 25) {
                $warnings[] = [
                    'code' => 'short_description',
                    'field' => 'description',
                    'reason' => 'Descrição curta ou ausente (usando título + categoria como texto base).',
                    'guidance' => 'Adicione uma descrição comercial clara com modo de uso e características reais.',
                ];
            }

            $brandName = trim((string) ($product->brand?->name ?: $product->manufacturer ?: ''));
            if ($brandName === '') {
                $warnings[] = [
                    'code' => 'missing_brand',
                    'field' => 'brand',
                    'reason' => 'Marca não vinculada (enviado com identifier_exists=no).',
                    'guidance' => 'Vincule a marca real do fabricante quando existir.',
                ];
            }

            $productGtin = $this->normalizeGtin($product->gtin);
            $hasAnyVariantGtin = $activeVariants->contains(fn (ProductVariant $v): bool => $this->normalizeGtin($v->gtin) !== null);
            if ($productGtin === null && ! $hasAnyVariantGtin) {
                $warnings[] = [
                    'code' => 'missing_gtin',
                    'field' => 'gtin',
                    'reason' => 'Código de barras GTIN/EAN não informado.',
                    'guidance' => 'Se a embalagem possuir EAN-13/GTIN oficial do fabricante, preencha-o para ganhar prioridade no Google Shopping (nunca invente códigos).',
                ];
            }

            $totalAvailableStock = $activeVariants->isNotEmpty()
                ? (int) $activeVariants->sum(fn (ProductVariant $v): int => $v->availableStock())
                : 0;

            if ($totalAvailableStock <= 0) {
                $warnings[] = [
                    'code' => 'out_of_stock',
                    'field' => 'availability',
                    'reason' => 'Estoque disponível igual a 0 (será publicado como out_of_stock, igual à vitrine).',
                    'guidance' => 'Atualize o saldo de estoque real para que o item fique disponível para compra no Shopping.',
                ];
            }

            $categoryPath = $this->resolveCategoryPath($product, $allCategories);

            if ($blockingIssues !== []) {
                $incompleteProducts[] = [
                    'id' => $product->id,
                    'sku' => $sku,
                    'name' => $name,
                    'slug' => $slug,
                    'price_cents' => $effectivePriceCents,
                    'stock_qty' => $totalAvailableStock,
                    'brand_name' => $brandName !== '' ? $brandName : null,
                    'category_path' => $categoryPath,
                    'blocking_issues' => $blockingIssues,
                    'warnings' => $warnings,
                ];

                continue;
            }

            // Product is eligible for Google Merchant Center XML!
            $fallbackDescription = $categoryPath !== null
                ? "{$name} — {$categoryPath}. Disponível na Mistura Feminina Cosméticos."
                : "{$name} — Disponível na Mistura Feminina Cosméticos.";
            $finalDescription = mb_strlen($cleanDescription) >= 15 ? $cleanDescription : $fallbackDescription;

            if ($isMultiVariant) {
                $emittedForProduct = 0;
                foreach ($activeVariants as $variant) {
                    $vBaseCents = (int) $variant->price_cents;
                    $vEffCents = $variant->effectivePriceCents();
                    if ($vBaseCents <= 0 || $vEffCents <= 0) {
                        continue;
                    }

                    $vImagePath = $variant->effectiveImagePath();
                    $vImageUrl = $this->resolveSingleRasterImageUrl($vImagePath, $storeBase, $apiBase) ?? $primaryImageUrl;
                    if ($vImageUrl === null) {
                        continue;
                    }

                    $vSku = trim((string) ($variant->sku ?: "{$sku}-{$variant->id}"));
                    $vName = trim((string) $variant->name);
                    $vTitle = ($vName !== '' && mb_strtolower($vName) !== 'padrão')
                        ? "{$name} — {$vName}"
                        : $name;
                    $vLink = "{$storeBase}/produto/{$slug}?variant={$variant->id}";
                    $vInStock = $variant->isSellable();
                    $vGtin = $this->normalizeGtin($variant->gtin) ?? $productGtin;
                    $vMpn = trim((string) ($variant->supplier_code ?: $product->supplier_code ?: ''));
                    $vWeightGrams = $variant->effectiveWeightGrams();

                    $vOptionValues = is_array($variant->option_values)
                        ? $variant->option_values
                        : (is_string($variant->option_values) ? json_decode($variant->option_values, true) : []);

                    $vColor = trim((string) ($variant->color_family ?: $variant->shade_code ?: ''));
                    $vSize = null;

                    if (is_array($vOptionValues)) {
                        foreach ($vOptionValues as $opt) {
                            $attrSlug = mb_strtolower((string) ($opt['attribute_slug'] ?? $opt['attribute_name'] ?? ''));
                            $val = trim((string) ($opt['value'] ?? ''));
                            if ($val === '') {
                                continue;
                            }
                            if (str_contains($attrSlug, 'cor') || str_contains($attrSlug, 'tonalidade') || str_contains($attrSlug, 'color') || str_contains($attrSlug, 'shade')) {
                                if ($vColor === '') {
                                    $vColor = $val;
                                }
                            } elseif (str_contains($attrSlug, 'tamanho') || str_contains($attrSlug, 'volume') || str_contains($attrSlug, 'size') || str_contains($attrSlug, 'peso') || str_contains($attrSlug, 'opcao')) {
                                if ($vSize === null) {
                                    $vSize = $val;
                                }
                            }
                        }
                    }

                    if ($vSize === null && $vName !== '' && mb_strtolower($vName) !== 'padrão') {
                        if ($vColor === '' || mb_strtolower($vName) !== mb_strtolower($vColor)) {
                            $vSize = $vName;
                        }
                    }

                    $xmlLines = array_merge($xmlLines, $this->buildXmlItem([
                        'id' => $vSku,
                        'item_group_id' => $sku,
                        'title' => $vTitle,
                        'description' => $finalDescription,
                        'link' => $vLink,
                        'image_link' => $vImageUrl,
                        'additional_images' => array_slice(array_values(array_diff($rasterImages, [$vImageUrl])), 0, 9),
                        'in_stock' => $vInStock,
                        'price_cents' => $vBaseCents,
                        'effective_price_cents' => $vEffCents,
                        'brand' => $brandName !== '' ? $brandName : null,
                        'gtin' => $vGtin,
                        'mpn' => $vMpn !== '' ? $vMpn : null,
                        'product_type' => $categoryPath,
                        'color' => $vColor !== '' ? $vColor : null,
                        'size' => $vSize !== null && $vSize !== '' ? $vSize : null,
                        'weight_grams' => ($vWeightGrams > 0) ? $vWeightGrams : null,
                    ]));

                    $emittedItemsCount++;
                    $emittedForProduct++;
                }

                if ($emittedForProduct > 0) {
                    if ($totalAvailableStock > 0) {
                        $readyInStockCount++;
                    } else {
                        $readyOutOfStockCount++;
                    }
                    $entry = [
                        'id' => $product->id,
                        'sku' => $sku,
                        'name' => $name,
                        'slug' => $slug,
                        'price_cents' => $effectivePriceCents,
                        'stock_qty' => $totalAvailableStock,
                        'in_stock' => $totalAvailableStock > 0,
                        'variants_emitted' => $emittedForProduct,
                        'brand_name' => $brandName !== '' ? $brandName : null,
                        'category_path' => $categoryPath,
                        'warnings' => $warnings,
                    ];
                    $readyProducts[] = $entry;
                    if ($warnings !== []) {
                        $warningProducts[] = $entry;
                    }
                }
            } else {
                $inStock = $defaultVariant ? $defaultVariant->isSellable() : ($totalAvailableStock > 0);
                $itemId = trim((string) ($defaultVariant?->sku ?: $sku));
                $mpn = trim((string) ($defaultVariant?->supplier_code ?: $product->supplier_code ?: ''));
                $weightGrams = $defaultVariant?->weight_grams ?? $product->weight_grams;

                $xmlLines = array_merge($xmlLines, $this->buildXmlItem([
                    'id' => $itemId,
                    'item_group_id' => null,
                    'title' => $name,
                    'description' => $finalDescription,
                    'link' => "{$storeBase}/produto/{$slug}",
                    'image_link' => $primaryImageUrl,
                    'additional_images' => array_slice($rasterImages, 1, 9),
                    'in_stock' => $inStock,
                    'price_cents' => $basePriceCents,
                    'effective_price_cents' => $effectivePriceCents,
                    'brand' => $brandName !== '' ? $brandName : null,
                    'gtin' => $this->normalizeGtin($defaultVariant?->gtin) ?? $productGtin,
                    'mpn' => $mpn !== '' ? $mpn : null,
                    'product_type' => $categoryPath,
                    'color' => null,
                    'weight_grams' => ($weightGrams !== null && (int) $weightGrams > 0) ? (int) $weightGrams : null,
                ]));

                $emittedItemsCount++;
                if ($inStock) {
                    $readyInStockCount++;
                } else {
                    $readyOutOfStockCount++;
                }

                $entry = [
                    'id' => $product->id,
                    'sku' => $itemId,
                    'name' => $name,
                    'slug' => $slug,
                    'price_cents' => $effectivePriceCents,
                    'stock_qty' => $totalAvailableStock,
                    'in_stock' => $inStock,
                    'variants_emitted' => 1,
                    'brand_name' => $brandName !== '' ? $brandName : null,
                    'category_path' => $categoryPath,
                    'warnings' => $warnings,
                ];
                $readyProducts[] = $entry;
                if ($warnings !== []) {
                    $warningProducts[] = $entry;
                }
            }
        }

        $xmlLines[] = '  </channel>';
        $xmlLines[] = '</rss>';
        $xml = implode("\n", $xmlLines);

        $generatedAt = now()->toIso8601String();
        $summary = [
            'status' => 'success',
            'last_generated_at' => $generatedAt,
            'feed_url' => $this->feedPublicUrl(),
            'feed_alias_url' => $this->feedStorefrontAliasUrl(),
            'total_active_products' => $products->count(),
            'ready_products_count' => count($readyProducts),
            'ready_in_stock_count' => $readyInStockCount,
            'ready_out_of_stock_count' => $readyOutOfStockCount,
            'emitted_items_count' => $emittedItemsCount,
            'incomplete_products_count' => count($incompleteProducts),
            'warnings_products_count' => count($warningProducts),
            'reason_breakdown' => $this->summarizeReasons($incompleteProducts, $warningProducts),
        ];

        if ($persistStatus) {
            try {
                $this->storeSettings->setMany([
                    self::FEED_STATUS_SETTING_KEY => $summary,
                ], 'marketing', false);
            } catch (\Throwable) {
                // Keep feed generation resilient even on read-only DB edge cases
            }
        }

        return [
            'xml' => $xml,
            'summary' => $summary,
            'ready_products' => $readyProducts,
            'incomplete_products' => $incompleteProducts,
            'warning_products' => $warningProducts,
        ];
    }

    /**
     * Returns complete Shopping & Merchant Center diagnostics for the Admin UI.
     *
     * @return array<string, mixed>
     */
    public function getAdminDiagnostics(bool $forceRefresh = false): array
    {
        if ($forceRefresh) {
            $this->clearCache();
        }

        $built = $this->analyzeAndBuildFeed($forceRefresh);
        $savedRow = StoreSetting::query()->where('key', self::FEED_STATUS_SETTING_KEY)->first();
        $savedMeta = is_array($savedRow?->value['val'] ?? null) ? $savedRow->value['val'] : null;

        if (! $forceRefresh && is_array($savedMeta) && ! empty($savedMeta['last_generated_at'])) {
            $built['summary']['last_generated_at'] = $savedMeta['last_generated_at'];
            $built['summary']['status'] = $savedMeta['status'] ?? 'success';
        } elseif ($forceRefresh || $savedMeta === null) {
            $this->storeSettings->setMany([
                self::FEED_STATUS_SETTING_KEY => $built['summary'],
            ], 'marketing', false);
        }

        $integration = MarketingIntegration::query()->where('platform', 'google_merchant_center')->first();
        $merchantApiStatus = $this->inspectMerchantCenterConnection($integration);

        return [
            'integration' => $this->sanitizeIntegrationForClient($integration),
            'merchant_center_api' => $merchantApiStatus,
            'feed' => $built['summary'],
            'ready_products' => array_slice($built['ready_products'], 0, 100),
            'incomplete_products' => array_slice($built['incomplete_products'], 0, 150),
            'warning_products' => array_slice($built['warning_products'], 0, 100),
        ];
    }

    /**
     * Tests real connectivity to Google Content API for Shopping if credentials exist.
     *
     * @return array<string, mixed>
     */
    public function inspectMerchantCenterConnection(?MarketingIntegration $integration): array
    {
        if (! $integration) {
            return [
                'status' => 'not_configured',
                'google_confirmation' => false,
                'message' => 'Conta do Google Merchant Center ainda não conectada via API. O feed XML público já está ativo para busca programada.',
                'missing_fields' => ['merchant_id', 'service_account_json'],
            ];
        }

        $merchantId = preg_replace('/\D+/', '', (string) ($integration->account_id ?? '')) ?? '';
        $creds = $this->decryptCredentials($integration->encrypted_credentials);
        $saJson = trim((string) ($creds['service_account_json'] ?? ''));

        if ($merchantId === '' || $saJson === '') {
            $missing = [];
            if ($merchantId === '') {
                $missing[] = 'Merchant ID numérico (ex.: 123456789)';
            }
            if ($saJson === '') {
                $missing[] = 'Chave JSON da Service Account com acesso ao Merchant Center';
            }

            return [
                'status' => 'not_configured',
                'google_confirmation' => false,
                'message' => 'Integração direta com a API do Merchant Center pendente de credenciais. Você já pode cadastrar a URL do feed diretamente no painel do Google Merchant Center.',
                'missing_fields' => $missing,
            ];
        }

        try {
            $token = $this->oauth->tokenFromServiceAccount($saJson, [
                'https://www.googleapis.com/auth/content',
            ]);

            $res = Http::withToken($token)
                ->timeout(15)
                ->acceptJson()
                ->get("https://shoppingcontent.googleapis.com/content/v2.1/{$merchantId}/productstatuses", [
                    'maxResults' => 50,
                ]);

            if (! $res->successful()) {
                $errMsg = (string) ($res->json('error.message') ?? 'HTTP '.$res->status());

                return [
                    'status' => 'error',
                    'google_confirmation' => false,
                    'message' => "Erro ao consultar Google Merchant Center API: {$errMsg}",
                    'missing_fields' => [],
                ];
            }

            $resources = (array) ($res->json('resources') ?? []);
            $approved = 0;
            $disapproved = 0;
            $pending = 0;
            foreach ($resources as $item) {
                $destStatuses = (array) ($item['destinationStatuses'] ?? []);
                $statuses = array_column($destStatuses, 'status');
                if (in_array('disapproved', $statuses, true)) {
                    $disapproved++;
                } elseif (in_array('approved', $statuses, true)) {
                    $approved++;
                } else {
                    $pending++;
                }
            }

            return [
                'status' => 'connected',
                'google_confirmation' => true,
                'merchant_id' => $merchantId,
                'sampled_statuses' => [
                    'total_sampled' => count($resources),
                    'approved' => $approved,
                    'pending' => $pending,
                    'disapproved' => $disapproved,
                ],
                'message' => 'Conectado ao Google Merchant Center API com confirmação real de status.',
                'missing_fields' => [],
            ];
        } catch (\Throwable $e) {
            return [
                'status' => 'error',
                'google_confirmation' => false,
                'message' => $e->getMessage(),
                'missing_fields' => [],
            ];
        }
    }

    /**
     * @param  array<string, mixed>  $item
     * @return list<string>
     */
    private function buildXmlItem(array $item): array
    {
        $lines = ['    <item>'];
        $lines[] = '      <g:id>'.htmlspecialchars((string) $item['id'], ENT_XML1).'</g:id>';
        if (! empty($item['item_group_id'])) {
            $lines[] = '      <g:item_group_id>'.htmlspecialchars((string) $item['item_group_id'], ENT_XML1).'</g:item_group_id>';
        }
        $lines[] = '      <g:title>'.htmlspecialchars(mb_substr((string) $item['title'], 0, 150), ENT_XML1).'</g:title>';
        $lines[] = '      <g:description>'.htmlspecialchars(mb_substr((string) $item['description'], 0, 5000), ENT_XML1).'</g:description>';
        $lines[] = '      <g:link>'.htmlspecialchars((string) $item['link'], ENT_XML1).'</g:link>';
        $lines[] = '      <g:image_link>'.htmlspecialchars((string) $item['image_link'], ENT_XML1).'</g:image_link>';

        foreach (($item['additional_images'] ?? []) as $extraImg) {
            $lines[] = '      <g:additional_image_link>'.htmlspecialchars((string) $extraImg, ENT_XML1).'</g:additional_image_link>';
        }

        $lines[] = '      <g:condition>new</g:condition>';
        $lines[] = '      <g:availability>'.($item['in_stock'] ? 'in_stock' : 'out_of_stock').'</g:availability>';

        $basePrice = number_format(((int) $item['price_cents']) / 100, 2, '.', '').' BRL';
        $lines[] = '      <g:price>'.$basePrice.'</g:price>';

        if ((int) $item['effective_price_cents'] < (int) $item['price_cents']) {
            $salePrice = number_format(((int) $item['effective_price_cents']) / 100, 2, '.', '').' BRL';
            $lines[] = '      <g:sale_price>'.$salePrice.'</g:sale_price>';
        }

        $hasBrand = ! empty($item['brand']);
        $hasGtin = ! empty($item['gtin']);
        $hasMpn = ! empty($item['mpn']);

        if ($hasBrand) {
            $lines[] = '      <g:brand>'.htmlspecialchars(mb_substr((string) $item['brand'], 0, 70), ENT_XML1).'</g:brand>';
        }
        if ($hasGtin) {
            $lines[] = '      <g:gtin>'.htmlspecialchars((string) $item['gtin'], ENT_XML1).'</g:gtin>';
        }
        if ($hasMpn) {
            $lines[] = '      <g:mpn>'.htmlspecialchars(mb_substr((string) $item['mpn'], 0, 70), ENT_XML1).'</g:mpn>';
        }

        if (! $hasGtin && ! ($hasBrand && $hasMpn)) {
            $lines[] = '      <g:identifier_exists>no</g:identifier_exists>';
        }

        if (! empty($item['product_type'])) {
            $lines[] = '      <g:product_type>'.htmlspecialchars((string) $item['product_type'], ENT_XML1).'</g:product_type>';
        }
        if (! empty($item['color'])) {
            $lines[] = '      <g:color>'.htmlspecialchars(mb_substr((string) $item['color'], 0, 100), ENT_XML1).'</g:color>';
        }
        if (! empty($item['size'])) {
            $lines[] = '      <g:size>'.htmlspecialchars(mb_substr((string) $item['size'], 0, 100), ENT_XML1).'</g:size>';
        }
        if (! empty($item['weight_grams']) && (int) $item['weight_grams'] > 0) {
            $lines[] = '      <g:shipping_weight>'.((int) $item['weight_grams']).' g</g:shipping_weight>';
        }

        $lines[] = '    </item>';

        return $lines;
    }

    /** @return list<string> */
    private function resolveProductRasterImages(Product $product, string $storeBase, string $apiBase): array
    {
        $sorted = $product->images->sortByDesc(fn ($img): int => $img->is_primary ? 1 : 0);
        $urls = [];
        foreach ($sorted as $img) {
            $resolved = $this->resolveSingleRasterImageUrl($img->path, $storeBase, $apiBase);
            if ($resolved !== null && ! in_array($resolved, $urls, true)) {
                $urls[] = $resolved;
            }
        }

        return $urls;
    }

    private function resolveSingleRasterImageUrl(?string $rawPath, string $storeBase, string $apiBase): ?string
    {
        $path = trim((string) ($rawPath ?? ''));
        if ($path === '' || str_contains(mb_strtolower($path), 'placeholder')) {
            return null;
        }

        $cleanPathNoQuery = strtolower((string) strtok($path, '?#'));
        if (str_ends_with($cleanPathNoQuery, '.svg')) {
            return null;
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        if (str_starts_with($path, '/storage/') || str_starts_with($path, 'storage/')) {
            return $apiBase.'/'.ltrim($path, '/');
        }

        return $storeBase.'/'.ltrim($path, '/');
    }

    private function normalizeGtin(?string $raw): ?string
    {
        if ($raw === null) {
            return null;
        }
        $digits = preg_replace('/\D+/', '', $raw) ?? '';
        if (in_array(strlen($digits), [8, 12, 13, 14], true)) {
            return $digits;
        }

        return null;
    }

    /** @param  \Illuminate\Support\Collection<int, Category>  $allCategories */
    private function resolveCategoryPath(Product $product, $allCategories): ?string
    {
        $primary = $product->categories->first();
        if (! $primary) {
            return null;
        }

        $chain = [];
        $cursor = $allCategories->get((int) $primary->id) ?? $primary;
        $visited = [];
        while ($cursor !== null && ! isset($visited[$cursor->id])) {
            $visited[$cursor->id] = true;
            array_unshift($chain, $cursor->name);
            $cursor = $cursor->parent_id !== null ? $allCategories->get((int) $cursor->parent_id) : null;
        }

        return $chain !== [] ? implode(' > ', $chain) : null;
    }

    /**
     * @param  list<array<string, mixed>>  $incompleteProducts
     * @param  list<array<string, mixed>>  $warningProducts
     * @return list<array{code: string, severity: string, label: string, count: int}>
     */
    private function summarizeReasons(array $incompleteProducts, array $warningProducts): array
    {
        $counts = [];
        $labels = [
            'missing_image' => ['severity' => 'blocking', 'label' => 'Sem foto real do produto (bloqueia envio ao Shopping)'],
            'invalid_price' => ['severity' => 'blocking', 'label' => 'Preço de venda zerado ou inválido (bloqueia envio)'],
            'missing_identity' => ['severity' => 'blocking', 'label' => 'Nome, SKU ou slug ausente (bloqueia envio)'],
            'out_of_stock' => ['severity' => 'warning', 'label' => 'Sem estoque disponível (enviado como out_of_stock)'],
            'missing_brand' => ['severity' => 'warning', 'label' => 'Marca não informada (enviado com identifier_exists=no)'],
            'missing_gtin' => ['severity' => 'warning', 'label' => 'GTIN / código de barras ausente'],
            'short_description' => ['severity' => 'warning', 'label' => 'Descrição curta ou ausente'],
        ];

        foreach ($incompleteProducts as $prod) {
            foreach ($prod['blocking_issues'] as $iss) {
                $c = $iss['code'];
                $counts[$c] = ($counts[$c] ?? 0) + 1;
            }
            foreach ($prod['warnings'] as $w) {
                $c = $w['code'];
                $counts[$c] = ($counts[$c] ?? 0) + 1;
            }
        }
        foreach ($warningProducts as $prod) {
            foreach ($prod['warnings'] as $w) {
                $c = $w['code'];
                $counts[$c] = ($counts[$c] ?? 0) + 1;
            }
        }

        $out = [];
        foreach ($counts as $code => $cnt) {
            $meta = $labels[$code] ?? ['severity' => 'warning', 'label' => $code];
            $out[] = [
                'code' => $code,
                'severity' => $meta['severity'],
                'label' => $meta['label'],
                'count' => $cnt,
            ];
        }

        return $out;
    }

    /**
     * @param  array<string, mixed>|null  $encrypted
     * @return array<string, mixed>
     */
    public function decryptCredentials(?array $encrypted): array
    {
        if (! is_array($encrypted)) {
            return [];
        }
        $out = [];
        foreach ($encrypted as $k => $v) {
            if (! is_string($v) || $v === '') {
                continue;
            }
            try {
                $out[$k] = Crypt::decryptString($v);
            } catch (\Throwable) {
                $out[$k] = $v;
            }
        }

        return $out;
    }

    /** @return array<string, mixed>|null */
    public function sanitizeIntegrationForClient(?MarketingIntegration $integration): ?array
    {
        if (! $integration) {
            return null;
        }
        $creds = $this->decryptCredentials($integration->encrypted_credentials);
        $configuredKeys = array_keys(array_filter($creds, fn ($v): bool => is_string($v) && trim($v) !== ''));

        return [
            'id' => $integration->id,
            'platform' => $integration->platform,
            'name' => $integration->name,
            'status' => $integration->status,
            'account_id' => $integration->account_id,
            'account_name' => $integration->account_name,
            'property_id' => $integration->property_id,
            'pixel_id' => $integration->pixel_id,
            'settings' => $integration->settings ?? [],
            'configured_secret_keys' => $configuredKeys,
            'has_credentials' => $configuredKeys !== [],
            'last_synced_at' => $integration->last_synced_at?->toIso8601String(),
            'last_healthcheck_at' => $integration->last_healthcheck_at?->toIso8601String(),
            'last_healthcheck_status' => $integration->last_healthcheck_status,
            'last_healthcheck_message' => $integration->last_healthcheck_message,
        ];
    }
}
