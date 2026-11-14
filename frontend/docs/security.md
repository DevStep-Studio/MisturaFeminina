# Segurança e contrato de autenticação

A SPA usa cookies de sessão Laravel Sanctum. Configure CORS com origem exata, `credentials: include`, CSRF e domínios stateful compatíveis. Frontend e API precisam compartilhar o domínio registrável.

- `GET /sanctum/csrf-cookie`: prepara CSRF.
- `POST /login`: email e password; regenera sessão.
- `GET /api/v1/me`: retorna usuário, diretamente ou no envelope data.
- `POST /logout`: invalida sessão e renova CSRF.
- `POST /forgot-password`: recebe email.
- `POST /reset-password`: token, email, password e password_confirmation.

O usuário contém id e name, com email, roles, permissions e workspace_id opcionais. Permissões são recebidas do servidor; não há lista de permissões de negócio imposta pelo frontend.

A rota `/app` exige sessão validada. Retornos após login são restritos à allowlist de `safe-redirect.ts`. O frontend trata 401, 403, 419, 422 e 429 centralmente; indisponibilidade do servidor não é confundida com logout. Falhas no logout mantêm a sessão visual bloqueada até nova tentativa.

Não persistir credenciais ou dados privados no navegador. O cache privado é limpo quando muda a identidade ou ocorre encerramento/invalidação de sessão. O backend aplica toda autorização, validação e isolamento de dados.

`LIVE_API_URL=http://localhost:8000/api/v1 npm run check:api` verifica que `/me` rejeita acesso anônimo. Testes reais do backend devem cobrir CSRF, expiração, autorização e logout; os mocks do navegador verificam apenas o comportamento do frontend.

Sentry e analytics são opcionais. Eventos são sanitizados; não enviar senhas, cookies, tokens, queries ou dados pessoais. Tags de analytics dependem de consentimento explícito.
