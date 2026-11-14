# Guia de Integrações Externas — Homologação e Credenciais

Este documento distingue claramente o que já está **implementado**, o que foi **testado em sandbox local** e o que está **pendente de homologação externa** (dependente de credenciais reais do lojista/domínio HTTPS).

---

## 1. Matriz de Status das Integrações

| Integração | Estado Atual | Observações e Dependências Externas |
|---|---|---|
| **Mercado Pago (Orders API v1 — Pix & Cartão)** | **Implementado e testado em sandbox** | Sem `access_token` configurado em sandbox, gera Pix QR/Copia e Cola simulado, cartão tokenizado sandbox e endpoints `/api/v1/sandbox/orders/{token}/simulate-payment` para homologação completa do webhook. Quando `MERCADOPAGO_ACCESS_TOKEN` (ou campo criptografado no Admin) é preenchido, envia requisições reais para `https://api.mercadopago.com/v1/orders`. **Pendente de homologação externa:** credenciais `APP_USR-*` reais + endpoint Webhook público em HTTPS. |
| **Webhook Mercado Pago (`/api/v1/webhooks/mercadopago`)** | **Implementado e testado (unit/feature)** | Valida assinatura HMAC-SHA256 (`x-signature` + `x-request-id` + `data.id`) usando `MERCADOPAGO_WEBHOOK_SECRET`, garante idempotência via tabela `webhook_events` e atualiza status + estoque automaticamente. **Pendente:** cadastro da URL pública `https://SEU_DOMINIO/api/v1/webhooks/mercadopago` no painel Mercado Pago Developers. |
| **Melhor Envio & Correios (Frete)** | **Implementado com fallback auditável** | `MelhorEnvioProvider` e `CorreiosProvider` consomem as APIs oficiais quando configurados (`MELHOR_ENVIO_TOKEN` / credenciais Correios). Sem token externo, `ShippingQuoteService` calcula automaticamente pelas regras cadastradas em `/admin/frete-pagamentos` (`fallback_used: true`) e exibe aviso transparente ao cliente. **Pendente de homologação externa:** geração de token OAuth2 do Melhor Envio e/ou contrato Correios. |
| **ViaCEP (Autocompletar Endereço)** | **Implementado (público)** | O checkout consulta `https://viacep.com.br/ws/{cep}/json/` no navegador; se indisponível ou sem rede, mantém todos os campos editáveis manualmente sem bloquear a compra. |
| **E-mail Transacional (SMTP)** | **Implementado (`MAIL_MAILER=log` em dev)** | Mails de confirmação, pagamento, envio e recuperação de senha utilizam fila Laravel (`QUEUE_CONNECTION=database`). **Pendente em produção:** credenciais SMTP reais no `backend/.env`. |
| **Google Analytics 4 / Meta Pixel** | **Implementado (opt-in LGPD)** | Configuráveis em `/admin/configuracoes` (`ga4_measurement_id`, `meta_pixel_id`); disparados somente após consentimento explícito no banner de cookies. **Pendente:** IDs reais de mensuração do lojista. |

---

## 2. Variáveis de Ambiente Necessárias para Produção (`backend/.env`)

```dotenv
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.seudominio.com.br
FRONTEND_URL=https://www.seudominio.com.br
SANCTUM_STATEFUL_DOMAINS=www.seudominio.com.br,seudominio.com.br

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=mistura_feminina
DB_USERNAME=mistura_app
DB_PASSWORD=SENHA_FORTE

QUEUE_CONNECTION=redis # ou database
CACHE_STORE=redis      # ou database
SESSION_DRIVER=database

# Mercado Pago (preferir configurar também no Admin > Frete & Pagamentos criptografado no banco)
MERCADOPAGO_ENV=production
MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxx
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxx
MERCADOPAGO_WEBHOOK_SECRET=xxxx

# Frete (Melhor Envio)
MELHOR_ENVIO_ENV=production
MELHOR_ENVIO_TOKEN=xxxx
STORE_ORIGIN_CEP=01001000

# E-mail Transacional (SMTP)
MAIL_MAILER=smtp
MAIL_HOST=smtp.seuprovedor.com.br
MAIL_PORT=587
MAIL_USERNAME=contato@seudominio.com.br
MAIL_PASSWORD=SENHA_SMTP
MAIL_FROM_ADDRESS=noreply@seudominio.com.br
MAIL_FROM_NAME="Mistura Feminina Cosméticos"
```

---

## 3. Passo a Passo para Virada de Sandbox → Produção
1. Cadastre as credenciais **Mercado Pago de Produção** e **Webhook Secret** em `/admin/frete-pagamentos` (ou no `.env`).
2. Configure no painel Mercado Pago a URL de webhook HTTPS: `https://api.seudominio.com.br/api/v1/webhooks/mercadopago`.
3. Altere `environment` para `production` em `/admin/frete-pagamentos` (em produção, o checkout bloqueia simulações sandbox e exige `access_token` real).
4. Configure o token de produção do **Melhor Envio** em `/admin/frete-pagamentos` (mantendo a tabela própria ativa apenas como fallback).
5. Execute um pedido teste real de R$ 1,00 via Pix e valide o retorno automático do webhook, baixa definitiva de estoque e disparo de e-mail.

