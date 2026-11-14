# Iniciar o DevStep API

A implementação das fases 1 a 5 está em `backend/`; o README original é a especificação arquitetural.

## Docker Compose (desenvolvimento)

Na pasta backend:

```sh
cp .env.example .env
docker compose build
docker compose run --rm app php artisan key:generate
docker compose run --rm app php artisan migrate
docker compose up -d
docker compose exec app php artisan devstep:user voce@example.com --name="Seu Nome"
```

A senha é solicitada sem eco no terminal. Não há cadastro público nem usuário padrão.
API: http://localhost:8000; documentação: http://localhost:8000/docs/api;
Horizon: http://localhost:8000/horizon; e-mails: http://localhost:8025.
Compose é exclusivo para desenvolvimento; as senhas de exemplo não servem para produção.

## Sem Docker

PHP 8.3+ com PDO MySQL, Redis, mbstring, XML, intl, pcntl, bcmath e Composer.
Execute `composer install`, copie `.env.example` para `.env` e ajuste os hosts/portas e credenciais para os serviços locais.
Execute `php artisan key:generate`, `php artisan migrate` e `php artisan devstep:user EMAIL`.
Em terminais separados: `php artisan serve`, `php artisan horizon` e `php artisan schedule:work`.
Para testar envio de e-mails sem SMTP, use `MAIL_MAILER=log` somente em desenvolvimento.

## Frontend

Em frontend, `npm ci` e `npm run dev`. `.env.example` aponta para `/api/v1` e ativa API real.
Frontend e API devem usar o mesmo hostname (localhost em ambos), nunca misturar localhost e 127.0.0.1.
Recuperação de senha está em `/forgot-password`; o link enviado por e-mail abre `/reset-password`.

## Verificações

```sh
vendor/bin/pint --test
vendor/bin/phpstan analyse
vendor/bin/pest
composer audit
php artisan devstep:health
php artisan scramble:export --path=docs/openapi.json
```

Os testes usam SQLite por padrão. Para MySQL, exporte DB_CONNECTION=mysql,
DB_DATABASE com um banco exclusivo de testes, DB_HOST, DB_PORT, DB_USERNAME e DB_PASSWORD.
Os testes recriam tabelas; nunca use o banco de produção.
