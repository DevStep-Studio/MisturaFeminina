<?php

declare(strict_types=1);

use Database\Seeders\DemoStoreSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->seed(DemoStoreSeeder::class);
});

test('robots.txt returns valid directives and points to sitemap', function (): void {
    $response = $this->get('/robots.txt');

    $response->assertOk();
    $response->assertHeader('Content-Type', 'text/plain; charset=UTF-8');
    expect($response->getContent())
        ->toContain('User-agent: *')
        ->toContain('Allow: /')
        ->toContain('Disallow: /admin/')
        ->toContain('Disallow: /checkout')
        ->toContain('Disallow: /*?*brand=')
        ->toContain('Disallow: /*?*category=')
        ->toContain('Sitemap: ');
});

test('sitemap.xml generates valid xml with categories and products', function (): void {
    $response = $this->get('/sitemap.xml');

    $response->assertOk();
    $response->assertHeader('Content-Type', 'application/xml; charset=UTF-8');
    expect($response->getContent())
        ->toContain('<?xml version="1.0" encoding="UTF-8"?>')
        ->toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
        ->toContain('/categoria/')
        ->toContain('/produto/');
});

test('llms.txt provides structured markdown information about the store', function (): void {
    $response = $this->get('/llms.txt');

    $response->assertOk();
    $response->assertHeader('Content-Type', 'text/markdown; charset=UTF-8');
    expect($response->getContent())
        ->toContain('# Mistura Feminina Cosméticos')
        ->toContain('## Catálogo e Seções Principais')
        ->toContain('## Categorias em Destaque')
        ->toContain('## Políticas Comerciais e Atendimento ao Cliente')
        ->toContain('/categoria/unhas-e-esmalteria');
});

test('merchant-feed.xml returns valid Google Merchant Center RSS feed with real products', function (): void {
    $response = $this->get('/merchant-feed.xml');

    $response->assertOk();
    $response->assertHeader('Content-Type', 'application/xml; charset=UTF-8');
    expect($response->getContent())
        ->toContain('<?xml version="1.0" encoding="UTF-8"?>')
        ->toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">')
        ->toContain('<g:price>')
        ->toContain(' BRL</g:price>')
        ->toContain('<g:availability>');
});
