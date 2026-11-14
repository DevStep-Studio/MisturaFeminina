# DevStep Solid Starter

Base mínima com SolidJS, TanStack Router/Query/Form e Tailwind CSS 4. Auth com layout split e entrada GSAP; área privada sem sidebar, dashboard ou módulos de demonstração.

## Documentação da equipe

Comece pelo [guia completo do frontend](docs/README.md): mapa do código, arquitetura, autenticação/API, desenvolvimento, configuração, UI/GSAP, testes e deploy.

## Executar

```sh
npm ci
cp .env.example .env
npm run dev
```

Configure `VITE_API_URL=http://localhost:8000/api/v1` e `VITE_AUTH_URL=http://localhost:8000`. O frontend e o backend devem usar o mesmo hostname. O backend Laravel é executado separadamente; consulte `../backend/docs/quickstart.md`.

## Rotas

- `/`: encaminha para a área privada e depois para login quando necessário.
- `/login`: autenticação por sessão Sanctum e MFA opcional.
- `/forgot-password` e `/reset-password`: recuperação de senha.
- `/app`: página privada mínima com confirmação da sessão e botão Sair.
- `/403` e `/404`: fallbacks reutilizáveis.

## Personalizar

Comece por `src/routes/_authenticated/app.tsx`. Adicione suas próprias rotas, funcionalidades e layout. Nenhum componente de navegação é imposto.

Todo visual usa classes utilitárias Tailwind 4. `src/styles/index.css` contém apenas `@import "tailwindcss"` e tokens `@theme` neutros, sem seletores de componentes ou CSS manual. Os componentes de autenticação ficam em `src/features/auth/components`; os fallbacks compartilhados ficam em `src/components/feedback` e `src/components/errors`.

Ao adicionar destinos privados, atualize a allowlist em `src/security/safe-redirect.ts`. O backend é responsável pela autorização; `src/security/permissions.ts` contém apenas helpers genéricos. A sessão não é persistida em localStorage, e sua validade é confirmada pelo backend.

Analytics e Sentry são opcionais e desativados por padrão. O consentimento aparece somente quando analytics está configurado e habilitado. Nenhuma rota de autenticação ou privada entra no sitemap; cadastre conteúdo público em `src/lib/site.ts` quando necessário.

## Verificação

```sh
npm run build
npm run lint
npm run format:check
npm test
npm run test:e2e
npm run performance:check
```

Os testes de navegador simulam o backend. Para verificar o bloqueio anônimo do backend real: `LIVE_API_URL=http://localhost:8000/api/v1 npm run check:api`.
