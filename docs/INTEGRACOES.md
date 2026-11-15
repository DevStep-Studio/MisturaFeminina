# Checkout, pagamentos e frete — Mistura Feminina

O checkout mantém o carrinho com vários produtos, variantes, cupons, reservas de estoque e o layout da loja. Os adaptadores fazem chamadas HTTPS às APIs reais. Não há aprovação automática, Pix fictício ou simulação pública de webhook; sandbox exige credenciais do provedor. Os testes automatizados usam respostas HTTP controladas e não movimentam dinheiro.

## Configurar pelo admin ou .env

Em **Admin → Frete e Pagamentos → Checkout e integrações reais**, escolha o provedor padrão das novas compras, o ambiente e ative as integrações desejadas. Mercado Pago, Asaas e Correios são opcionais. Os campos salvos no admin têm prioridade sobre o `.env`. Campos secretos vazios preservam a credencial atual; desmarque “Integração ativa” para desabilitar. Credenciais ficam criptografadas com `APP_KEY` e não são devolvidas pela API.

Somente usuários com permissões de integrações/configurações podem salvar esses campos. A página também apresenta pagamentos dos dois provedores, valores e conciliação manual. As telas de pedidos, estoque, expedição e rastreamento existentes continuam sendo utilizadas.

Alternativa no `backend/.env` (não coloque segredos em variáveis `VITE_*`):

```dotenv
PAYMENTS_DEFAULT_PROVIDER=mercadopago
PAYMENTS_WEBHOOK_BASE_URL=https://api.seudominio.com.br
MERCADO_PAGO_ENABLED=true
MERCADO_PAGO_ENVIRONMENT=sandbox
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_PUBLIC_KEY=
MERCADO_PAGO_WEBHOOK_SECRET=

ASAAS_ENABLED=false
ASAAS_ENVIRONMENT=sandbox
ASAAS_API_KEY=''
ASAAS_WEBHOOK_TOKEN=

CORREIOS_ENABLED=false
CORREIOS_ENVIRONMENT=sandbox
CORREIOS_USERNAME=
CORREIOS_API_PASSWORD=
CORREIOS_POSTING_CARD=
CORREIOS_CONTRACT=
CORREIOS_REGIONAL=
CORREIOS_ORIGIN_ZIP=
CORREIOS_SERVICES=03220:SEDEX,03298:PAC
```

Os valores de ambiente são `sandbox` e `production`. Os códigos de serviço são exemplos: configure apenas os serviços autorizados no contrato dos Correios. Para usar Asaas, habilite a integração e selecione `asaas` como padrão. A API Key Asaas com `$` deve estar entre aspas simples no dotenv. As variáveis antigas `MERCADOPAGO_*`/`CORREIOS_TOKEN` não configuram o novo checkout: use os nomes acima ou o admin.

Depois de atualizar o código, execute `php artisan migrate` e `php artisan config:clear` (ou gere o cache correto no deploy). Nenhum produto precisa ser duplicado em arquivo de configuração: preço, peso e dimensões vêm do catálogo administrativo existente.

## Fluxo da compra

1. A cliente monta o carrinho e informa contato, CPF/CNPJ e endereço. O ViaCEP ajuda no preenchimento, mas permite edição manual se estiver indisponível.
2. A loja consulta o frete, a cliente escolhe o serviço e confirma o pedido. A cotação dura **15 minutos** e pertence ao carrinho, CEP, produtos, quantidades, preços, peso e dimensões. Alterações exigem nova cotação.
3. O backend recalcula produtos, descontos e entrega e congela os valores no pedido. Valores enviados pelo navegador não definem a cobrança.
4. **Mercado Pago:** abre o Payment Brick na página de confirmação, limitado a Pix, cartão de crédito à vista ou boleto conforme a escolha. O SDK é carregado somente quando necessário. Número/CVV são preenchidos no formulário do provedor; a API recebe apenas o token.
5. **Asaas:** cria cliente/cobrança do método selecionado e encaminha à fatura oficial (`invoiceUrl`) somente após confirmar o pedido. Se o redirecionamento falhar, a página do pedido oferece “Continuar pagamento no Asaas”. Não há notificações automáticas do Asaas criadas por esta integração.
6. A confirmação mostra Pix QR/Copia e Cola, boleto ou link Asaas e acompanha o estado local a cada 10 segundos com a aba visível. “Atualizar status” consulta também o provedor. O retorno de uma URL não confirma pagamento.

Cada criação possui chave de idempotência; tentativas são gravadas antes da chamada externa. Falha ambígua vira `unknown`, bloqueia outra cobrança e é conciliada pela referência original. Não recrie manualmente um pagamento cujo resultado ainda é incerto. A baixa definitiva do estoque usa a confirmação consultada na API, e webhooks duplicados não deduzem o estoque duas vezes.

Reservas sem pagamento iniciado expiram pelo agendador. Pagamentos `pending`/`processing`/`unknown` não liberam estoque apenas pelo relógio local, pois Pix/boleto ou uma operação incerta ainda podem ser confirmados. Monitore pendências antigas no admin e no provedor.

O escopo financeiro é cobrança e conciliação; estornos devem ser solicitados no painel oficial do provedor e depois conciliados. A ação antiga de reembolso automático do admin não inicia operações neste fluxo.

## Correios e modalidades da loja

A integração autentica no CWS com usuário, código de acesso e cartão de postagem; o token é guardado criptografado em cache e renovado na expiração/401. Consulta as APIs **Preço e Prazo separadamente**, usando contrato, DR, origem e destino. Não inventa prazo de entrega.

A embalagem usa comprimento/largura máximos do carrinho, soma das alturas multiplicadas pela quantidade e soma dos pesos. É empilhamento simples, com limite de 30 kg, 100 cm por lado e 200 cm na soma. Revise as medidas cadastradas no admin. Não há geração de etiquetas ou contratação de postagem nesta entrega; a expedição/rastreamento existentes permanecem manuais.

Sem transportadora online configurada, as modalidades próprias cadastradas no admin continuam válidas e são identificadas como tabela da loja. Quando uma transportadora ativa falha ou não retorna tarifa válida, a cotação falha e pede nova tentativa; não é substituída silenciosamente por tabela ou frete grátis. Promoções de frete grátis e cupons continuam seguindo as regras explícitas da loja, sobre modalidades válidas.

## Webhooks e execução

Cadastre endpoints HTTPS públicos no painel do provedor:

- Mercado Pago: `POST /api/v1/webhooks/mercadopago`, evento `payment`. Assinatura HMAC-SHA256 com `data.id` da query, `x-request-id`, `x-signature`, segredo exclusivo e tolerância de cinco minutos. O ID do corpo precisa corresponder ao da query.
- Asaas: `POST /api/v1/webhooks/asaas`, eventos `PAYMENT_*`. Configure `authToken` igual a `ASAAS_WEBHOOK_TOKEN`; ele chega em `asaas-access-token`. Não use a API Key como token de webhook.

Os recibos são persistidos/deduplicados em `payment_events`, e o job consulta o pagamento canônico e valida referência, valor e moeda antes de atualizar pedido/estoque. Valores/status do corpo do webhook não são usados como confirmação. As únicas exceções de CSRF são esses dois endpoints. O endpoint público antigo de simulação retorna 404.

```sh
php artisan queue:work --sleep=1 --tries=5 --timeout=60
php artisan schedule:work
php artisan mistura:reconcile-payments
```

Os inicializadores `iniciar.sh` e `iniciar.bat` agora também iniciam worker e scheduler; Ctrl+C encerra os processos gerenciados. Em produção, utilize Supervisor/Horizon e cron `schedule:run`, conforme [DEPLOY.md](DEPLOY.md). A conciliação roda a cada cinco minutos e nunca cria uma cobrança nova. Consulte `queue:failed` em falhas persistentes.

Mantenha credenciais e bancos separados por ambiente. Pedidos guardam provedor e ambiente originais; não troque credenciais de ambiente enquanto existirem pagamentos pendentes sem conciliá-los. Pedidos antigos da implementação simulada/Orders API não são convertidos em cobranças novas automaticamente.

## Homologação externa

A suíte cobre os adaptadores reais com HTTP fake, assinatura/deduplicação, estoque, idempotência, cotação e fluxo no navegador. A homologação nos serviços externos depende das credenciais da lojista, APIs Correios autorizadas e domínio HTTPS para os webhooks. Antes de produção, valide Pix, cartão aprovado/recusado, boleto, callback, reenvio de webhook, timeout e conciliação com dados de teste oficiais. Nenhuma cobrança real é criada pelos testes.

SMTP e analytics mantêm sua configuração existente: e-mails usam a fila Laravel e dependem das credenciais `MAIL_*`; mensuração depende de consentimento e IDs configurados pela loja.

Referências oficiais: [Payment Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/introduction), [Pix e boleto MP](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/other-payment-methods), [Asaas cobranças](https://docs.asaas.com/docs/guia-de-cobrancas), [Asaas cartão na fatura](https://docs.asaas.com/docs/cobrancas-via-cartao-de-credito), [Correios Token](https://www.correios.com.br/atendimento/developers/manuais/manual-uso-da-api-token), [Preço](https://www.correios.com.br/atendimento/developers/manuais/manual-api-preco-1) e [Prazo](https://www.correios.com.br/atendimento/developers/manuais/manual-api-prazo).
