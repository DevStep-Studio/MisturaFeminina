# Ambiente e configuração

Copie `.env.example` para `.env` e reinicie Vite depois de alterar variáveis. `src/app/config.ts` valida a configuração na inicialização. Toda variável `VITE_*` é pública e vai para o bundle: nunca colocar senhas, segredos privados ou chaves de servidor.

## Identidade e backend

| Variável                | Padrão / função                                  |
| ----------------------- | ------------------------------------------------ |
| `VITE_APP_NAME`         | DevStep Starter; nome exibido na auth            |
| `VITE_APP_VERSION`      | 0.1.0; versão técnica                            |
| `VITE_API_URL`          | http://localhost:8000/api/v1                     |
| `VITE_AUTH_URL`         | Origem do backend; exemplo http://localhost:8000 |
| `VITE_AUTH_ME_PATH`     | /me relativo à API                               |
| `VITE_AUTH_LOGIN_PATH`  | /login relativo à auth                           |
| `VITE_AUTH_LOGOUT_PATH` | /logout relativo à auth                          |
| `VITE_AUTH_MFA_PATH`    | /two-factor-challenge relativo à auth            |
| `VITE_ENABLE_MFA`       | false; só ativar com suporte no backend          |
| `VITE_API_TIMEOUT_MS`   | 15000; intervalo aceito de 100 a 120000          |

API e autenticação precisam usar a mesma origem de backend, sem credenciais, query ou fragmento nas URLs. Para cookies Sanctum, o site e a API devem compartilhar o domínio registrável. Em desenvolvimento use o mesmo hostname em ambos: localhost ou 127.0.0.1, nunca misturar.

## Site e integrações opcionais

| Variável                 | Função                                              |
| ------------------------ | --------------------------------------------------- |
| `VITE_SITE_URL`          | Origem canônica; padrão localhost:3000              |
| `VITE_SITE_NAME`         | Nome usado em metadados                             |
| `VITE_SITE_INDEXABLE`    | false por padrão; staging não deve indexar          |
| `VITE_ENABLE_ANALYTICS`  | false por padrão                                    |
| `VITE_GTM_ID`            | Container GTM válido quando analytics estiver ativo |
| `VITE_ANALYTICS_IN_DEV`  | false; habilitação explícita no desenvolvimento     |
| `VITE_ENABLE_MONITORING` | false por padrão                                    |
| `VITE_SENTRY_DSN`        | DSN público do projeto, quando habilitado           |

Nenhum conteúdo privado entra no sitemap. `publicPages` em `src/lib/site.ts` começa vazio. Em desenvolvimento o site permanece não indexável. GTM exige configuração válida e consentimento; sem isso nenhum script de analytics é carregado. Sentry não inicializa em dev.

`GENERATE_SOURCEMAPS=true` no build gera mapas ocultos para envio por script. Configure credenciais de upload apenas no ambiente do CI e consulte [deploy](deployment.md).

## Preparar a máquina

Node conforme `package.json` (>=22.12.0), npm e backend configurado. Use `npm ci` em checkout limpo. `npm run dev` ocupa a porta 3000 com strictPort; não subir duas instâncias concorrentes no mesmo endereço.

O backend possui seu próprio `.env`, banco, filas e processo. Não copiar segredos dele para o frontend. A criação de usuário/login de desenvolvimento pertence ao backend.
