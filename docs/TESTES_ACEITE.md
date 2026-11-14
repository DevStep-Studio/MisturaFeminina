# Evidências de Testes e Critérios de Aceite — Mistura Feminina Cosméticos

Este documento registra a matriz de validação executada para comprovar a entrega funcional do e-commerce (backend Laravel 13, frontend SolidJS, acessibilidade, performance de bundle e fluxos E2E em navegador real).

---

## 1. Critérios de Aceite Atendidos

| Fluxo / Requisito | Status | Evidência / Camada de Validação |
|---|---|---|
| Qualidade estática backend (Pint + PHPStan/Larastan L5) | **Implementado e testado** | `composer check` (`vendor/bin/pint --test` + `phpstan analyse --memory-limit=512M`) |
| Segurança, RBAC, Catálogo, Estoque atômico, Carrinho, Cupons, Frete, Webhook HMAC idempotente, Checkout & LGPD | **Implementado e testado** | Suíte Pest (`tests/Feature/EcommerceFlowTest.php`, `SecurityHeadersTest.php`, `HealthEndpointTest.php`, `DevstepStarterTest.php`) |
| Build, Lint, Tipagem TypeScript, Orçamento de Bundle & Testes Unitários Frontend | **Implementado e testado** | `npm run format:check`, `npm run lint`, `npm test`, `npm run build`, `npm run performance:check` |
| Acessibilidade WCAG AA (0 violações críticas/sérias) & zero overflow em Desktop (1366px) e Mobile (390px) | **Implementado e testado ao vivo** | Playwright + `@axe-core/playwright` (`tests/e2e/storefront.live.ts`) |
| Compra ponta a ponta Pix Sandbox: Vitrine → PDP → Carrinho → Cupom `BEMVINDA10` → Frete CEP `01310-100` → Checkout → QR Pix SVG/PNG + Simulação de aprovação de webhook | **Implementado e testado em sandbox ao vivo** | Playwright ao vivo (`playwright.real.config.ts`) + screenshot `docs/screenshots/mf-checkout-pix.png` |
| Compra ponta a ponta Cartão Sandbox + Login Backoffice `/admin` + Edição ao vivo de identidade visual | **Implementado e testado em sandbox ao vivo** | Playwright ao vivo (`playwright.real.config.ts`) + screenshot `docs/screenshots/mf-admin-desktop.png` |
| Mercado Pago Produção, Melhor Envio OAuth2, Correios Contrato & SMTP | **Implementado / Pendente de homologação externa** | Requer credenciais reais de produção e domínio HTTPS para validação externa (detalhado em `docs/INTEGRACOES.md`) |

---

## 2. Capturas Visuais Verificadas
Screenshots geradas automaticamente durante o teste E2E real contra backend + banco populado:
- Home Desktop (1366×768): `docs/screenshots/mf-home-desktop.png`
- Home Mobile (390×844): `docs/screenshots/mf-home-mobile.png`
- Página de Produto Desktop (1366×860): `docs/screenshots/mf-pdp-desktop.png`
- Confirmação Pix Sandbox (1366×860): `docs/screenshots/mf-checkout-pix.png`
- Backoffice Admin Desktop (1366×860): `docs/screenshots/mf-admin-desktop.png`

---

## 3. Como Reproduzir Toda a Bateria de Testes

```sh
# 1. Backend: Estilo, Análise Estática e Suíte Pest
cd backend
composer check

# 2. Frontend: Formatação, Lint, Testes Unitários, Build e Budget
cd ../frontend
npm run format:check
npm run lint
npm test
npm run build
npm run performance:check

# 3. Frontend E2E Base (cenários mockados do starter DevStep)
npm run test:e2e

# 4. E2E Full-Stack Ao Vivo (sobe Laravel localhost:8000 + Vite localhost:3000)
npx playwright test --config=playwright.real.config.ts
```

