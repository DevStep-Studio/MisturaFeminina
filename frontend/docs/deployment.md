# Produção e operação

## Ambientes

Use `.env.development.local` e `.env.production.local` (ignorados no Git), ou variáveis do ambiente de build. O `.env.example` contém os nomes. Recompile ao alterar valores VITE.

Para produção, configure URLs HTTPS reais de API, autenticação e site, versão publicada e `VITE_USE_REAL_API=true`. Ative indexação pública, analytics e Sentry somente quando desejado. Nunca use prefixo VITE para tokens de upload ou segredos.

## CI e publicação

`.github/workflows/ci.yml` executa instalação com lockfile, build/TypeScript, ESLint, Prettier, Vitest, Playwright, acessibilidade e auditoria. PRs e pushes em main executam qualidade. Nenhum deploy é liberado se esses checks falharem.

A execução manual em main também prepara um artefato de produção no environment `production`. Configure nele as variables VITE do workflow e proteções de ambiente adequadas. Sem configuração de deploy SSH, apenas o artefato é disponibilizado para a infraestrutura escolhida.

Para publicação SSH, configure `ENABLE_SSH_DEPLOY=true`, `DEPLOY_PATH` (diretório exclusivo do frontend) e os secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`. O workflow usa verificação de host e sincroniza somente dist com rsync. Arquivos antigos do diretório de destino são removidos; nunca aponte para um diretório compartilhado com backend, uploads ou configurações. O ambiente deve possuir backup/rollback para o artefato anterior. URLs de saúde são verificadas após publicação; uma falha marca a execução como falha, não faz rollback automaticamente.

Nenhum workflow foi executado remotamente nem deploy publicado por esta implementação. O diretório atual não tinha repositório Git configurado.

## Upload pelo cPanel / Apache

Execute `npm run build` em `frontend` com as variáveis de produção configuradas.
Publique **o conteúdo de `frontend/dist`**, incluindo o arquivo oculto `.htaccess`,
na raiz pública exclusiva do frontend (normalmente `public_html`). Faça backup da
publicação atual e preserve regras específicas da hospedagem ao integrar o `.htaccess`.
O Apache precisa permitir essas diretivas via `AllowOverride` e ter `mod_rewrite`
habilitado. `mod_headers` aplica as regras de cache quando disponível.

Envie primeiro `assets/`, `banners/` e os demais arquivos estáticos; envie
`index.html` por último. Mantenha temporariamente os arquivos com hash das versões
anteriores em `assets/` para atender abas abertas e HTML em cache. Não apague a pasta
antes de enviar a nova versão. No Gerenciador de Arquivos do cPanel, habilite a
exibição de arquivos ocultos para conferir o `.htaccess`.

Após publicar, confira uma rota interna por acesso direto, o tipo JavaScript dos
arquivos `.js` e o retorno 404 para `/assets/arquivo-inexistente.js`. HTML deve ser
revalidado; arquivos com hash podem ficar em cache por um ano. Se houver cache de
HTML na Cloudflare, limpe as páginas afetadas e confira se alguma regra da CDN
sobrescreve os headers da origem.

### Banners do carrossel principal

Os arquivos abaixo são incluídos automaticamente no build. Em
`/admin/aparencia`, cadastre os dois como banners ativos na posição `hero`, sem
imagem mobile (a mesma arte será exibida inteira em todas as telas):

| Título                        | Caminho da imagem desktop    | Link          | Ordem |
| ----------------------------- | ---------------------------- | ------------- | ----- |
| Black Friday                  | `/banners/black-friday.jpeg` | `/promocoes`  | 1     |
| Frete grátis para todo Brasil | `/banners/frete-gratis.jpeg` | `/categorias` | 2     |

Use textos alternativos descritivos das respectivas campanhas. Pause os outros
banners da posição `hero` para que o carrossel contenha apenas estes dois. Mantenha
a seção de tipo `hero_carousel` ativa na home. Não execute o seeder de demonstração
para alterar os banners de produção. Esse cadastro usa a API existente e continua
editável pelo painel; copiar as imagens por si só não altera os registros da API.

## Source maps privados

Configure `SENTRY_AUTH_TOKEN` como secret e `SENTRY_ORG`, `SENTRY_PROJECT` como variables. O release usa o SHA do commit tanto no frontend quanto no upload. Quando o token existe, o CI gera mapas hidden, injeta debug IDs, envia ao Sentry e remove os mapas antes de empacotar. Falha no upload bloqueia a publicação. Não salve esse token em VITE.

Localmente, em um ambiente privado com as credenciais configuradas:

```bash
GENERATE_SOURCEMAPS=true npm run build
npm run sourcemaps:upload
```

Defina também `SENTRY_RELEASE` e o mesmo valor em `VITE_APP_VERSION`. Não publique dist enquanto houver arquivos .map. O servidor de exemplo rejeita requisições de mapas.

## Servidor, headers e HTTPS

`deployment/nginx.conf` é um exemplo para servir dist com fallback SPA, assets e endpoints estáticos. Copie também `security-headers.conf` para o caminho indicado, adapte o domínio/API e configure TLS no proxy ou servidor real. HSTS só deve ser habilitado na origem HTTPS definitiva. Esses arquivos não alteram um servidor existente automaticamente.

A CSP começa em Report-Only, com origens restritas. Observe os relatórios e o navegador; ajuste as origens exatas de Sanctum, GTM/GA e Sentry quando habilitados, e depois passe para enforcement. Para scripts inline, utilize hashes ou nonces em infraestrutura adequada; não libere unsafe-inline globalmente. JSON-LD e os estilos necessários devem ser verificados com a política escolhida. A política de frames é complementada por X-Frame-Options.

Não armazene arquivos de configuração, tokens ou source maps na pasta pública. O domínio no sitemap/canonical deve coincidir com a publicação. A propriedade do Search Console, DNS e envio do sitemap dependem da conta responsável.

## Saúde, uptime e alertas

O build gera `/health.json` com status e versão; ele comprova a entrega de um arquivo do frontend, não a saúde do Laravel. O backend precisa de um endpoint próprio (por exemplo `/up`).

```bash
HEALTHCHECK_URL=https://app.seudominio.com.br API_HEALTHCHECK_URL=https://api.seudominio.com.br/up npm run healthcheck
```

O workflow `uptime.yml` pode executar esse teste a cada cinco minutos quando `ENABLE_UPTIME_MONITORING=true`; configure `HEALTHCHECK_URL` e opcionalmente `API_HEALTHCHECK_URL` nas variables do repositório. Habilite notificações de falha do GitHub Actions para os responsáveis. Para verificações frequentes, histórico de latência, validade antecipada do certificado e alertas dedicados, configure Uptime Kuma, Better Stack ou o serviço existente com essas URLs. O check HTTP valida a conexão TLS, mas não emite alertas antecipados sobre vencimento do certificado.

No Sentry configure alertas de novos erros, regressões e picos de falha. No serviço de uptime configure indisponibilidade, tempo de resposta e expiração SSL. Serviços externos e destinatários reais não estão provisionados por arquivos frontend.

## Performance e acessibilidade

O CI aplica orçamento de bundle e axe em login/área autenticada. Após publicar, valide Lighthouse, Core Web Vitals e teclado/leitor de tela nos fluxos reais. As rotas são divididas em chunks, consultas privadas não fazem preload e os serviços externos são opcionais. Dados de campo e alertas avançados de performance são opcionais e dependem da infraestrutura escolhida.
