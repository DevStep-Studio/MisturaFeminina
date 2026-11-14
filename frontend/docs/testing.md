# Testes, qualidade e diagnóstico

## Comandos

| Comando                              | Verifica                                           |
| ------------------------------------ | -------------------------------------------------- |
| `npm run build`                      | Bundle de produção e TypeScript                    |
| `npm run lint`                       | ESLint sem warnings                                |
| `npm run format:check`               | Formatação Prettier                                |
| `npm test`                           | Vitest: unidade e integração                       |
| `npm run test:e2e`                   | Playwright com build isolado e navegador Chromium  |
| `npm run performance:check`          | Orçamento dos bundles em dist; executar após build |
| `npm run audit`                      | Vulnerabilidades conhecidas de dependências        |
| `npm run check`                      | Sequência completa, incluindo e2e e auditoria      |
| `LIVE_API_URL=... npm run check:api` | Backend real rejeita GET anônimo em /me            |

Na primeira execução de E2E, instale Chromium se necessário: `npx playwright install chromium`. O Playwright cria `.playwright-build` e usa 127.0.0.1:3100; ele não depende do servidor Vite da equipe na porta 3000.

## Cobertura e limites

`tests/unit` cobre redirecionamento, schemas, permissões genéricas e sanitização. `tests/integration` cobre transporte HTTP, CSRF, erros, cancelamento, deduplicação, sessão e isolamento de cache. `tests/e2e` cobre login, MFA opcional, recuperação, logout com erro, API indisponível, carregamento lento, acessibilidade, metadados e analytics com consentimento.

Os testes de navegador simulam respostas do backend; não provam policies, segurança do banco, entrega de e-mail ou sessões reais no Laravel. Execute também testes e verificações do backend quando mudar contratos.

Ao corrigir um teste, preserve a propriedade que ele valida. Ao remover uma funcionalidade, adapte cenários obsoletos para o novo contrato. Testes de layout não precisam espelhar cada classe Tailwind; prefira comportamento, foco, ausência de overflow e acessibilidade.

## Diagnóstico rápido

| Sintoma                    | Verificar                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Porta 3000 ocupada         | Processo existente; evitar iniciar outra instância                                                            |
| Tela inicial não termina   | Console, chunk de bootstrap e backend; o retry de startup recarrega a página                                  |
| Erro de configuração       | URLs/flags em .env; reiniciar Vite                                                                            |
| Falha de rede no login     | Backend ativo, CORS com credentials, hostname e URLs                                                          |
| 419                        | Cookie XSRF-TOKEN, header X-XSRF-TOKEN, sessão e domínios stateful                                            |
| 401 após login             | /me, cookies de sessão e configuração Sanctum                                                                 |
| 422                        | Payload/validação de campos; não tratar como indisponibilidade                                                |
| 429                        | Rate limit; aguardar o período informado pelo backend                                                         |
| Sessão bloqueada após sair | Logout falhou; botão Sair permite tentar novamente                                                            |
| Muitos requests de ícones  | Import de barrel; usar subpaths individuais                                                                   |
| Animação não aparece       | Movimento reduzido ativo, import GSAP indisponível ou entrada já concluída; a auth deve funcionar mesmo assim |
| Alterações sem efeito      | Servidor correto, porta, cache e build atualizado                                                             |
| E2E falha só na CI         | Chromium/dependências instaladas, logs, trace e test-results                                                  |

Use X-Request-ID para correlacionar falhas sem compartilhar credenciais, cookies ou payloads pessoais. Não enviar dumps de sessão para logs ou ferramentas de analytics.

## Validação visual

Conferir login, recuperação, reset e /app em desktop e mobile. A área privada deve permanecer sem painel visual da auth. Verificar mostrar/ocultar senha, foco pelo teclado, loading com API atrasada e reduced motion. O formulário não pode ficar invisível ou depender de GSAP para ser utilizado.
