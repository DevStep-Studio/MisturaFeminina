<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Brand;
use App\Models\Category;
use App\Models\ContentPage;
use App\Models\Product;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;

class SeoController extends Controller
{
    public const SITEMAP_CACHE_KEY = 'seo:sitemap';

    public const LLMS_CACHE_KEY = 'seo:llms';

    public const MERCHANT_FEED_CACHE_KEY = 'seo:merchant-feed';

    public static function clearCaches(): void
    {
        Cache::forget(self::SITEMAP_CACHE_KEY);
        Cache::forget(self::LLMS_CACHE_KEY);
        Cache::forget(self::MERCHANT_FEED_CACHE_KEY);
    }

    public function sitemap(): Response
    {
        $content = Cache::remember(self::SITEMAP_CACHE_KEY, 600, function (): string {
            $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');
            $latestProductAt = Product::query()->where('is_active', true)->max('updated_at');
            $latestCategoryAt = Category::query()->where('is_active', true)->max('updated_at');
            $rootLastMod = collect([$latestProductAt, $latestCategoryAt])
                ->filter()
                ->map(fn ($value) => Carbon::parse((string) $value))
                ->max()?->toAtomString();

            $urls = [
                ['loc' => $base.'/', 'lastmod' => $rootLastMod],
                ['loc' => $base.'/categorias', 'lastmod' => $latestCategoryAt ? Carbon::parse((string) $latestCategoryAt)->toAtomString() : null],
                ['loc' => $base.'/marcas'],
                ['loc' => $base.'/promocoes'],
                ['loc' => $base.'/novidades'],
                ['loc' => $base.'/contato'],
            ];

            Category::query()->where('is_active', true)->get(['slug', 'updated_at'])->each(function (Category $c) use (&$urls, $base): void {
                $urls[] = [
                    'loc' => $base.'/categoria/'.$c->slug,
                    'lastmod' => $c->updated_at?->toAtomString(),
                ];
            });

            Brand::query()->where('is_active', true)->get(['slug', 'updated_at'])->each(function (Brand $b) use (&$urls, $base): void {
                $urls[] = [
                    'loc' => $base.'/marca/'.$b->slug,
                    'lastmod' => $b->updated_at?->toAtomString(),
                ];
            });

            Product::query()->where('is_active', true)->get(['slug', 'updated_at'])->each(function (Product $p) use (&$urls, $base): void {
                $urls[] = [
                    'loc' => $base.'/produto/'.$p->slug,
                    'lastmod' => $p->updated_at?->toAtomString(),
                ];
            });

            ContentPage::query()->where('is_published', true)->get(['slug', 'updated_at'])->each(function (ContentPage $page) use (&$urls, $base): void {
                if ($page->slug === 'contato') {
                    return;
                }
                $urls[] = [
                    'loc' => $base.'/'.$page->slug,
                    'lastmod' => $page->updated_at?->toAtomString(),
                ];
            });

            $urls = array_slice($urls, 0, 50000);

            $xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
            foreach ($urls as $item) {
                $xml[] = '  <url>';
                $xml[] = '    <loc>'.htmlspecialchars($item['loc'], ENT_XML1).'</loc>';
                if (! empty($item['lastmod'])) {
                    $xml[] = '    <lastmod>'.$item['lastmod'].'</lastmod>';
                }
                $xml[] = '  </url>';
            }
            $xml[] = '</urlset>';

            return implode("\n", $xml);
        });

        return response($content, 200, ['Content-Type' => 'application/xml; charset=UTF-8']);
    }

    public function robots(): Response
    {
        $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $lines = [
            'User-agent: *',
            'Allow: /',
            'Allow: /assets/',
            'Allow: /storage/',
            'Allow: /*.css$',
            'Allow: /*.js$',
            'Allow: /*.png$',
            'Allow: /*.jpg$',
            'Allow: /*.jpeg$',
            'Allow: /*.webp$',
            'Allow: /*.avif$',
            'Allow: /*.svg$',
            'Allow: /*.woff2$',
            'Disallow: /admin/',
            'Disallow: /dashboard/',
            'Disallow: /app',
            'Disallow: /checkout',
            'Disallow: /carrinho',
            'Disallow: /favoritos',
            'Disallow: /minha-conta',
            'Disallow: /pedido/',
            'Disallow: /login',
            'Disallow: /entrar',
            'Disallow: /cadastro',
            'Disallow: /forgot-password',
            'Disallow: /reset-password',
            'Disallow: /buscar',
            'Disallow: /api/',
            'Disallow: /*?*q=',
            'Disallow: /*?*collection=',
            'Disallow: /*?*sort=',
            'Disallow: /*?*min_price=',
            'Disallow: /*?*max_price=',
            'Disallow: /*?*brand=',
            'Disallow: /*?*brands=',
            'Disallow: /*?*category=',
            'Disallow: /*?*categories=',
            'Disallow: /*?*in_stock=',
            '',
            'Sitemap: '.$base.'/sitemap.xml',
        ];

        return response(implode("\n", $lines), 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }

    public function llms(): Response
    {
        $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $categories = Category::query()
            ->where('is_active', true)
            ->whereNull('parent_id')
            ->orderBy('sort_order')
            ->get(['name', 'slug']);

        $pages = ContentPage::query()
            ->where('is_published', true)
            ->get(['title', 'slug']);

        $md = [];
        $md[] = '# Mistura Feminina Cosméticos';
        $md[] = '';
        $md[] = '> Loja online oficial de cosméticos, produtos de beleza, maquiagem, esmaltaria e cuidados pessoais no Brasil.';
        $md[] = '';
        $md[] = 'A Mistura Feminina Cosméticos é um e-commerce brasileiro especializado em cosméticos, maquiagem, esmaltes em gel, produtos profissionais para unhas, cuidados faciais (skincare), cronograma capilar e acessórios de beleza. Oferece envio para todo o território nacional, parcelamento em até 6x sem juros e pagamento via Pix com desconto.';
        $md[] = '';
        $md[] = '## Catálogo e Seções Principais';
        $md[] = '- [Página Inicial]('.$base.'/): Vitrines, ofertas da semana, cupons de desconto e produtos em destaque.';
        $md[] = '- [Todas as Categorias]('.$base.'/categorias): Navegação completa pelas categorias de beleza e cosméticos.';
        $md[] = '- [Marcas Oficiais]('.$base.'/marcas): Catálogo de marcas parceiras e produtos originais certificados.';
        $md[] = '- [Promoções e Ofertas]('.$base.'/promocoes): Produtos com preços promocionais e descontos exclusivos.';
        $md[] = '- [Lançamentos e Novidades]('.$base.'/novidades): Os mais recentes lançamentos do mercado de estética e cosméticos.';
        $md[] = '';
        $md[] = '## Categorias em Destaque';

        foreach ($categories as $cat) {
            $md[] = "- [{$cat->name}]({$base}/categoria/{$cat->slug}): Produtos e linhas selecionadas de {$cat->name}.";
        }

        $md[] = '';
        $md[] = '## Políticas Comerciais e Atendimento ao Cliente';
        $md[] = '- [Política de Entrega e Frete]('.$base.'/entrega): Prazos de envio, cálculo de CEP, rastreamento e frete grátis conforme valor mínimo.';
        $md[] = '- [Trocas e Devoluções]('.$base.'/trocas-e-devolucoes): Diretrizes de trocas, devoluções e garantia de 7 dias conforme o Código de Defesa do Consumidor.';
        $md[] = '- [Formas de Pagamento]('.$base.'/pagamento): Informações sobre Pix, cartões de crédito aceitos, parcelamento sem juros e segurança nas transações.';
        $md[] = '- [Dúvidas Frequentes (FAQ)]('.$base.'/duvidas): Esclarecimentos sobre pedidos, prazos de entrega, status e produtos.';
        $md[] = '- [Fale Conosco e Atendimento]('.$base.'/contato): Canais oficiais de suporte via WhatsApp e e-mail comercial.';
        $md[] = '- [Política de Privacidade (LGPD)]('.$base.'/privacidade): Tratamento seguro e transparente de dados pessoais dos clientes.';
        $md[] = '- [Termos de Uso]('.$base.'/termos): Condições gerais de compra, contratação e navegação na loja online.';

        if ($pages->isNotEmpty()) {
            $md[] = '';
            $md[] = '## Informações Institucionais';
            foreach ($pages as $page) {
                if (! in_array($page->slug, ['entrega', 'trocas-e-devolucoes', 'pagamento', 'duvidas', 'contato', 'privacidade', 'termos'], true)) {
                    $md[] = "- [{$page->title}]({$base}/{$page->slug})";
                }
            }
        }

        $md[] = '';
        $md[] = '---';
        $md[] = 'Informações atualizadas automaticamente a partir do catálogo oficial da Mistura Feminina Cosméticos.';

        return response(implode("\n", $md), 200, ['Content-Type' => 'text/markdown; charset=UTF-8']);
    }

    public function merchantFeed(): Response
    {
        $content = Cache::remember(self::MERCHANT_FEED_CACHE_KEY, 600, function (): string {
            $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');
            $products = Product::query()
                ->where('is_active', true)
                ->with(['brand:id,name', 'images', 'variants' => fn ($q) => $q->where('is_active', true)])
                ->orderBy('id')
                ->get();

            $xml = [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
                '  <channel>',
                '    <title>Mistura Feminina Cosméticos — Catálogo</title>',
                '    <link>'.htmlspecialchars($base.'/', ENT_XML1).'</link>',
                '    <description>Feed oficial de produtos da Mistura Feminina Cosméticos para Google Merchant Center.</description>',
            ];

            foreach ($products as $product) {
                $defaultVariant = $product->variants->firstWhere('is_default', true) ?? $product->variants->first();
                $priceCents = $defaultVariant->price_cents ?? $product->price_cents;
                $effectiveCents = $defaultVariant ? $defaultVariant->effectivePriceCents() : $product->effectivePriceCents();
                $inStock = $product->variants->contains(fn ($v) => $v->availableStock() > 0);
                $primaryImage = $product->images->firstWhere('is_primary', true)->path
                    ?? $product->images->first()->path
                    ?? '/placeholder-product.svg';
                $imageUrl = str_starts_with($primaryImage, 'http')
                    ? $primaryImage
                    : $base.'/'.ltrim($primaryImage, '/');
                $desc = trim((string) ($product->short_description ?: strip_tags((string) $product->description) ?: $product->name));

                $xml[] = '    <item>';
                $xml[] = '      <g:id>'.htmlspecialchars($defaultVariant?->sku ?: $product->sku, ENT_XML1).'</g:id>';
                $xml[] = '      <g:title>'.htmlspecialchars($product->name, ENT_XML1).'</g:title>';
                $xml[] = '      <g:description>'.htmlspecialchars(mb_substr($desc, 0, 5000), ENT_XML1).'</g:description>';
                $xml[] = '      <g:link>'.htmlspecialchars($base.'/produto/'.$product->slug, ENT_XML1).'</g:link>';
                $xml[] = '      <g:image_link>'.htmlspecialchars($imageUrl, ENT_XML1).'</g:image_link>';
                $xml[] = '      <g:condition>new</g:condition>';
                $xml[] = '      <g:availability>'.($inStock ? 'in_stock' : 'out_of_stock').'</g:availability>';
                $xml[] = '      <g:price>'.number_format($priceCents / 100, 2, '.', '').' BRL</g:price>';
                if ($effectiveCents < $priceCents) {
                    $xml[] = '      <g:sale_price>'.number_format($effectiveCents / 100, 2, '.', '').' BRL</g:sale_price>';
                }
                if ($product->brand?->name) {
                    $xml[] = '      <g:brand>'.htmlspecialchars($product->brand->name, ENT_XML1).'</g:brand>';
                }
                if (! empty($product->gtin)) {
                    $xml[] = '      <g:gtin>'.htmlspecialchars($product->gtin, ENT_XML1).'</g:gtin>';
                }
                $xml[] = '    </item>';
            }

            $xml[] = '  </channel>';
            $xml[] = '</rss>';

            return implode("\n", $xml);
        });

        return response($content, 200, ['Content-Type' => 'application/xml; charset=UTF-8']);
    }
}
