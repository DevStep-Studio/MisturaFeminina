# Publicação e rollback

Pipeline de GitHub Actions em `.github/workflows/backend.yml` na raiz do workspace.
O checkout deve incluir backend/ e frontend/. O pipeline gera artefato, mas não publica.

Use Nginx + PHP-FPM 8.3+, MySQL, Redis privado, Supervisor/systemd para Horizon e cron para scheduler.
Não use o servidor Artisan nem o Compose de desenvolvimento para produção.
Document root deve apontar para backend/public. Exemplo Nginx em deployment/nginx.conf.

Provisionar .env fora do artefato com APP_KEY persistente, APP_ENV=production, APP_DEBUG=false,
APP_URL HTTPS, FRONTEND_URL exata, credenciais restritas de MySQL, Redis e SMTP,
SESSION_SECURE_COOKIE=true, SESSION_DOMAIN apropriado, CACHE_STORE=redis, QUEUE_CONNECTION=redis,
SENTRY_LARAVEL_DSN e SENTRY_RELEASE opcionais. Nunca regenerar APP_KEY em deploys.

Para cada release: extrair artefato em diretório próprio, conectar .env e storage persistentes,
validar permissões de storage/bootstrap/cache, executar optimize:clear, fazer backup do banco,
revisar migrations e executar migrate --force, config:cache, route:cache e view:cache.
Trocar symlink current atomicamente, recarregar PHP-FPM e executar horizon:terminate para reinício supervisionado.
Cron: `* * * * * cd /srv/devstep/current/backend && php artisan schedule:run >> /dev/null 2>&1`.
Supervisor deve executar `php artisan horizon` com autorestart e stopwaitsecs maior que o timeout dos jobs.
Não disponibilizar documentação ou Horizon publicamente sem nova política de autorização.

Pós-deploy: verificar /up, devstep:health, login/CSRF, leitura de projetos e processamento de notificação.
Alertar sobre indisponibilidade, 5xx, jobs falhos e tempo de espera das filas.
Sentry precisa de DSN e alertas configurados no serviço; a aplicação sozinha não cria alertas.

Rollback: restaurar symlink para release anterior, recarregar PHP-FPM e reiniciar Horizon.
Migrations devem ser expansivas e compatíveis com versões em execução; não executar rollback destrutivo automaticamente.
Se schema/dados forem incompatíveis, usar plano de restauração previamente ensaiado com backup MySQL.
Definir retenção dos backups e realizar restauração de teste antes de publicar.
