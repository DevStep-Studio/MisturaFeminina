# DevStep — iniciar o ambiente

Na pasta principal:

```sh
# Linux
./iniciar.sh

# Windows (Prompt/PowerShell, ou duplo clique)
iniciar.bat
```

O inicializador prepara dependências quando necessário, cria os arquivos `.env` ausentes, gera `APP_KEY` se estiver vazia, conecta ao MySQL, cria o banco ausente e executa `php artisan migrate`. Depois inicia Laravel e Vite no mesmo terminal.

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- **Ctrl+C** encerra os servidores iniciados pelo script. MySQL/Redis permanecem ativos.
- Portas ocupadas interrompem a inicialização; processos existentes não são encerrados.

## Requisitos

Node.js 22.12+, npm, PHP 8.3+ com extensões exigidas pelo Laravel, Composer e MySQL/MariaDB instalado. O script não instala o servidor de banco nem descobre senhas.

Se `backend/.env` já existe, suas credenciais são preservadas. Confira:

```dotenv
APP_ENV=local
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=devstep
DB_USERNAME=seu_usuario
DB_PASSWORD=sua_senha
```

O usuário precisa acessar o banco e executar migrations. Para criar automaticamente um banco ausente, também precisa da permissão `CREATE DATABASE`; caso contrário, crie o banco previamente.

Um `.env` novo usa MySQL local na porta 3306, usuário `root` sem senha e banco `devstep`; ajuste as credenciais se sua instalação usar outra configuração. Cache e filas usam `database` nesse ambiente novo, dispensando Redis. Configurações existentes não são alteradas.

## MySQL e Redis parados

O script tenta iniciar serviços locais já instalados:

- Linux com systemd: `mysqld`, `mysql` ou `mariadb`; Redis quando os drivers existentes exigirem. Pode solicitar autorização/senha de administrador para o serviço.
- Windows: serviços com nome MySQL/MariaDB e Redis/Memurai. Para iniciar serviços parados, pode ser necessário abrir o terminal como Administrador. No XAMPP sem serviço instalado, inicie MySQL pelo painel.

Se o serviço tem outro nome, defina `DEVSTEP_MYSQL_SERVICE` ou `DEVSTEP_REDIS_SERVICE` no terminal. Hosts remotos, hosts Docker (`mysql`/`redis`), sockets especiais e portas personalizadas precisam estar disponíveis previamente. O script não inicia Docker nem altera as credenciais para tentar contornar uma recusa de autenticação.

No Windows nativo, Composer ignora apenas as extensões Unix `pcntl`/`posix` exigidas pelo Horizon. **Horizon requer Linux/WSL**; ele não é iniciado por esse script. Workers e scheduler também são processos separados; veja a documentação do backend para utilizá-los.

## Diagnóstico e opções

```sh
./iniciar.sh --check        # Somente diagnóstico; não altera .env/banco nem sobe serviços
./iniciar.sh --no-services  # Prepara e inicia os apps; não tenta iniciar MySQL/Redis
./iniciar.sh --help
```

As mesmas opções funcionam em `iniciar.bat`. `--check` também exige as portas 3000/8000 livres. Inicialização permitida somente em `APP_ENV=local` ou `development`.

As migrations são incrementais: **não há `migrate:fresh`, reset de tabelas ou seed automático**. Para criar seu usuário, use `php artisan devstep:user EMAIL` na pasta backend. Alterações nos lockfiles fazem o inicializador atualizar as dependências; o estado local fica em `.devstep/` (ignorado pelo Git).

## Documentação e testes

- [Frontend](frontend/README.md) e [guia da equipe](frontend/docs/README.md).
- [Backend e ambiente Docker opcional](backend/docs/quickstart.md).
- `node --test scripts/dev.test.mjs` verifica o inicializador.
- O launcher usa somente APIs nativas do Node; não precisa instalar dependências na raiz.
