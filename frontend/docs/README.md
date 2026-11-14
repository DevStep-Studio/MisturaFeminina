# Guia do frontend

Este é o ponto de entrada para a equipe. O frontend é uma SPA SolidJS em TypeScript, com autenticação Laravel Sanctum, rotas TanStack e Tailwind CSS 4. A aplicação privada começa mínima em `/app`; o layout visual completo fica restrito às telas de autenticação.

## Primeiros 15 minutos

1. Leia o [README do projeto](../README.md) e configure o ambiente.
2. Abra [o mapa da arquitetura](architecture.md) para localizar cada responsabilidade.
3. Entenda [autenticação e API](authentication.md) antes de criar fluxos privados.
4. Use o [guia de desenvolvimento](development.md) para a primeira funcionalidade.
5. Consulte [UI e animações](ui-and-motion.md) para manter o padrão visual.
6. Execute a [validação e diagnóstico](testing.md) antes de entregar.

## Onde encontrar o quê

| Preciso…                            | Começar por                                                             |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Criar uma tela privada              | `src/routes/_authenticated/app.tsx` e [desenvolvimento](development.md) |
| Alterar login, MFA ou recuperação   | `src/features/auth/components` e [autenticação](authentication.md)      |
| Alterar a composição visual da auth | `auth-frame.tsx` e [UI](ui-and-motion.md)                               |
| Configurar URLs e integrações       | `.env.example`, `src/app/config.ts` e [configuração](configuration.md)  |
| Fazer uma chamada HTTP              | `src/lib/api.ts` e [API](authentication.md#cliente-http)                |
| Definir consultas e cache           | `src/lib/query-client.ts`, `src/security/session.ts`                    |
| Criar um fallback                   | `src/components/feedback` ou `src/components/errors`                    |
| Entender erros de sessão            | [diagnóstico](testing.md#diagnóstico-rápido)                            |
| Preparar produção                   | [deploy](deployment.md) e [segurança](security.md)                      |

## Limites do starter

Não há cadastro público, login social, navegação administrativa ou dashboard pronto. MFA no frontend é opcional e depende de implementação correspondente no backend. O backend desta base não habilita MFA por padrão. Sentry e analytics também são opcionais.

Os exemplos de funcionalidades neste guia são orientações para extensão, não endpoints ou telas já implementados. Nunca trate os mocks dos testes como autorização real do servidor.
