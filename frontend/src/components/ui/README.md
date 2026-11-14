# Componentes compartilhados

O padrão visual é Tailwind CSS 4, com classes utilitárias diretamente nos componentes e tokens definidos em `@theme` no stylesheet global. Use `brand-*`, `ink`, `muted`, `canvas`, `surface` e `line`; reserve `danger` e `warning` para estados semânticos. Evite cores avulsas e novas classes CSS para componentes.

Reutilize `StatePanel`, `LoadingState`, `EmptyState`, `ErrorState` e `StatusPage` para fallbacks. Mantenha ações com foco visível, áreas de toque de pelo menos 44px, mensagens acessíveis e animações com `motion-safe`.

Importe ícones individualmente por `lucide-solid/icons/nome-canonico` para não carregar o catálogo inteiro no desenvolvimento. A tela inicial em `index.html` usa o mesmo Tailwind compilado, carregado por stylesheet antes do JavaScript.

Não há CSS de componentes, sidebar ou layout de demonstração. O stylesheet contém apenas a importação do Tailwind 4 e tokens `@theme` neutros. A autenticação usa utilitários zinc e o cliente pode criar seu próprio layout a partir de `/app`.
