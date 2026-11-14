# Autenticação

Sanctum usa sessão HttpOnly para a SPA de primeira parte. Não há emissão de tokens públicos.

1. GET /sanctum/csrf-cookie com credentials include.
2. POST /login com email/password e X-XSRF-TOKEN decodificado do cookie XSRF-TOKEN.
3. GET /api/v1/me retorna data com id, name, email, roles, permissions e workspace_id.
4. POST /logout invalida sessão e renova CSRF.

Login retorna 204, erro de credenciais retorna 422 genérico. Login é limitado por IP e e-mail/IP.
POST /forgot-password recebe email e responde genericamente, mesmo para conta ausente.
POST /reset-password recebe token, email, password e password_confirmation.
Senha nova exige 12 caracteres, maiúscula, minúscula e número. Redefinição invalida sessões em banco.
A notificação é processada por Horizon; configure SMTP e FRONTEND_URL para o link.

Permissões de projetos são fixas no servidor. Usuários acessam apenas projetos próprios.
MFA e verificação obrigatória de e-mail ficam fora desta versão.
