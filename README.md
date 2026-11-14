# Mistura Feminina Cosméticos — E-commerce Completo & Backoffice

Plataforma de e-commerce brasileiro construída sobre a arquitetura **DevStep** (`backend/` Laravel 13 API + `frontend/` SolidJS 1.9 + TanStack Solid Router/Query + Tailwind CSS v4).

- **Loja (Frontend):** `http://localhost:3000`
- **Painel Administrativo:** `http://localhost:3000/admin`
- **API Backend:** `http://localhost:8000/api/v1`

---

## 1. Inicialização Rápida (Local)

Na raiz do projeto:

```sh
# macOS / Linux
./iniciar.sh

# Windows
iniciar.bat
```

Para preparar o banco local com catálogo demonstrativo completo pela primeira vez em desenvolvimento:

```sh
cd backend
php artisan migrate --seed --seeder=DemoStoreSeeder
php artisan storage:link
```

> **Importante:** `DemoStoreSeeder` não executa em `APP_ENV=production`. Para produção, provisione o primeiro admin com `php artisan mistura:admin EMAIL --role=superadmin`.

---

## 2. Credenciais Demonstrativas (Ambiente Local / Sandbox)

| Papel | E-mail | Senha | Acesso |
|---|---|---|---|
| **Superadmin** | `admin@misturafeminina.local` | `Mistura@Admin2026!` | `/admin` (acesso total) |
| **Marketing** | `marketing@misturafeminina.local` | `Mistura@Mkt2026!` | `/admin` (banners, cupons, aparência) |
| **Cliente** | `cliente@misturafeminina.local` | `Cliente@2026!` | `/minha-conta`, pedidos e favoritos |

Cupom ativo de teste na loja: **`BEMVINDA10`** (10% de desconto).

---

## 3. Documentação Técnica e Operacional

- [**Auditoria Inicial e Matriz de Referência**](docs/FASE0_AUDITORIA_E_MATRIZ.md)
- [**Arquitetura, Domínios e Segurança**](docs/ARQUITETURA.md)
- [**Manual do Administrador (/admin)**](docs/ADMIN_MANUAL.md)
- [**Integrações Externas e Homologação**](docs/INTEGRACOES.md)
- [**Deploy em Produção, Supervisor, Cron e Backup**](docs/DEPLOY.md)
- [**Testes Executados e Critérios de Aceite**](docs/TESTES_ACEITE.md)

---

## 4. Comandos Principais de Validação

```sh
# Backend (Pint + Larastan L5 + Pest)
cd backend && composer check

# Frontend (Format, Lint, Vitest, Build, Bundle Budget e E2E mockado)
cd frontend && npm run format:check && npm run lint && npm test && npm run build && npm run performance:check && npm run test:e2e

# E2E Full-Stack ao vivo (Loja + Checkout Pix/Cartão Sandbox + Backoffice)
cd frontend && npx playwright test --config=playwright.real.config.ts
```

---

## 5. Utilitários Artisan do Projeto (`backend/`)

- `php artisan mistura:admin {email} --role=superadmin`: Cria/atualiza administrador com papel RBAC.
- `php artisan mistura:release-expired-reservations`: Libera reservas de estoque de pedidos pendentes expirados.
- `php artisan mistura:reconcile-payments`: Reconcilia pedidos pendentes na API do Mercado Pago.
- `php artisan mistura:backup`: Cria snapshot consistente do banco em `storage/app/backups/`.
- `php artisan devstep:health`: Verifica conexão com banco de dados e Redis/fila.
