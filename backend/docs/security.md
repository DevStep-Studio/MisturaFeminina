# Segurança

Policies verificam propriedade; consultas de Projects são sempre ancoradas no usuário autenticado.
Não existe listagem pública de usuários nem permissões administrativas nesta versão.
CORS aceita somente FRONTEND_URL e expõe X-Request-ID. Não use wildcard com cookies.
Sanctum exige domínio registrável compartilhado. Configure SANCTUM_STATEFUL_DOMAINS com portas locais.
Para subdomínios configure SESSION_DOMAIN=.exemplo.com e SESSION_SECURE_COOKIE=true.
Produção exige HTTPS, APP_DEBUG=false e origem exata. O servidor deve confiar apenas nos proxies conhecidos.

Não registrar credenciais, tokens, cookies, payload de recuperação ou e-mails completos em logs operacionais.
Sentry desativa PII e remove request, user, extras e breadcrumbs. Revise também mensagens de exceção antes de
habilitar integrações externas em domínios que processam dados sensíveis.
Logs daily têm retenção configurável; limite acesso aos logs e ao Redis, que contém jobs com tokens de recuperação.
Configure retenção, rotação, backups criptografados e menor privilégio para banco e workers.
Nginx limita requisições a 1MB no exemplo de deploy. Uploads não estão disponíveis.
Horizon e OpenAPI são negados fora de local até existir uma política administrativa explícita.
