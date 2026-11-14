# Interface, identidade e animações

## Dois níveis de layout

`AuthFrame` tem apresentação simples por padrão. O estado bloqueado usa essa variante mínima. `/app` usa `SessionPage`, uma tela independente de confirmação de sessão, com nome do usuário, status e botão Sair; ela pode ser substituída pelo layout do cliente.

Login, recuperação e redefinição passam `presentation`. Essa variante split se inspira nos [starter kits oficiais do Laravel](https://laravel.com/docs/13.x/starter-kits), adaptada ao SolidJS: painel escuro decorativo no desktop, formulário claro e layout compacto no mobile. Não depende de Inertia, React ou Fortify no frontend.

O nome da marca vem de `VITE_APP_NAME`. O desenho é SVG local e não requer imagens externas, fontes externas ou conta de terceiros. Textos/arte e composição ficam em `features/auth/components/auth-frame.tsx`.

## Tailwind CSS 4

`src/styles/index.css` contém a importação do Tailwind e tokens semânticos neutros. Os formulários usam utilitários zinc; mensagens de erro usam red e avisos usam amber. O painel de autenticação tem acento orange apenas decorativo.

Não criar classes CSS manuais, `@apply` ou style props para layout. Constantes como `inputClass`, `buttonClass` e `linkClass` compartilham utilitários nos formulários. Tokens do fallback são definidos em `@theme`.

Ícones: `import Eye from "lucide-solid/icons/eye"`. Não usar o barrel de runtime `lucide-solid`, que pode fazer o Vite baixar o catálogo inteiro no desenvolvimento. Imports somente de tipos podem usar o pacote principal.

## Fallbacks

| Componente      | Uso                                                  |
| --------------- | ---------------------------------------------------- |
| `LoadingState`  | Aguardando rota/sessão/dados, com feedback acessível |
| `EmptyState`    | Consulta concluída sem itens                         |
| `ErrorState`    | Falha recuperável, mensagem segura e retry           |
| `StatusPage`    | 403/404 com ação de retorno                          |
| `NetworkStatus` | Aviso quando o navegador perde conectividade         |
| `StatePanel`    | Composição visual comum aos fallbacks                |

A tela inicial em `index.html` é estática e usa o stylesheet Tailwind antes do JS. Não a esconder até que exista conteúdo real. A falha de bootstrap em `main.tsx` oferece recarga sem depender do router.

## GSAP e lifecycle

GSAP é importado dinamicamente na variante visual da auth e na tela de confirmação de sessão, depois da montagem. A interface já está utilizável: o carregamento da animação nunca controla autenticação, visibilidade dos campos ou navegação.

A entrada anima deslocamento do conteúdo e transformação da arte, sem loop contínuo. `gsap.context()` limita e agrupa as animações; `onCleanup` reverte o contexto e remove listeners. Uma flag impede que import assíncrono crie animações depois do unmount.

`prefers-reduced-motion: reduce` evita o import/animação. Se essa preferência mudar durante a tela, as animações são revertidas. Não adicionar preload de GSAP ao bootstrap. A tela de sessão carrega a biblioteca apenas para sua própria animação de entrada.

A biblioteca aplica estilos transitórios de transformação durante a animação; isso é responsabilidade de GSAP, não uma nova camada de CSS de interface. Estado inicial e final da UI continuam definidos por Tailwind. A documentação oficial de [context e cleanup](<https://gsap.com/docs/v3/GSAP/gsap.context()>) explica esse ciclo.

## Acessibilidade

Labels e autocomplete reais, foco visível, controles com pelo menos 44px, ícones decorativos com aria-hidden e mensagens status/alert. O botão mostrar senha tem nome acessível e estado pressed. Não mover foco automaticamente nem esconder o formulário esperando uma animação. Testar teclado, mobile e preferência por movimento reduzido.
