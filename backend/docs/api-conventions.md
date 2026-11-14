# Contrato API v1

GET /api/v1/me retorna {data: usuário}.
GET /api/v1/projects retorna {data: projetos[], links, meta}; page >= 1, per_page 1..100 (padrão 15).
A ordenação é id decrescente. GET /api/v1/projects/{id} retorna {data: projeto}.
POST /api/v1/projects retorna 201. PATCH ou PUT /api/v1/projects/{id} retorna 200.
DELETE /api/v1/projects/{id} retorna 204.

Projeto público: id, name, description (string ou null), status, created_at e updated_at.
Nome obrigatório na criação, até 150 caracteres. Descrição opcional, até 2000 caracteres.
Status: planned, active, completed. Atualização aceita campos parciais.
user_id, id e timestamps enviados pelo cliente são rejeitados.

401 sem sessão; 403 sem autorização; 404 para projeto ausente ou de terceiro;
419 CSRF inválido; 422 validação com message/errors; 429 excesso de requisições.
Erros JSON incluem request_id; o header X-Request-ID está presente nas respostas.
O cliente trata códigos HTTP e não depende de mensagens técnicas.

Documentação em /docs/api, schema em /docs/api.json, restritos ao ambiente local.
Exportar com php artisan scramble:export --path=docs/openapi.json.
O schema cobre rotas API; autenticação de sessão está documentada em authentication.md.
