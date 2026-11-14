# Fase 0 — Descoberta, Auditoria Técnica e Matriz de Referência

**Projeto:** Mistura Feminina Cosméticos — E-commerce Completo + Backoffice  
**Data da auditoria:** 14/11/2026  
**Padrão base:** `https://github.com/DevStep-Studio/Estrutura-Projeto` (commit `32831d0029ba12aaeca4c1e22970371681b4d0cf`)  
**Referência de UX/IA pública:** `https://www.jackcosmeticos.com.br/` (inspeção pública somente leitura)

---

## 1. Auditoria Factual do Repositório DevStep (`Estrutura-Projeto`)

### 1.1 Arquitetura e Stack Encontrada
O repositório oficial da DevStep utiliza um **monorepo desacoplado (`backend/` + `frontend/`)** orquestrado por scripts na raiz:

- **Raiz:** `iniciar.sh`, `iniciar.bat`, `scripts/dev.mjs`, `scripts/dev-backend.php`, `.github/workflows/`.
- **Backend (`backend/`):**
  - **Laravel 13** (`laravel/framework ^13.17`, PHP `^8.3`, ambiente local rodando **PHP 8.5.10**).
  - **Autenticação:** Laravel Sanctum `^4.4` em modo **cookie stateful SPA** (`EnsureFrontendRequestsAreStateful`, `SESSION_DRIVER=database`, `XSRF-TOKEN` / `X-XSRF-TOKEN`, `POST /login`, `POST /logout`, `POST /forgot-password`, `POST /reset-password`). Sem emissão de bearer tokens públicos.
  - **Padrão de código:** Domínios em `app/Domain/<Dominio>/` (Actions, Enums, Services), Controllers em `app/Http/Controllers/Api/V1/`, FormRequests dedicados, Policies via `Gate::authorize(...)`, API Resources, Middleware `RequestContext` com `X-Request-ID` em respostas e erros JSON.
  - **Ferramentas e qualidade:** Pest `^4.7`, Larastan `^3.15` (level 5), Laravel Pint `^1.27`, Dedoc Scramble `^0.13.53` (`/docs/api` restrito a `local`), Laravel Horizon `^5.51`, Sentry `^4.30`.
  - **Comandos Artisan existentes:** `devstep:user {email} {--name=}`, `devstep:health`.
- **Frontend (`frontend/`):**
  - **SolidJS `^1.9.0` + TypeScript `^5.9.0`** com Vite `^8.3.8` e **Tailwind CSS v4** (`@tailwindcss/vite`).
  - **Roteamento, Dados e Formulários:** `@tanstack/solid-router`, `@tanstack/solid-query`, `@tanstack/solid-form`, validação com `zod ^4.0.0`, ícones `lucide-solid` (imports individuais por ícone), `gsap` (import dinâmico respeitando `prefers-reduced-motion`).
  - **Segurança/Monitoramento/SEO:** `src/lib/api.ts` (CSRF automático, timeout, AbortSignal, deduplicação GET, `X-Request-ID`), `src/security/` (guards, safe-redirect, session state), `src/lib/seo.ts` (`seoHead` com Open Graph, canonical e JSON-LD), `src/components/privacy/consent-banner.tsx`, `scripts/check-bundle-budget.mjs`.
  - **Testes:** Vitest `^5.1.0` (unit + integration), Playwright `^1.65.0` + `@axe-core/playwright`.

### 1.2 Decisão Arquitetural e Justificativa Técnica
Conforme a diretriz do briefing (*"Se o repositório Devstep exigir frontend/backend separados, seguir o padrão existente e justificar tecnicamente, mantendo contratos explícitos. Não impor nova arquitetura destrutiva"*):

- **Preservamos integralmente** a separação `backend/` (Laravel 13 API) + `frontend/` (SolidJS + TanStack Router/Query/Form + Tailwind CSS 4) do padrão DevStep, incluindo `iniciar.sh`, `scripts/dev.mjs`, Sanctum stateful SPA, `app/Domain/*`, `X-Request-ID`, Scramble, Pint, Larastan, Pest, Vitest e Playwright.
- **Divergência documentada em relação à preferência genérica do briefing (React/Inertia):** O repositório oficial DevStep já vem estruturado com **SolidJS + TanStack** em `frontend/` e **Laravel API** em `backend/`. Adotar React/Inertia destruiria o padrão DevStep e seus scripts/testes/orçamentos de bundle. Seguimos o padrão real DevStep e adicionamos rotas públicas SEO (`robots.txt`, `sitemap.xml` dinâmicos no backend + metas e JSON-LD via `@tanstack/solid-router` no frontend).
- **Banco de dados local vs. produção:**
  - `MySQL 8.4` é o padrão de produção/staging documentado (`backend/.env.example`, `DB_DATABASE=mistura_feminina`).
  - Neste ambiente macOS, `mysqld` está ativo, porém o usuário `root@localhost` exige senha não informada (e não alteramos/forçamos credenciais existentes). Os testes automatizados usam SQLite `:memory:` (conforme `phpunit.xml` do DevStep), e para execução local interativa suportamos `DB_CONNECTION=sqlite` (fallback local em `scripts/dev-backend.php`) além de `mysql`/`mariadb`, mantendo todas as migrations e travas transacionais (`DB::transaction` + `lockForUpdate` + atualização atômica condicional de estoque) 100% compatíveis com MySQL 8.4 e SQLite.

---

## 2. Auditoria Visual e Funcional Pública da Referência (`jackcosmeticos.com.br`)

Auditoria realizada em **14/11/2026** nas URLs públicas (`/` , `/acessorios`, `/alongamento-unhas/top-coat-soak-off-bella-rosa`) nos viewports **Desktop (1366×768)** e **Mobile (390×844)**, além das capturas de referência anexadas ao briefing.  
*Nota: nenhum código proprietário, logotipo, imagem, preço, texto comercial ou catálogo da referência foi ou será copiado.*

### 2.1 Matriz "Referência → Componente Mistura Feminina → Estado"

| Elemento / Fluxo na Referência | Observado na Inspeção Pública | Componente / Módulo Mistura Feminina | Estado |
|---|---|---|---|
| Faixa superior de benefícios (ticker) | Faixa roxa com mensagens repetidas (parcelamento, frete grátis, preços) | `BenefitsBar` (configurável no Admin > Aparência/Marketing) | Planejado (Fase 1-2) |
| Cabeçalho desktop/mobile | Desktop: Busca à esquerda, Logo central, Atendimento/Conta/Sacola à direita. Mobile: Hamburger + Busca, Logo, Conta + Sacola | `Header` + `SearchBar` com autocomplete, debounce e cancelamento | Planejado (Fase 1-2) |
| Barra de departamentos + "Todas Categorias" | Trigger "Todas Categorias" + categorias com submenus dropdown + pill "Promoções" | `CategoryMenu` (multinível desktop + drawer mobile, dados reais) | Planejado (Fase 1-2) |
| Modal / Pop-up promocional de cupom | Pop-up com código copiável e vitrine; no mobile da referência sobrepõe textos por transparência | `PromoPopup` (opaco, acessível, sem transparência, desativável no Admin) | Planejado (Fase 2) |
| Carrossel Hero (Desktop/Mobile) | Slider full-width com setas e paginação | `HeroCarousel` (imagens desktop/mobile distintas, agendamento e CTA) | Planejado (Fase 1-2) |
| Faixa de cupom copiável | Texto promocional + código tracejado + botão Copiar | `CouponStrip` (vinculado a cupom real ativo) | Planejado (Fase 2) |
| Linha de 5 benefícios com ícones | Parcelamento, Envios Brasil, WhatsApp, Segurança, 1ª Compra | `BenefitsRow` (itens editáveis no backoffice) | Planejado (Fase 1-2) |
| Navegação circular por categorias | Carrossel "Navegue por Categorias" com miniaturas | `CategoryCircles` | Planejado (Fase 2) |
| Vitrines / Carrosséis de produtos | "Ofertas da semana", vitrines por categoria/marca, "Mais vendidos", "Novidades", "Destaques" | `ProductCarousel` / `ProductGrid` gerenciados via `home_sections` | Planejado (Fase 2) |
| Card de produto | Foto, selos (`-XX% OFF`, `LANÇAMENTO`, `DESTAQUE`, `Esgotado`), título, preço antigo/atual, parcelamento, CTA `Comprar`, CTA `WhatsApp` ou `Avise-me` | `ProductCard`, `PriceBlock`, `AvailabilityBadge` | Planejado (Fase 1-2) |
| Página de categoria (`/categoria/{slug}`) | Banner topo, breadcrumb, filtros laterais (marca, preço, disponibilidade, atributos), ordenação, grid + paginação | `CategoryPage` + `FilterSidebar` + `Breadcrumb` | Planejado (Fase 2) |
| Página de produto (`/produto/{slug}`) | Galeria, marca/modelo/SKU, estrelas, disponibilidade / "Avise-me quando chegar", preço/parcelas/Pix, variações, quantidade, Comprar/WhatsApp, frete CEP, descrição, relacionados | `ProductDetailPage` + `ShippingQuote` + `RestockForm` + `ReviewsSection` | Planejado (Fase 2-3) |
| Mini-carrinho lateral (drawer) | Drawer com itens, quantidade, subtotal e CTA finalizar | `CartDrawer` persistido no backend (visitante e logado) | Planejado (Fase 3) |
| Seção de depoimentos | Carrossel "Quem compra indica!" | `TestimonialsSection` (somente avaliações moderadas/autorizadas) | Planejado (Fase 2/4) |
| Newsletter + Mapa de categorias + Rodapé | Faixa de cadastro (nome + e-mail), botão expandir mapa, colunas Categorias / Institucional / Atendimento / Pagamentos / Selos / CNPJ | `NewsletterSection` (opt-in explícito LGPD) + `Footer` dinâmico | Planejado (Fase 1-2) |
| Consentimento de cookies | Banner inferior fixo com link para Política de Privacidade | `ConsentBanner` (já presente no padrão DevStep, integrado a GA4/Meta Pixel) | Base existente -> Fase 5 |
| Fluxo interno de Checkout, Pagamento e Rastreio | **A validar** (não executamos checkout na loja de terceiro por regra ética/técnica) | Implementação própria completa: `/checkout`, Mercado Pago Orders API v1 (Pix + Cartão), Melhor Envio/Correios + Fallback, `/pedido/{token}/confirmacao`, `/rastrear-pedido` | Planejado (Fase 3) |

---

## 3. Design Tokens Iniciais (Mistura Feminina Cosméticos)

- Estética limpa, comercial, alto contraste, **sem gradientes e sem transparências decorativas**.
- Valores iniciais neutros e editáveis via Backoffice (`store_settings` → injetados via CSS custom properties no `:root` ao carregar a loja):
  - `--brand-primary`: `#8B2252` (Vinho/Rosa Cosmético sólido, alto contraste com branco)
  - `--brand-primary-hover`: `#6E1840`
  - `--brand-secondary`: `#231F20` (Grafite escuro sólido para contrastes e barras)
  - `--brand-accent`: `#C44577`
  - `--surface-page`: `#FFFFFF`
  - `--surface-subtle`: `#F8F7F8`
  - `--text-ink`: `#18181B`
  - `--text-muted`: `#52525B`
  - `--border-line`: `#E4E4E7`
- Viewports alvo obrigatórios: `375`, `390`, `430`, `768`, `1024`, `1366`, `1920` px.

---

## 4. Backlog Priorizado por Fases

1. **Fase 1 (Fundação Real):** Migrations completas do e-commerce, RBAC + Roles/Permissions + 2FA opcional no admin, Auth pública (`/entrar`, `/cadastro`, `/esqueci-minha-senha`) + bootstrap seguro `mistura:admin`, upload seguro de mídia/storage, Shell da Loja (`Header`, `BenefitsBar`, `CategoryMenu`, `Footer`, páginas de erro/manutenção), seeders demonstrativos mínimos claramente marcados.
2. **Fase 2 (Catálogo, Busca, Home Modular e Estoque):** CRUD completo de marcas, categorias multinível, atributos/variações, produtos simples/variáveis/kits, movimentações de estoque e reservas, import/export CSV, busca com debounce/normalização de acentos, páginas `/`, `/categorias`, `/categoria/{slug}`, `/marcas`, `/marca/{slug}`, `/buscar`, `/produto/{slug}`, `/promocoes`, `/novidades`, `/ofertas`, `/favoritos`, CMS institucional e SEO (`sitemap.xml`, `robots.txt`, JSON-LD, redirects 301).
3. **Fase 3 (Conversão: Carrinho, Frete, Checkout e Mercado Pago Sandbox):** Carrinho persistido (visitante UUID + merge no login), cupons e promoções com invalidação automática, `ShippingProvider` (Melhor Envio / Correios + tabela fallback + retirada/motoboy configuráveis), Checkout transparente visitante/cliente com **Mercado Pago Orders API v1** (Pix QR + copia-e-cola + expiração; Cartão tokenizado + parcelas), Webhook idempotente com validação `x-signature` HMAC-SHA256, job de reconciliação e liberação de reservas expiradas, e-mails transacionais enfileirados, `/pedido/{token}/confirmacao`, `/minha-conta/*`, `/rastrear-pedido`.
4. **Fase 4 (Backoffice Completo `/admin`):** Visão geral com KPIs reais, Pedidos (separação, packing list, etiqueta/rastreio, cancelamento, reembolso), Produtos/Variantes/Estoque/Importação, Clientes/LGPD, Construtor de Home por blocos, Banners desktop/mobile com preview e agendamento, Marketing (cupons, benefícios, newsletter, pop-up), Frete, Pagamentos/Webhooks/Reconciliação, Relatórios com exportação CSV, Configurações da Loja (logo, favicon, cores, CNPJ, WhatsApp, templates), Equipe/RBAC, Monitoramento/Auditoria/Backups.
5. **Fase 5 (Qualidade, Segurança, E2E, Documentação):** Pest feature/concurrency/webhook tests, Larastan, Pint, Vitest, ESLint, Prettier, Playwright E2E + Axe-core + screenshots desktop/mobile + evidência de compra integral em sandbox, backup/restauração, `docs/ARQUITETURA.md`, `docs/ADMIN_MANUAL.md`, `docs/DEPLOY.md`, `docs/INTEGRACOES.md`, `docs/TESTES_ACEITE.md`.
