# Arquitetura — Mistura Feminina Cosméticos

## 1. Visão Geral do Monorepo (Padrão DevStep)
O projeto preserva integralmente a arquitetura oficial do repositório **DevStep-Studio/Estrutura-Projeto**:
- **`backend/` (Laravel 13 + PHP 8.3+):** API RESTful em `/api/v1/*`, autenticação stateful com **Laravel Sanctum** (cookies SPA + CSRF `X-XSRF-TOKEN`), domínios organizados em `app/Domain/*`, controllers versionados em `app/Http/Controllers/Api/V1/*`, RBAC granular e filas em driver `database` (compatível com Redis/Horizon).
- **`frontend/` (SolidJS 1.9 + TypeScript 5.9 + Tailwind CSS v4):** Roteamento type-safe com **TanStack Solid Router**, cache e queries com **TanStack Solid Query**, ícones individuais `lucide-solid`, SEO dinâmico via `seoHead` (`frontend/src/lib/seo.ts`), e painel administrativo completo sob `/admin`.
- **`scripts/` + `iniciar.sh` / `iniciar.bat`:** Orquestração local sem exigir Docker.

---

## 2. Domínios do Backend (`backend/app/Domain/`)

| Domínio | Responsabilidade Principal |
|---|---|
| `Catalog` | `InventoryService` (reserva e baixa atômica em transação com `lockForUpdate` e validação de kits), `CatalogCsvService` (importação/exportação CSV compatível com planilhas). |
| `Cart` | `CartService` (carrinho persistente para visitante via token UUID `X-Cart-Token` + cookie `mf_cart_token`, mesclagem automática no login, cálculo de descontos por cupom/promoção e frete). |
| `Checkout` | `CheckoutService` (idempotência via `X-Idempotency-Key`, revalidação server-side de estoque, preços, promoções e cotação de frete, criação transacional do pedido e pagamento). |
| `Payments` | `PaymentService` e `PaymentGateway` (Mercado Pago Payments API v1/Brick e Asaas com fatura hospedada; Pix, crédito à vista e boleto), `PaymentSettings` (admin criptografado/.env), recibos assíncronos em `payment_events` e `WebhookProcessorService` (transições de pedido e estoque). |
| `Shipping` | `ShippingQuoteService` + `MelhorEnvioProvider` + `CorreiosProvider` + fallback automático para tabela regional configurável no admin (`shipping_rules`), persiste `shipping_quotes` com TTL de 30 min. |
| `Settings` | `StoreSettingsService` (configurações tipadas em `store_settings`, injetadas em tempo real no `:root` da loja para cores, logo, favicon, contatos e políticas) e `MediaUploadService` (upload seguro validado para `storage/app/public`). |
| `Security` | `RbacSeederService` (papéis `superadmin`, `manager`, `editor`, `marketing`, `logistics`, `support`, `customer`), `TotpService` (2FA TOTP), `AuditLogger` (`audit_logs` sem dados sensíveis). |
| `Shared` | Enums imutáveis de estado: `OrderStatus`, `PaymentStatus`, `PaymentMethod`, `ProductType`, `RoleSlug`. |

---

## 3. Banco de Dados & Integridade Transacional
- **Valores monetários:** Armazenados exclusivamente em **centavos inteiros** (`*_cents` `bigint`/`integer`), eliminando erros de ponto flutuante.
- **Compatibilidade:** Schema testado em **MySQL 8.4** e **SQLite** (driver local de fallback).
- **Fluxo de estoque & reservas:**
  1. Ao concluir `/checkout`, `InventoryService::reserveOrder()` reserva as quantidades (`stock_reservations`) e incrementa `reserved_qty` de cada variação (ou componentes de kits) sob `DB::transaction` e `lockForUpdate`.
  2. Ao aprovar o pagamento (webhook ou retorno síncrono de cartão), `InventoryService::commitOrderStock()` converte reserva em baixa definitiva (`stock_qty` e `reserved_qty`), gravando em `stock_movements`.
  3. Ao cancelar, recusar ou expirar (`mistura:release-expired-reservations`), `InventoryService::releaseReservation()` devolve `reserved_qty` ao saldo disponível.

---

## 4. Fluxos de Segurança & LGPD
- **Autenticação:** Cookies HTTP-only + SameSite `lax`, proteção CSRF Sanctum e suporte a 2FA TOTP no `/admin`.
- **PCI-DSS / Zero retenção de cartão:** O backend nunca recebe nem grava número de cartão (PAN) ou CVV em banco ou logs; aceita apenas token de pagamento/bandeira/parcelas/últimos 4 dígitos mascarados.
- **Idempotência de webhooks e pedidos:** Chaves `idempotency_key` únicas em `orders` e `payment_events` garantem que retentativas de rede ou entregas duplicadas dos provedores não dupliquem cobranças nem baixas de estoque.
- **LGPD:** Banner de consentimento configurável, políticas editáveis no backoffice, e área `/minha-conta` protegida por senha e ownership checks.

