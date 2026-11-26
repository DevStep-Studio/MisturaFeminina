<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Domain\Marketing\Services\GoogleMerchantFeedService;
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
        Cache::forget(GoogleMerchantFeedService::FEED_CACHE_KEY);
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
                ['loc' => $base.'/atacado'],
                ['loc' => $base.'/rastrear-pedido'],
            ];

            $activeCats = Category::query()
                ->where('is_active', true)
                ->get(['id', 'parent_id', 'slug', 'updated_at'])
                ->keyBy('id');

            $activeCats->each(function (Category $c) use (&$urls, $base, $activeCats): void {
                $cursor = $c;
                $visited = [];
                while ($cursor->parent_id !== null) {
                    if (isset($visited[$cursor->id])) {
                        return;
                    }
                    $visited[$cursor->id] = true;
                    $parent = $activeCats->get((int) $cursor->parent_id);
                    if (! $parent) {
                        return;
                    }
                    $cursor = $parent;
                }
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

            $dedupedUrls = [];
            $seenLocs = [];
            foreach ($urls as $item) {
                if (! isset($seenLocs[$item['loc']])) {
                    $seenLocs[$item['loc']] = true;
                    $dedupedUrls[] = $item;
                }
            }

            $urls = array_slice($dedupedUrls, 0, 50000);

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

    public function merchantFeed(GoogleMerchantFeedService $feedService): Response
    {
        $content = $feedService->renderXml();

        return response($content, 200, ['Content-Type' => 'application/xml; charset=UTF-8']);
    }
}
