<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Brand;
use App\Models\Category;
use App\Models\ContentPage;
use App\Models\Product;
use Illuminate\Http\Response;

class SeoController extends Controller
{
    public function sitemap(): Response
    {
        $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $urls = [
            ['loc' => $base.'/', 'lastmod' => now()->toDateString()],
            ['loc' => $base.'/categorias'],
            ['loc' => $base.'/marcas'],
            ['loc' => $base.'/promocoes'],
            ['loc' => $base.'/novidades'],
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
            $urls[] = [
                'loc' => $base.'/'.$page->slug,
                'lastmod' => $page->updated_at?->toAtomString(),
            ];
        });

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

        return response(implode("\n", $xml), 200, ['Content-Type' => 'application/xml; charset=UTF-8']);
    }

    public function robots(): Response
    {
        $base = rtrim((string) config('app.frontend_url', config('app.url')), '/');
        $lines = [
            'User-agent: *',
            'Allow: /',
            'Disallow: /admin/',
            'Disallow: /dashboard/',
            'Disallow: /checkout',
            'Disallow: /carrinho',
            'Disallow: /minha-conta',
            'Disallow: /login',
            'Disallow: /entrar',
            'Disallow: /cadastro',
            'Disallow: /forgot-password',
            'Disallow: /reset-password',
            'Disallow: /buscar',
            'Disallow: /api/',
            '',
            'Sitemap: '.$base.'/sitemap.xml',
        ];

        return response(implode("\n", $lines), 200, ['Content-Type' => 'text/plain; charset=UTF-8']);
    }
}
