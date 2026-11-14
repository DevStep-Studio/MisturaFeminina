# Guia de Deploy em Produção — Mistura Feminina Cosméticos

Este guia descreve a publicação segura da stack **Laravel 13 (`backend/`) + SolidJS SPA (`frontend/`)** em servidor VPS/Hostinger com **Nginx, PHP 8.3+, MySQL 8.4 e Supervisor**.

---

## 1. Pré-requisitos do Servidor
- Ubuntu 24.04 LTS (ou Debian 12+)
- **PHP 8.3+** (`php-fpm`, `php-mysql`, `php-mbstring`, `php-xml`, `php-curl`, `php-zip`, `php-intl`, `php-bcmath`, `php-redis`)
- **Composer 2.x** e **Node.js 22.12+** (apenas para build de assets estáticos do frontend)
- **MySQL 8.4** (ou MariaDB 10.11+)
- **Redis** (recomendado; driver `database` funciona como fallback sem Redis)
- **Nginx** com certificado **SSL Let's Encrypt (Certbot)**

---

## 2. Preparação do Backend (`backend/`)

```sh
cd /var/www/mistura-feminina/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env
php artisan key:generate
```

Configure `backend/.env` com `APP_ENV=production`, `APP_DEBUG=false`, URLs HTTPS, `SANCTUM_STATEFUL_DOMAINS`, credenciais **MySQL 8.4** e SMTP (conforme `docs/INTEGRACOES.md`).

Em seguida execute **apenas migrations incrementais** (nunca `migrate:fresh` em produção) e crie o symlink de mídia pública:

```sh
php artisan migrate --force
php artisan storage:link
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

Provisione o primeiro usuário administrador com senha forte via CLI (este comando também sincroniza os papéis/permissões RBAC):

```sh
php artisan mistura:admin seuemail@misturafeminina.com.br --name="Admin Principal" --role=superadmin
```

*(Observação: `DemoStoreSeeder` verifica `if (app()->isProduction()) return;` e não popula dados de demonstração em ambiente de produção.)*

---

## 3. Build do Frontend (`frontend/`)

```sh
cd /var/www/mistura-feminina/frontend
npm ci
# Crie frontend/.env.production com VITE_API_URL=https://api.seudominio.com.br/api/v1 e VITE_AUTH_URL=https://api.seudominio.com.br
npm run build
```

Os arquivos estáticos finais ficam em `frontend/dist/`.

---

## 4. Configuração do Nginx
- **Site público (`https://www.seudominio.com.br`):** Apontar `root` para `/var/www/mistura-feminina/frontend/dist` com fallback SPA (`try_files $uri $uri/ /index.html;`). Proxy `/sitemap.xml`, `/robots.txt` e `/storage/` (ou apontar diretamente para `backend/public` se mesmo subdomínio) para garantir SEO dinâmico.
- **API (`https://api.seudominio.com.br`):** Apontar `root` para `/var/www/mistura-feminina/backend/public` via `php8.3-fpm.sock`.

*Alternativa em domínio único:* servir `frontend/dist` em `/` e encaminhar `/api`, `/sanctum`, `/login`, `/logout`, `/storage`, `/sitemap.xml` e `/robots.txt` para o Laravel FPM — mantendo cookies Sanctum first-party sem CORS complexo.

---

## 5. Filas (Supervisor) e Tarefas Agendadas (Cron)
Crie `/etc/supervisor/conf.d/mistura-worker.conf`:

```ini
[program:mistura-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/mistura-feminina/backend/artisan queue:work --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/www/mistura-feminina/backend/storage/logs/worker.log
```

Adicione no `crontab -e` do usuário `www-data`:

```cron
* * * * * cd /var/www/mistura-feminina/backend && php artisan schedule:run >> /dev/null 2>&1
0 3 * * * cd /var/www/mistura-feminina/backend && php artisan mistura:backup >> /dev/null 2>&1
```

Isso garante execução contínua a cada 5 minutos de `mistura:release-expired-reservations` e `mistura:reconcile-payments`, além de backup diário às 03h em `backend/storage/app/backups/`.

---

## 6. Procedimento de Backup e Teste de Restauração
- Gerar backup consistente sob demanda:
  ```sh
  cd backend && php artisan mistura:backup
  ```
- Restaurar em banco de homologação para validar integridade:
  ```sh
  mysql -u usuario -p mistura_staging < storage/app/backups/backup_mysql_YYYYMMDD_HHMMSS_xxxx.sql
  php artisan migrate:status
  ```
- Verificar saúde do sistema a qualquer momento:
  ```sh
  php artisan devstep:health
  ```

