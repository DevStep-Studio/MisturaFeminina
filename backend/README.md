# DevStep Laravel API Starter

**Laravel 13 • PHP 8.3+ • API REST • Sanctum • Redis • Segurança • Observabilidade**

Template backend da DevStep para desenvolvimento de APIs profissionais, destinado principalmente à integração com frontend SolidJS + TanStack, mas compatível com outras aplicações web, mobile e integrações externas.

## 1. Objetivo

Criar uma base backend reutilizável, organizada e preparada para produção, com foco em:

- Arquitetura modular por funcionalidades.
- API REST versionada.
- Autenticação e autorização seguras.
- Validação rigorosa de requisições.
- Isolamento de dados e segurança multi-tenant opcional.
- Padronização de respostas JSON.
- Monitoramento de erros e auditoria.
- Processamento assíncrono.
- Performance e escalabilidade.
- Documentação automática.
- Testes e CI/CD.
- Integração simples com o DevStep Solid Starter.

**Princípio:** manter o Laravel próximo de suas convenções nativas. Introduzir abstrações somente quando resolverem problemas concretos.

---

## 2. Tecnologias

| Tecnologia | Finalidade |
|---|---|
| Laravel 13 | Framework |
| PHP 8.3+ | Linguagem |
| Eloquent ORM | Persistência |
| Form Requests | Validação |
| API Resources | Serialização |
| Sanctum | Autenticação |
| Policies / Gates | Autorização |
| Redis | Cache, rate limit e filas |
| Horizon | Monitoramento de filas Redis |
| Sentry | Rastreamento de exceções |
| Scramble | Documentação OpenAPI |
| Pest | Testes |
| Laravel Pint | Formatação de código |
| Larastan | Análise estática |
| MySQL / PostgreSQL | Banco de dados |

### Pacotes opcionais

- Spatie Laravel Permission — roles e permissões.
- Spatie Activitylog — trilha de auditoria.
- Laravel Telescope — diagnóstico em desenvolvimento.
- Laravel Pulse — métricas de aplicação.
- Laravel Reverb — comunicação em tempo real.
- Laravel Octane — execução otimizada em projetos que justifiquem seu uso.
- Laravel Pennant — feature flags.
- Laravel Scout — busca.
- Laravel Cashier — assinaturas, quando compatível com o provedor utilizado.

Não instalar todos os pacotes automaticamente.

---

## 3. Instalação

Criar o projeto:

```bash
composer create-project laravel/laravel devstep-api "^13.0"

cd devstep-api
```

Preparar o ambiente:

```bash
cp .env.example .env
php artisan key:generate
```

Instalar o suporte à API:

```bash
php artisan install:api
```

Esse comando configura o suporte à API e ao Laravel Sanctum.

Instalar ferramentas de desenvolvimento conforme necessário:

```bash
composer require laravel/pint --dev
composer require larastan/larastan --dev
```

Monitoramento de filas Redis, quando utilizado:

```bash
composer require laravel/horizon
php artisan horizon:install
```

Instalar os demais pacotes apenas quando suas respectivas funcionalidades forem implementadas, seguindo as instruções oficiais da versão compatível.

### Executar

```bash
php artisan migrate
php artisan serve
```

API local:

```text
http://localhost:8000
```

---

## 4. Estrutura de diretórios

Adotar uma arquitetura **modular por domínio**, preservando os mecanismos convencionais do Laravel.

```text
app/
├── Actions/
│
├── Contracts/
│
├── Domain/
│   ├── Auth/
│   │   ├── Actions/
│   │   ├── DTOs/
│   │   ├── Events/
│   │   └── Services/
│   │
│   ├── Projects/
│   │   ├── Actions/
│   │   ├── DTOs/
│   │   ├── Enums/
│   │   ├── Events/
│   │   ├── Exceptions/
│   │   └── Services/
│   │
│   └── Users/
│       ├── Actions/
│       ├── DTOs/
│       └── Services/
│
├── Http/
│   ├── Controllers/
│   │   ├── Api/
│   │   │   └── V1/
│   │   │       ├── Auth/
│   │   │       ├── Projects/
│   │   │       └── Users/
│   │   └── Controller.php
│   │
│   ├── Middleware/
│   ├── Requests/
│   │   └── Api/
│   │       └── V1/
│   └── Resources/
│       └── Api/
│           └── V1/
│
├── Jobs/
├── Listeners/
├── Mail/
├── Models/
├── Notifications/
├── Observers/
├── Policies/
├── Providers/
└── Support/
    ├── Api/
    ├── Security/
    ├── Monitoring/
    └── Helpers/

bootstrap/
config/

database/
├── factories/
├── migrations/
└── seeders/

routes/
├── api.php
├── api/
│   └── v1.php
├── web.php
└── console.php

tests/
├── Feature/
│   ├── Api/
│   └── Security/
└── Unit/

docs/
├── architecture.md
├── authentication.md
├── api-conventions.md
├── security.md
└── deployment.md
```

### Regras

1. Controllers devem permanecer enxutos.
2. Form Requests validam entradas e autorizam operações quando apropriado.
3. API Resources controlam os campos expostos.
4. Policies verificam autorização por recurso.
5. Actions representam operações de negócio específicas.
6. Services representam processos de domínio quando houver necessidade real.
7. Models concentram relacionamentos e comportamento pertinente ao modelo.
8. Jobs executam tarefas assíncronas.
9. Não criar interfaces e repositories para cada Model sem justificativa.
10. Regras de negócio não devem ficar espalhadas pelos Controllers.

---

## 5. API versionada

Todas as rotas públicas da API devem utilizar versionamento.

Formato:

```text
/api/v1/...
```

Exemplos:

```text
GET    /api/v1/me
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/{project}
PATCH  /api/v1/projects/{project}
DELETE /api/v1/projects/{project}
```

Organizar `routes/api.php`:

```php
<?php

use Illuminate\Support\Facades\Route;

Route::prefix('v1')
    ->group(base_path('routes/api/v1.php'));
```

Configurar `routes/api/v1.php`:

```php
<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', function (Request $request) {
        return response()->json([
            'data' => [
                'id' => $request->user()->id,
                'name' => $request->user()->name,
                'email' => $request->user()->email,
            ],
        ]);
    });
});
```

O arquivo `routes/api.php` já recebe o prefixo `/api` pela configuração padrão de roteamento.

**Importante:** versionar contratos públicos, não copiar automaticamente toda a aplicação para cada versão.

---

## 6. Padrão de resposta JSON

### Sucesso

```json
{
  "data": {
    "id": 1,
    "name": "Projeto exemplo",
    "status": "active"
  }
}
```

### Listagem paginada

Adotar o formato convencional de paginação dos API Resources do Laravel:

```json
{
  "data": [],
  "links": {
    "first": "...",
    "last": "...",
    "prev": null,
    "next": "..."
  },
  "meta": {
    "current_page": 1,
    "last_page": 5,
    "per_page": 15,
    "total": 75
  }
}
```

### Erro de negócio

```json
{
  "message": "Não foi possível concluir a operação.",
  "code": "PROJECT_OPERATION_FAILED",
  "request_id": "01JEXAMPLE"
}
```

### Erro de validação

Utilizar o padrão 422 do Laravel:

```json
{
  "message": "Os dados informados são inválidos.",
  "errors": {
    "name": [
      "O campo nome é obrigatório."
    ]
  }
}
```

### Regras de padronização

- Utilizar códigos HTTP corretos.
- Não retornar HTTP 200 para erros.
- Não enviar stack traces em produção.
- Utilizar mensagens compreensíveis.
- Criar códigos de erro estáveis quando necessários.
- Incluir identificador de requisição para diagnóstico.
- Evitar envelopes aninhados desnecessários.
- Manter erros compatíveis com TanStack Query.

---

## 7. Autenticação Laravel Sanctum

Utilizar Sanctum com autenticação baseada em sessão para a SPA SolidJS de primeira parte.

### Fluxo recomendado

1. Frontend solicita `/sanctum/csrf-cookie`.
2. Backend fornece o cookie de proteção CSRF.
3. Frontend envia credenciais para `POST /login`.
4. Laravel autentica e regenera a sessão.
5. Navegador mantém cookie de sessão HttpOnly.
6. Frontend consulta `GET /api/v1/me`.
7. Requisições privadas utilizam `auth:sanctum`.
8. Logout invalida a sessão e seu token CSRF é renovado.

É possível usar Laravel Fortify para fornecer autenticação headless ou implementar os endpoints manualmente seguindo as recomendações oficiais.

### Endpoints previstos

```text
POST /login
POST /logout

GET /api/v1/me

POST /forgot-password
POST /reset-password
```

Os caminhos exatos de autenticação devem seguir a implementação escolhida.

### Segurança

- Cookie HttpOnly.
- Secure em produção.
- SameSite apropriado.
- Regeneração de sessão após login.
- Invalidação de sessão após logout.
- Rate limiting no login.
- Proteção contra enumeração de usuários.
- Senhas com hash seguro.
- MFA opcional.
- Verificação de e-mail opcional.

Para frontend e API em subdomínios diferentes, configurar Sanctum, cookies, CORS e CSRF corretamente.

O Sanctum com autenticação SPA por cookies requer que frontend e API compartilhem o mesmo domínio registrável. Se utilizarem domínios totalmente diferentes, será necessário projetar outra arquitetura de autenticação, como um BFF ou um fluxo apropriado para clientes externos.

Nunca compartilhar credenciais de sessão com origens arbitrárias.

---

## 8. Integração com SolidJS + TanStack

Exemplo de domínios:

```text
Frontend:
https://app.exemplo.com.br

Backend:
https://api.exemplo.com.br
```

Configuração ilustrativa do backend:

```env
APP_URL=https://api.exemplo.com.br

FRONTEND_URL=https://app.exemplo.com.br

SANCTUM_STATEFUL_DOMAINS=app.exemplo.com.br
SESSION_DOMAIN=.exemplo.com.br
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=lax
```

Configurar `config/cors.php` para permitir somente origens de frontend autorizadas, com suporte a credenciais quando necessário.

Não utilizar `*` como origem permitida para requisições autenticadas com cookies.

### Cliente HTTP

No frontend:

```ts
const response = await fetch(
  'https://api.exemplo.com.br/api/v1/me',
  {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
    },
  },
)
```

Para chamadas com alterações de estado, incluir o mecanismo de CSRF exigido pelo Laravel.

O cliente HTTP deve tratar 401, 403, 419, 422 e 429 de forma centralizada.

---

## 9. Autorização e permissões

Adotar inicialmente Policies e Gates nativos.

Para aplicações com gerenciamento dinâmico de cargos, considerar Spatie Laravel Permission.

### Convenção de permissões

```text
projects.view
projects.create
projects.update
projects.delete

users.view
users.create
users.update
users.delete

settings.manage
reports.export
```

### Regras

- Toda operação sensível exige autorização no backend.
- Não confiar em permissões recebidas do frontend.
- Validar propriedade de recursos.
- Negar o acesso por padrão.
- Bloquear acesso entre usuários e organizações.
- Evitar expor dados de recursos não autorizados.
- Registrar alterações administrativas relevantes.

### Multi-tenant opcional

Para sistemas SaaS, prever:

- Workspace ou organização.
- Associação de usuários aos workspaces.
- Roles por workspace.
- Escopo de consultas por tenant.
- Validação de propriedade dos recursos.
- Limpeza ou invalidação de cache por tenant.

Se o projeto utilizar multi-tenancy, nenhuma consulta privada deve depender apenas de um `tenant_id` enviado pelo cliente.

---

## 10. Validação com Form Requests

Toda entrada deve passar por validação.

Exemplo:

```php
<?php

namespace App\Http\Requests\Api\V1;

use Illuminate\Foundation\Http\FormRequest;

class StoreProjectRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can(
            'create',
            \App\Models\Project::class
        ) ?? false;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
```

### Regras

- Validar tipos e formatos.
- Definir limites de tamanho.
- Validar IDs e relacionamentos.
- Utilizar somente campos autorizados para persistência.
- Evitar mass assignment indevido.
- Não confiar em regras de validação do frontend.
- Usar transações em operações de múltiplas etapas.
- Impedir alteração indevida de campos de propriedade e controle de acesso.

---

## 11. Segurança da API

### Medidas obrigatórias

- HTTPS em produção.
- `APP_DEBUG=false`.
- Proteção CSRF para sessões.
- Rate limiting.
- Validação de todas as entradas.
- Policies e Gates.
- Query Builder ou Eloquent com parâmetros vinculados.
- Proteção contra acesso indevido a objetos (BOLA/IDOR).
- Headers HTTP de segurança.
- CORS restrito.
- Logs sem credenciais.
- Tratamento seguro de uploads.
- Limites de tamanho de requisição.

### Proteção contra abuso

Configurar limites diferentes para:

- Login.
- Recuperação de senha.
- Registro.
- API autenticada.
- Uploads.
- Busca.
- Exportações.
- Geração de relatórios.

Usar `RateLimiter` e middleware `throttle`, com limites ajustados ao risco e à necessidade do produto.

### Idempotência

Em operações financeiras, criação de cobranças e webhooks, implementar controle de idempotência.

Evitar que reenvios da mesma requisição provoquem cobranças ou registros duplicados.

---

## 12. Banco de dados

Suportar MySQL ou PostgreSQL.

### Convenções

- Migrations versionadas.
- Foreign keys.
- Índices apropriados.
- Relacionamentos Eloquent.
- Timestamps.
- Soft deletes somente quando fizerem sentido.
- Transações em operações críticas.
- Constraints no banco para regras de integridade.
- Identificadores únicos para recursos externos.

### Performance

- Evitar problemas N+1.
- Usar eager loading.
- Paginar listagens.
- Selecionar apenas os campos necessários.
- Analisar consultas lentas.
- Definir índices com base nas consultas reais.
- Não expor Models diretamente como resposta pública sem controle.

Para IDs públicos, considerar ULID ou UUID quando houver um motivo concreto.

---

## 13. Cache e Redis

Redis será recomendado para projetos que necessitem cache compartilhado e filas.

### Estratégias

- Cache de consultas custosas.
- Invalidação após operações de escrita.
- Chaves com namespace.
- Cache isolado por usuário e tenant quando necessário.
- TTL adequado ao tipo de dado.
- Proteção contra cache stampede nos recursos críticos.

Exemplo de nomenclatura:

```text
devstep:projects:list:tenant:123
devstep:settings:tenant:123
devstep:permissions:user:456
```

Não manter dados sensíveis em cache compartilhado sem isolamento adequado.

---

## 14. Filas e processamento assíncrono

Utilizar Laravel Queues.

Exemplos de Jobs:

```text
SendWelcomeEmail
GenerateReport
ProcessImport
ProcessWebhook
ExportProjects
SendNotification
```

### Regras

- Não executar processos pesados dentro do ciclo HTTP.
- Definir timeout e número de tentativas.
- Prevenir duplicação de tarefas.
- Implementar idempotência.
- Registrar falhas.
- Definir backoff.
- Utilizar filas distintas quando necessário.
- Evitar transportar credenciais sensíveis nos payloads dos Jobs.

### Laravel Horizon

Utilizar Horizon em projetos com Redis para acompanhar:

- Jobs processados.
- Jobs com falha.
- Filas.
- Tempo de espera.
- Throughput.
- Workers.

Proteger o acesso ao painel Horizon com autorização adequada.

---

## 15. Rastreamento de erros

Implementar Sentry no backend, complementando o rastreamento do frontend.

### Capturar

- Exceções HTTP inesperadas.
- Falhas de Jobs.
- Erros de integrações.
- Erros de banco de dados.
- Falhas críticas de webhooks.
- Erros após deploy.

### Contexto seguro

Incluir quando disponível:

```text
request_id
environment
release
route
http_method
status_code
tenant_id
user_id
```

Não incluir senhas, cookies, tokens, documentos pessoais ou dados financeiros sensíveis.

Criar alertas para falhas críticas e regressões.

A integração deve usar uma versão do SDK Sentry compatível com Laravel 13.

---

## 16. Logs e auditoria

Diferenciar logs técnicos de auditoria de ações.

### Logs técnicos

Registrar:

- Exceções.
- Falhas de integração.
- Jobs.
- Problemas operacionais.
- Consultas de diagnóstico em ambientes controlados.

### Auditoria

Registrar alterações relevantes, como:

```text
user.created
user.updated
user.deleted

project.created
project.updated
project.deleted

permission.assigned
permission.revoked

settings.updated
```

Uma entrada de auditoria deve conter o autor, a ação, o recurso, o horário e o contexto seguro necessário.

Não armazenar automaticamente todos os campos anteriores e posteriores quando houver informações sensíveis.

Logs de auditoria devem ter política de retenção e proteção contra alterações não autorizadas.

---

## 17. Webhooks seguros

Criar uma estrutura específica para integrações externas.

```text
app/
└── Domain/
    └── Integrations/
        ├── Actions/
        ├── Jobs/
        ├── Services/
        └── Webhooks/
```

### Requisitos

- Verificar assinatura ou mecanismo de autenticação do provedor.
- Verificar timestamp quando disponível.
- Aplicar proteção contra replay.
- Garantir idempotência.
- Registrar identificador externo do evento.
- Processar tarefas demoradas por filas.
- Responder dentro do prazo esperado pelo provedor.
- Não confiar somente no endereço IP do remetente.

Importante para integrações de pagamento, e-mail e serviços terceiros.

---

## 18. Documentação OpenAPI

Utilizar Scramble ou outra ferramenta compatível com a versão instalada.

Documentar:

- Endpoints.
- Métodos HTTP.
- Autenticação.
- Parâmetros.
- Form Requests.
- Respostas.
- Erros.
- Paginação.
- Exemplos de utilização.

Prever uma URL de documentação:

```text
/api/documentation
```

O caminho real dependerá da configuração do pacote.

Em produção, definir se a documentação será pública ou restrita.

### Integração frontend

Exportar o schema OpenAPI para permitir geração opcional de tipos TypeScript.

Isso reduz inconsistências entre contratos Laravel e SolidJS.

---

## 19. Monitoramento e saúde

Implementar health checks.

O Laravel disponibiliza o endpoint `/up` para verificação básica de saúde.

Para verificações mais completas, criar endpoints específicos com cuidado para não expor informações internas.

### Monitorar

- Disponibilidade HTTP.
- Banco de dados.
- Redis.
- Filas.
- Jobs com falha.
- Tempo de resposta.
- Erros 5xx.
- Uso de recursos.
- Tempo de execução de consultas.

Verificações aprofundadas devem ser protegidas quando puderem revelar detalhes operacionais.

Ferramentas opcionais:

- Sentry.
- Laravel Pulse.
- Laravel Horizon.
- Uptime Kuma.
- OpenTelemetry.

---

## 20. Testes automatizados

Utilizar Pest ou PHPUnit.

### Testes unitários

- Regras de negócio.
- Actions.
- Validações independentes.
- Cálculos.
- Conversões de dados.

### Testes de integração e feature

- Login.
- Logout.
- Sessão expirada.
- Autorização.
- CRUD.
- Paginação.
- Erros de validação.
- Rate limiting.
- Isolamento entre tenants.
- Idempotência.
- Webhooks.
- Jobs.

### Testes de segurança prioritários

- Usuário anônimo tentando acessar recurso privado.
- Usuário sem permissão.
- Usuário de outro workspace tentando acessar um recurso.
- Alteração de campos não permitidos.
- Acesso a objetos de outros usuários.
- Requisições sem CSRF válido.
- Tentativas repetidas de autenticação.
- Upload de arquivo inválido.

---

## 21. Qualidade e padronização

Utilizar:

- Laravel Pint.
- Larastan.
- Testes automatizados.
- Revisão de código.
- Convenções PSR.
- Tipagem PHP.
- Análise de dependências.

### Padrões

- Nomes de classes claros.
- Uma responsabilidade por classe quando apropriado.
- Controllers sem regras complexas.
- Evitar métodos excessivamente longos.
- Não duplicar regras de validação.
- Utilizar Enums para estados de domínio relevantes.
- Tratar explicitamente estados inválidos.
- Evitar helpers globais desnecessários.
- Preferir serviços nativos do Laravel.

---

## 22. Variáveis de ambiente

Exemplo ilustrativo:

```env
APP_NAME="DevStep API"
APP_ENV=local
APP_DEBUG=true
APP_URL=http://localhost:8000

FRONTEND_URL=http://localhost:3000

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=devstep
DB_USERNAME=devstep
DB_PASSWORD=

SESSION_DRIVER=database
SESSION_LIFETIME=120

SANCTUM_STATEFUL_DOMAINS=localhost:3000,127.0.0.1:3000

CACHE_STORE=database
QUEUE_CONNECTION=database

LOG_CHANNEL=stack
LOG_LEVEL=debug

SENTRY_LARAVEL_DSN=
```

Redis pode substituir os drivers de cache e filas conforme o ambiente.

`APP_KEY` deve ser gerada com `php artisan key:generate`.

Nunca versionar o `.env` real.

Em produção:

```env
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.exemplo.com.br

SESSION_SECURE_COOKIE=true

CACHE_STORE=redis
QUEUE_CONNECTION=redis

LOG_LEVEL=warning
```

O domínio e as configurações de cookies devem ser ajustados ao ambiente real.

---

## 23. CI/CD

Criar pipeline para:

1. Instalar dependências com Composer.
2. Validar compatibilidade PHP.
3. Executar Laravel Pint.
4. Executar Larastan.
5. Executar testes.
6. Verificar vulnerabilidades conhecidas.
7. Validar migrations em ambiente de teste.
8. Preparar artefato de deploy.
9. Publicar a aplicação.
10. Executar migrations com controle.
11. Reiniciar workers quando necessário.
12. Executar verificações pós-deploy.

Exemplo de comandos locais:

```bash
composer install

./vendor/bin/pint --test

./vendor/bin/phpstan analyse

php artisan test

composer audit
```

Os comandos de análise estática exigem configuração prévia do Larastan/PHPStan.

---

## 24. Deploy em produção

Arquitetura recomendada:

```text
Internet
   |
   v
Nginx
   |
   v
PHP-FPM
   |
   v
Laravel API
   |
   +-- Banco de dados
   |
   +-- Redis
   |
   +-- Queue Workers / Horizon
   |
   +-- Scheduler
   |
   +-- Serviços externos
```

Não é necessário executar a API Laravel convencional por PM2.

Para a arquitetura tradicional, utilizar Nginx e PHP-FPM. Reservar PM2 para processos Node.js e utilizar Supervisor ou systemd para processos persistentes como Horizon.

### Cuidados

- Document root apontando para `public/`.
- `.env` fora de acesso público.
- HTTPS.
- Permissões corretas de diretórios.
- `APP_DEBUG=false`.
- Cache de configuração em produção.
- Workers supervisionados.
- Scheduler configurado.
- Backups do banco de dados.
- Teste de restauração dos backups.
- Monitoramento de disponibilidade.
- Política de rollback.

### Comandos habituais

```bash
php artisan optimize:clear

php artisan migrate --force

php artisan config:cache

php artisan route:cache

php artisan view:cache

php artisan queue:restart
```

Em projetos com Horizon, utilizar o procedimento apropriado de encerramento e reinicialização supervisionada.

A execução de migrations deve ser planejada para evitar mudanças incompatíveis com versões ainda ativas da aplicação.

---

## 25. Integração com o frontend DevStep

Definir responsabilidades claras:

| Responsabilidade | Frontend | Backend |
|---|---|---|
| Navegação | TanStack Router | — |
| Proteção visual de rotas | Sim | — |
| Autenticação real | Consome sessão | Valida sessão |
| Autorização | Adapta interface | Obriga cumprimento |
| Validação | Experiência do usuário | Validação obrigatória |
| Cache de dados remotos | TanStack Query | Redis quando necessário |
| SEO | Sim | Fornece dados |
| Erros visuais | Sim | Retorna erros estruturados |
| Logs | Erros do navegador | Logs operacionais |
| Banco de dados | Não | Sim |
| Regras de negócio | Apresentação | Fonte da verdade |

### Contrato esperado

O frontend utilizará:

```text
GET /api/v1/me

GET /api/v1/projects
POST /api/v1/projects

PATCH /api/v1/projects/{id}
DELETE /api/v1/projects/{id}
```

O backend deve devolver dados consistentes, respostas paginadas previsíveis e códigos HTTP adequados.

Quando possível, gerar tipos TypeScript a partir do OpenAPI.

---

## 26. Recursos futuros opcionais

### Multi-tenancy

Para aplicações com múltiplas empresas, organizações ou workspaces.

### Feature flags

Para habilitar funcionalidades por cliente ou plano.

### WebSockets

Para notificações, dashboards e atualizações em tempo real.

### Auditoria avançada

Para sistemas financeiros, administrativos e plataformas críticas.

### Busca avançada

Com Scout ou ferramenta especializada.

### Storage externo

Para arquivos e mídia com URLs assinadas e permissões controladas.

### OpenTelemetry

Para rastrear requisições completas entre frontend, API, banco e integrações.

Esses recursos devem ser adicionados apenas quando necessários.

---

## 27. Checklist antes de publicar

### Segurança

- [ ] APP_DEBUG desativado.
- [ ] HTTPS configurado.
- [ ] Autenticação testada.
- [ ] Policies implementadas.
- [ ] CORS restrito.
- [ ] CSRF configurado.
- [ ] Rate limiting ativo.
- [ ] Validação de entrada.
- [ ] Proteção contra IDOR/BOLA.
- [ ] Nenhum segredo no repositório.
- [ ] Permissões e tenants isolados.

### Banco e performance

- [ ] Migrations testadas.
- [ ] Índices revisados.
- [ ] Consultas N+1 corrigidas.
- [ ] Paginação implementada.
- [ ] Cache configurado quando necessário.
- [ ] Backups configurados e restauração testada.

### Observabilidade

- [ ] Sentry configurado.
- [ ] Logs estruturados.
- [ ] Request IDs.
- [ ] Alertas críticos.
- [ ] Health checks.
- [ ] Filas monitoradas quando utilizadas.

### Qualidade

- [ ] Testes passando.
- [ ] Pint executado.
- [ ] Análise estática executada.
- [ ] Documentação atualizada.
- [ ] OpenAPI validado.
- [ ] Deploy e rollback documentados.

---

## 28. Roadmap de implementação

### Fase 1 — Fundação

Criar Laravel 13, configuração de banco, estrutura modular, API v1, respostas padronizadas e testes iniciais.

### Fase 2 — Segurança

Implementar Sanctum, autenticação, sessões, Policies, rate limiting e proteção contra acesso indevido.

### Fase 3 — Primeira funcionalidade

Criar o módulo Projects com migrations, model, controller, requests, resources, policy, actions e testes.

### Fase 4 — Observabilidade

Adicionar Sentry, logs, request IDs, monitoramento e health checks.

### Fase 5 — Infraestrutura

Configurar Redis, filas, documentação OpenAPI, CI/CD e deploy.

### Fase 6 — Extensões

Adicionar permissões dinâmicas, multi-tenancy, auditoria, webhooks e recursos avançados conforme o projeto exigir.

---

## 29. Princípios do DevStep Laravel API Starter

1. Segurança como requisito, não como complemento.
2. O backend é a fonte da verdade.
3. APIs devem possuir contratos previsíveis.
4. Toda regra de autorização é aplicada no servidor.
5. Organização modular sem abstrações excessivas.
6. Observabilidade desde o início.
7. Testes para comportamentos críticos.
8. Dependências instaladas com propósito.
9. Deploy reproduzível e verificável.
10. Código simples de entender e manter.

---

## Documentação oficial

- [Laravel 13](https://laravel.com/docs/13.x)
- [Laravel Sanctum](https://laravel.com/docs/13.x/sanctum)
- [Laravel Authorization](https://laravel.com/docs/13.x/authorization)
- [Laravel Queues](https://laravel.com/docs/13.x/queues)
- [Laravel Horizon](https://laravel.com/docs/13.x/horizon)
- [OWASP API Security](https://owasp.org/API-Security/)
- [OpenAPI](https://www.openapis.org/)

**DevStep Studio — Backend API Architecture**

## Implementação disponível

As fases 1 a 5 foram implementadas com MySQL, Redis, Sanctum, Projects, Sentry, Horizon e OpenAPI.
Consulte [início rápido](docs/quickstart.md) para executar e criar o primeiro usuário,
[contratos da API](docs/api-conventions.md) e [deploy](docs/deployment.md).
A fase 6 permanece opcional. O Compose fornecido é para desenvolvimento.
