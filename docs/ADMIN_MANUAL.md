# Manual do Administrador — Mistura Feminina Cosméticos

O painel administrativo (`/admin`) permite operar toda a loja sem alterar código. Faça login em `/entrar` com usuário administrativo (ou conta provisionada via `php artisan mistura:admin`).

---

## 1. Painel Principal (`/admin`)
- KPIs em tempo real: **Vendas Hoje**, **Faturamento 30 Dias**, **Ticket Médio (30D)** e **Fila Operacional**.
- Lista de **Pedidos Recentes** e **Alertas de Estoque Baixo** com acesso rápido para ajuste.

## 2. Pedidos e Expedição (`/admin/pedidos`)
- Filtragem por status (`pending_payment`, `paid`, `preparing`, `shipped`, `delivered`, `cancelled`, `refunded`) e busca por número/cliente.
- Ações por pedido:
  - Atualizar status da operação e registrar **código/URL de rastreio** + transportadora.
  - Visualizar detalhes completos, histórico de status e pagamentos.
  - Cancelar pedido (estornando reserva de estoque) ou registrar reembolso/envio de e-mail transacional.

## 3. Produtos, Variações, Kits e Estoque (`/admin/produtos`)
- Criar e editar produtos **Simples**, **Com Variações** (cores, tamanhos, tons, kits de atributos) ou **Kits/Combos**.
- Upload direto de múltiplas imagens por produto com escolha de foto principal.
- Ajuste manual de estoque auditado (entrada, saída ou correção com motivo registrado em `stock_movements`).
- **Importar/Exportar CSV** para atualização massiva de catálogo e preços.

## 4. Categorias e Marcas (`/admin/categorias-marcas`)
- Cadastro de categorias multinível (categoria pai, ordem, visibilidade no menu) e imagens de miniatura.
- Cadastro de marcas parceiras e logotipos para a vitrine e filtros.

## 5. Aparência, Banners, Home e Páginas (`/admin/aparencia`)
- **Construtor da Home:** Reordenar, ativar/desativar e configurar seções da página inicial (Carrossel Hero, Faixa de Cupom, Benefícios, Categorias Circulares, Vitrines de Produtos, Grid de Banners, Marcas, Depoimentos e Newsletter).
- **Banners:** Gerenciar imagens separadas para **Desktop** e **Mobile**, link de destino (`cta_url`), posicionamento (`hero`, `promo_grid`, `category_banner`) e janela de agendamento.
- **Páginas Institucionais:** Editar conteúdo HTML/texto de `Sobre`, `Trocas e Devoluções`, `Privacidade (LGPD)`, `Termos de Uso`, `Dúvidas`, `Formas de Pagamento` e `Política de Entrega`.
- **Moderação de Avaliações:** Aprovar ou rejeitar avaliações enviadas pelos clientes antes da exibição pública.

## 6. Marketing (`/admin/marketing`)
- **Cupons de Desconto:** Percentual, valor fixo em reais ou frete grátis, com valor mínimo de pedido, validade e limite de usos.
- **Promoções por Catálogo:** Regras automáticas de desconto por período.
- **Faixa Superior (Ticker) e Pop-up Promocional:** Editar frases da barra superior e título/cupom do modal promocional da loja.
- **Newsletter:** Visualizar e exportar assinantes ativos.

## 7. Frete e Pagamentos (`/admin/frete-pagamentos`)
- **Frete:** Configurar regras de tabela fallback/própria por faixa de CEP, UF, peso, valor mínimo para frete grátis e modalidade de retirada/motoboy.
- **Credenciais de Transportadoras (Melhor Envio / Correios) e CEP de Origem.**
- **Mercado Pago:** Alternar entre `sandbox` e `production`, informar `public_key`, `access_token` (criptografado no banco) e `webhook_secret`, além de acionar reconciliação manual e inspecionar logs de webhooks.

## 8. Marca & Integrações (`/admin/configuracoes`)
- Alterar **sem mexer em código**: Nome da loja, slogan, **Logo Claro**, **Logo Escuro**, **Favicon**, cores (`primary`, `primary_hover`, `secondary`, `accent`), CNPJ, telefone, WhatsApp, e-mail de contato, horário de atendimento, redes sociais e scripts de analytics (GA4 / Meta Pixel).

## 9. Relatórios (`/admin/relatorios`) e Equipe & Saúde (`/admin/equipe-sistema`)
- Exportação CSV de vendas por período, produtos mais vendidos e fluxo de estoque.
- Gerenciamento de usuários internos com RBAC, logs de auditoria, 2FA TOTP e criação de backups do banco.

