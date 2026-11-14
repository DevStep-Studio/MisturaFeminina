# Arquitetura

Laravel 13 convencional com domínio Projects em `app/Domain/Projects`.
Controllers coordenam Requests, Policies, Actions e Resources. Eloquent mantém relações;
não há repositórios nem contratos sem necessidade concreta.

MySQL 8.4 é o banco padrão. Projects possui FK para users e índice para listagens do proprietário.
Os estados são planned, active e completed. Criação usa planned por padrão.
Somente name, description e status são persistidos a partir de entradas validadas.
Sem workspaces, cadastro público, roles dinâmicas, uploads ou webhooks nesta versão.
Usuários são provisionados pelo comando devstep:user.
Redis mantém cache e filas; sessões ficam no banco. Notifications de recuperação são enfileiradas
com timeout 30s, três tentativas e backoff. Redis deve ser privado e persistente.
Mudanças de schema são feitas exclusivamente por migrations versionadas.
