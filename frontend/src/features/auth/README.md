# Autenticação

Login e MFA opcional usam Laravel Sanctum. A sessão sempre é confirmada pelo backend, e nenhuma credencial é persistida no navegador.

- [Fluxos, arquivos e contrato HTTP](../../../docs/authentication.md)
- [Layout split, Tailwind 4 e GSAP](../../../docs/ui-and-motion.md)
- [Configuração de ambiente](../../../docs/configuration.md)

`AuthFrame` é simples por padrão; login e recuperação ativam `presentation`. A página privada `/app` permanece mínima. Não adicionar cadastro ou provedores sociais sem suporte correspondente no backend.
