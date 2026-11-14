# Desenvolver uma funcionalidade

## Antes de começar

Execute frontend e backend separadamente. Verifique `.env`, rotas e contrato real da API. Use o gerenciador npm e mantenha o lockfile atualizado. Não adicione dependências para resolver algo já coberto por Solid, TanStack ou Tailwind.

## Criar uma tela privada

1. Crie `src/features/<domínio>/components/<pagina>.tsx`.
2. Adicione uma rota em `src/routes/_authenticated/<pagina>.tsx`.
3. Exporte `Route = createFileRoute(...)` e declare metadados noindex com `seoHead`.
4. Adicione permissão no `beforeLoad` apenas se houver contrato no backend; use `context.user` validado e `requirePermission`.
5. Se essa tela puder ser destino de login, atualize a allowlist e tipo em `safe-redirect.ts`.
6. Cadastre o caminho público sanitizado em `monitoring/sanitize.ts` quando necessário. Nunca incluir identificadores pessoais nesse mapeamento.
7. Execute Vite/build para atualizar a árvore gerada. Não editar `routeTree.gen.ts`.

A página `/app` é o ponto inicial para o layout do cliente. Não há sidebar ou header global imposto. Não coloque identidade visual da aplicação privada no `AuthFrame`.

## Estrutura sugerida por funcionalidade

```text
features/<domínio>/
  api/          consultas e mutations
  components/   UI da funcionalidade
  schemas/      validação Zod de entradas e respostas
  types/        tipos inferidos quando úteis
```

Crie apenas pastas necessárias. Tipos usados em um único arquivo podem permanecer locais.

## Buscar e alterar dados

- Use `api()` para transporte, não um fetch paralelo com outra política de cookies/erros.
- Use Query para leitura remota e Mutation para escrita. Conserve o AbortSignal.
- Valide o payload com Zod e normalize envelopes no limite da funcionalidade.
- Marque dados privados com `meta.private` e use `privateQueryKey`.
- Após mutation bem-sucedida, invalide somente as chaves afetadas; não limpar todo o cache sem necessidade.
- Não usar `createEffect` para disparar fetch a cada alteração incidental da UI.
- Modele estados loading/error/empty/success e ofereça nova tentativa quando fizer sentido.

## Formulários

Use TanStack Form com schema Zod, labels associados, autocomplete correto e feedback por campo. Marque `aria-invalid` e `aria-describedby` quando houver erro. Durante envio, desabilite somente ações que não podem repetir. O backend continua validando tudo.

Recuperação de senha é um formulário menor e usa FormData; mantenha esse padrão simples quando não precisar de estado e validação complexos.

## Componentes e estilos

Tailwind 4 é o padrão obrigatório de interface. Use classes utilitárias e tokens `@theme`, sem CSS manual, estilos inline próprios ou `@apply`. A biblioteca de ícones deve ser importada por subpath individual, usando o nome canônico disponível no pacote instalado.

Props em Solid são reativas: evite desestruturá-las quando isso congelar valores. Use `Show`, `For` e `Switch` para composição; use `onCleanup` para observers, timers, media queries e bibliotecas externas. Um layout compartilhado pode resolver seus children com `children()`.

## Metadados e páginas públicas

Declare título, descrição e canonical com `seoHead`. Auth e páginas privadas sempre usam noindex. Para conteúdo público indexável, registre o caminho em `src/lib/site.ts` e configure a origem real. Não adicionar rotas privadas ao sitemap.

## Revisão antes da entrega

Confirme comportamento anônimo/autenticado, falhas reais, cancelamento, mobile, foco e mensagens. Execute os checks relevantes descritos em [testes](testing.md), atualize documentação de contratos e remova referências a caminhos antigos.
