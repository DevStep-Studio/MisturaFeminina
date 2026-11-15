# Plano de Implementação — SEO Técnico, Indexação Google, Schema.org e Google Analytics 4

> **Data:** 15 de novembro de 2026  
> **Objetivo:** Auditar, corrigir e implementar toda a infraestrutura técnica de SEO, sitemap.xml dinâmico, robots.txt, metadados Open Graph/Twitter, dados estruturados Schema.org e rastreamento oficial do Google Analytics 4 (GA4).

---

## 1. Auditoria Inicial e Diagnóstico

### Arquitetura Atual
- **Backend:** Laravel 11 (PHP 8.2+) em API RESTful (`http://localhost:8432`)
- **Frontend:** SolidJS 1.9 + Vite + TailwindCSS v4 + TanStack Router (`http://localhost:4321`)
- **Mecanismo:** Single Page Application (SPA) reativa com rotas tipadas client-side e endpoints de SEO server-side no backend.

### Problemas Críticos Encontrados na Auditoria
1. **Bloqueio Global no `robots.txt` do Frontend:** `frontend/build/seo-assets.ts` emitia `Disallow: /` por padrão quando `VITE_SITE_INDEXABLE` não estava explicitamente configurado como `"true"`. Isso bloqueava 100% dos rastreadores do Googlebot.
2. **`sitemap.xml` Vazio no Frontend:** O arquivo `/sitemap.xml` gerado no build do Vite retornava uma tag `<urlset>` vazia, sem incluir produtos, categorias, marcas ou páginas do catálogo.
3. **Tags Obsoletas no Sitemap do Backend:** O `SeoController.php` do backend emitia `<changefreq>` e `<priority>`, ignorados pelo Googlebot conforme as diretrizes do Google Search Central, e faltava formatação W3C Datetime estrita no `lastmod`.
4. **Metadados Incompletos nas Páginas Dinâmicas:** A página de detalhes do produto (`/produto/$slug`) e categorias não possuíam dados estruturados Schema.org completos (`Product`, `Offer`, `BreadcrumbList`, `Organization`).
5. **Google Analytics 4 sem Suporte Direto a ID `G-XXXXXXXXXX`:** O módulo `analytics.ts` só aceitava `GTM-` e não possuía os eventos canônicos de E-commerce do GA4 (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`, `search`).
6. **Ausência de Meta Tag do Google Search Console:** Sem suporte configurável a `google-site-verification`.

---

## 2. Tarefas de Implementação

### Tarefa 1: Correção do `robots.txt` e `sitemap.xml` no Backend e Frontend
- **Backend (`SeoController.php`):**
  - Remover `<priority>` e `<changefreq>`.
  - Garantir `lastmod` em formato W3C Datetime (`Y-m-d\TH:i:sP`).
  - Bloquear rotas privadas no `robots.txt`: `/admin/`, `/checkout`, `/carrinho`, `/minha-conta`, `/login`, `/entrar`, `/cadastro`, `/forgot-password`, `/reset-password`, `/buscar`, `/api/`.
  - Permitir explicitamente `Allow: /`.
  - Definir a URL do `Sitemap` usando o domínio público frontend.
- **Frontend (`build/seo-assets.ts` e `src/lib/site.ts`):**
  - Corrigir a lógica de `site.indexable` para que em produção seja `true` por padrão (a menos que `VITE_SITE_INDEXABLE === "false"`).
  - Configurar proxy e rotas para que `/robots.txt` e `/sitemap.xml` sirvam a versão canônica e atualizada.

### Tarefa 2: Metadados Centralizados e Verificação do Search Console
- **`frontend/src/lib/seo.ts`:**
  - Adicionar suporte à meta tag `google-site-verification` via variável `VITE_GOOGLE_SITE_VERIFICATION`.
  - Garantir meta tags canônicas, `og:locale` (`pt_BR`), `og:site_name`, `twitter:card` (`summary_large_image`).
  - Atualizar `theme-color` no `index.html` para `#93509E`.

### Tarefa 3: Dados Estruturados Schema.org (JSON-LD)
- **Homepage (`/`):**
  - Injetar `Organization` (dados da Mistura Feminina Cosméticos, logo, site, contatos).
  - Injetar `WebSite` com `SearchAction` apontando para `/buscar?q={search_term_string}`.
- **Página de Detalhes do Produto (`/produto/$slug`):**
  - Injetar `Product` com `name`, `description`, `image`, `sku`, `brand`, e `offers` (`Offer` com preço real em centavos formatado, moeda `BRL`, status de estoque `InStock` ou `OutOfStock`, URL canônica).
- **Catálogo e Categorias (`/categoria/$slug`, `/buscar`):**
  - Injetar `BreadcrumbList` com hierarquia de navegação rastreável.

### Tarefa 4: Google Analytics 4 (GA4) com Eventos Canônicos de E-commerce
- **`frontend/src/monitoring/analytics.ts`:**
  - Suporte a `VITE_GA4_MEASUREMENT_ID` (`G-XXXXXXXXXX`).
  - Script oficial do Google `gtag.js` com inicialização e controle de consentimento.
  - Registro automático de `page_view` a cada mudança de rota.
  - Funções de rastreamento para eventos canônicos do GA4:
    - `trackViewItem(product)`
    - `trackAddToCart(product, quantity)`
    - `trackBeginCheckout(cart)`
    - `trackPurchase(order)` (com proteção contra duplicação de transação)
    - `trackSearch(query)`
    - `trackContactClick(channel)`

### Tarefa 5: Integração dos Eventos no Frontend
- Vincular `trackViewItem` em `/produto/$slug`.
- Vincular `trackAddToCart` na adição ao carrinho.
- Vincular `trackBeginCheckout` no botão de ir para o checkout.
- Vincular `trackPurchase` na página de confirmação de pedido.
- Vincular `trackSearch` na barra de pesquisa.

### Tarefa 6: Testes, Validação e Relatório
- Executar testes automatizados no frontend e backend.
- Validar `curl -I /robots.txt` e `curl /sitemap.xml`.
- Validar extração de JSON-LD e meta tags com Playwright.
- Auto-commit das alterações.
- Apresentar o Relatório Final Completo (seções A até L exigidas no prompt).
