export interface SupportActionLink {
  label: string;
  href: string;
  isExternal?: boolean;
}

export interface SupportQuestion {
  id: string;
  question: string;
  shortAnswer: string;
  fullAnswer: string;
  bullets?: string[];
  actionLinks?: SupportActionLink[];
  keywords: string[];
}

export interface SupportTopic {
  id: string;
  title: string;
  icon: "shopping-bag" | "truck" | "credit-card" | "map-pin" | "refresh-cw" | "boxes" | "sparkles" | "user" | "message-circle";
  badge?: string;
  description: string;
  questions: SupportQuestion[];
}

export const SELF_SERVICE_TOPICS: SupportTopic[] = [
  {
    id: "como-comprar",
    title: "Como Comprar",
    icon: "shopping-bag",
    badge: "Iniciantes",
    description: "Tudo o que você precisa saber para encontrar produtos, escolher cores e finalizar seu pedido.",
    questions: [
      {
        id: "passo-a-passo-compra",
        question: "Como fazer um pedido na Mistura Feminina Cosméticos?",
        shortAnswer: "Escolha seus produtos, selecione variações se houver, adicione à sacola e conclua em poucos cliques.",
        fullAnswer:
          "Comprar na Mistura Feminina é rápido, simples e seguro. Nossa loja foi desenvolvida pensando na praticidade tanto de manicures e nail designers quanto de consumidoras finais. Siga o passo a passo a seguir:",
        bullets: [
          "Navegue pelas categorias pelo menu ou utilize a barra de busca para encontrar o item desejado.",
          "Na página do produto, confira detalhes técnicos, fotos e selecione variações (como cor do esmalte, voltagem de cabines ou tamanho de tips).",
          "Clique em 'Adicionar à Sacola' ou 'Comprar Agora'.",
          "No carrinho, informe seu CEP para calcular o frete e conferir o prazo de entrega.",
          "Clique em 'Finalizar Compra', faça login ou crie seu cadastro rápido e escolha a forma de pagamento (Pix com desconto à vista ou Cartão em até 12x)."
        ],
        actionLinks: [
          { label: "Ver Categorias da Loja", href: "/categorias" },
          { label: "Ir para Sacola de Compras", href: "/carrinho" }
        ],
        keywords: ["comprar", "pedido", "carrinho", "sacola", "passo a passo", "como comprar", "finalizar"]
      },
      {
        id: "escolher-variacoes",
        question: "Como selecionar cores de esmaltes, voltagens e tamanhos?",
        shortAnswer: "Basta clicar sobre a opção desejada na página do produto antes de adicionar ao carrinho.",
        fullAnswer:
          "Produtos com opções (como cores de esmaltes em gel, voltagem 110V/220V em cabines ou modelos de tips) exibem seletores interativos na página do produto. Ao clicar na opção desejada, o preço, a foto e a disponibilidade de estoque são atualizados automaticamente em tempo real.",
        bullets: [
          "Selecione uma opção clicando no botão ou miniatura correspondente.",
          "Confira o estoque disponível da opção escolhida.",
          "Clique em 'Adicionar à Sacola' para garantir o item selecionado."
        ],
        actionLinks: [
          { label: "Explorar Esmaltes em Gel", href: "/categoria/esmalte-em-gel" },
          { label: "Explorar Cabines UV/LED", href: "/categoria/maquinarios" }
        ],
        keywords: ["variação", "cor", "voltagem", "tamanho", "esmalte", "cabine", "110v", "220v", "bivolt"]
      },
      {
        id: "pedido-minimo",
        question: "Existe valor mínimo para compras na loja?",
        shortAnswer: "Não! Para compras no varejo você pode comprar a partir de 1 unidade sem valor mínimo exigido.",
        fullAnswer:
          "Você tem total liberdade para adquirir a quantidade que precisar, seja para reposição imediata de um item de bancada ou para compras completas de início de trabalho. Para condições de atacado com descontos progressivos por quantidade, consulte nossa seção de Atacado.",
        actionLinks: [
          { label: "Conhecer Tabela de Atacado", href: "/atacado" }
        ],
        keywords: ["pedido mínimo", "valor mínimo", "quantidade mínima", "comprar pouco"]
      },
      {
        id: "seguranca-loja",
        question: "O site da Mistura Feminina é seguro e confiável?",
        shortAnswer: "Sim! Utilizamos certificado SSL de criptografia de ponta a ponta e processadores de pagamento certificados pelo Banco Central.",
        fullAnswer:
          "Sua segurança é nossa prioridade absoluta. Todos os dados transitam por conexões seguras criptografadas (HTTPS/SSL). Suas informações financeiras são processadas diretamente pelas instituições de pagamento parceiras (Mercado Pago e Plupag), sem retenção de dados sensíveis de cartão pela loja.",
        bullets: [
          "Criptografia SSL ativa em 100% da navegação.",
          "Intermediadores oficiais regulamentados pelo Banco Central.",
          "Empresa com CNPJ ativo e atendimento humanizado oficial."
        ],
        keywords: ["seguro", "confiável", "segurança", "dados", "cartão de crédito", "golpe", "ssl"]
      }
    ]
  },
  {
    id: "pedidos-rastreio",
    title: "Acompanhar Pedido & Rastreamento",
    icon: "truck",
    badge: "Muito procurado",
    description: "Consulte o andamento da sua compra, código de rastreio e prazos de postagem.",
    questions: [
      {
        id: "como-rastrear-pedido",
        question: "Como rastrear o envio da minha encomenda?",
        shortAnswer: "Acesse a página de rastreio com seu código ou confira o histórico na área Minha Conta.",
        fullAnswer:
          "Assim que seu pedido é faturado e despachado pelas transportadoras parceiras, você recebe uma notificação por e-mail com o código de rastreamento. Você pode acompanhar a localização em tempo real de duas formas:",
        bullets: [
          "Página de Rastreio Rápido: digite o código de rastreio na página oficial de rastreamento da loja.",
          "Área Minha Conta: faça login e clique em 'Meus Pedidos' para ver o status detalhado de todas as suas compras."
        ],
        actionLinks: [
          { label: "Rastrear Pedido Agora", href: "/rastrear-pedido" },
          { label: "Ver Meus Pedidos", href: "/minha-conta" }
        ],
        keywords: ["rastrear", "rastreamento", "onde está", "código", "localização", "encomenda", "correios"]
      },
      {
        id: "onde-encontro-codigo",
        question: "Onde encontro o código de rastreamento do meu pedido?",
        shortAnswer: "O código é enviado para o seu e-mail cadastrado e também fica disponível na tela 'Meus Pedidos'.",
        fullAnswer:
          "O código de rastreio é gerado assim que o pacote é preparado e a etiqueta de envio é emitida. Caso você não localize o e-mail, verifique a caixa de Spam/Promoções ou acesse diretamente sua conta em nosso site.",
        actionLinks: [
          { label: "Consultar em Minha Conta", href: "/minha-conta" }
        ],
        keywords: ["código de rastreio", "encontrar código", "email rastreio", "não recebi rastreio"]
      },
      {
        id: "prazo-postagem",
        question: "Qual o prazo para o meu pedido ser postado após o pagamento?",
        shortAnswer: "Pedidos com pagamento aprovado são preparados e despachados em até 1 a 2 dias úteis.",
        fullAnswer:
          "Trabalhamos com agilidade para que seus produtos cheguem o mais rápido possível à sua bancada. Pagamentos confirmados via Pix costumam ter liberação imediata para a fila de expedição.",
        bullets: [
          "Pix: aprovação em poucos segundos.",
          "Cartão de crédito: aprovação geralmente instantânea (ou em até 24h em análise de segurança).",
          "Boleto bancário: compensação em até 1 a 2 dias úteis bancários."
        ],
        keywords: ["postagem", "prazo de postagem", "quando envia", "demora para enviar", "despacho"]
      }
    ]
  },
  {
    id: "pagamentos",
    title: "Formas de Pagamento & Pix",
    icon: "credit-card",
    description: "Saiba mais sobre Pix à vista com desconto, parcelamento no Cartão e aprovação segura.",
    questions: [
      {
        id: "formas-pagamento-aceitas",
        question: "Quais são as formas de pagamento disponíveis na loja?",
        shortAnswer: "Aceitamos Pix com aprovação imediata, Cartão de Crédito em até 12x e Boleto bancário.",
        fullAnswer:
          "Oferecemos opções modernas e seguras para sua comodidade na hora de pagar:",
        bullets: [
          "Pix: aprovação instantânea com desconto especial à vista. QR Code dinâmico e código Pix Copia e Cola direto no checkout.",
          "Cartão de Crédito: parcelamento em até 12x pelas bandeiras Visa, Mastercard, Elo, Hipercard e American Express.",
          "Boleto Bancário: opção tradicional para pagamento à vista em bancos ou lotéricas."
        ],
        actionLinks: [
          { label: "Ir para Minha Sacola", href: "/carrinho" }
        ],
        keywords: ["pagamento", "pix", "cartão", "crédito", "parcela", "parcelamento", "boleto", "desconto"]
      },
      {
        id: "como-pagar-com-pix",
        question: "Como funciona o pagamento com Pix e qual a validade do código?",
        shortAnswer: "Ao fechar a compra, copie o código Pix ou aponte a câmera do app do banco para o QR Code. A confirmação é instantânea.",
        fullAnswer:
          "O pagamento via Pix é o método mais ágil da loja. Ao finalizar sua compra no checkout, é gerado um QR Code e um código 'Pix Copia e Cola'.",
        bullets: [
          "Abra o aplicativo do seu banco ou carteira digital.",
          "Escolha a opção Pix > Copia e Cola ou Ler QR Code.",
          "Cole o código gerado e confirme o valor.",
          "Após o pagamento, nosso sistema atualiza o status do pedido automaticamente em segundos."
        ],
        keywords: ["como pagar pix", "qr code pix", "copia e cola", "pix rápido", "desconto pix"]
      },
      {
        id: "parcelamento-sem-juros",
        question: "Posso parcelar minhas compras no cartão de crédito?",
        shortAnswer: "Sim! Parcelamos em até 12 vezes no cartão, com parcelas sem juros conforme as condições da promoção vigente.",
        fullAnswer:
          "Na página de cada produto e no checkout você pode simular a quantidade de parcelas e o valor de cada mensalidade. As opções de parcelas disponíveis aparecem detalhadas antes da confirmação do pedido.",
        keywords: ["parcelar", "quantas vezes", "sem juros", "juros", "cartão de crédito parcelado"]
      },
      {
        id: "pagamento-recusado",
        question: "Meu pagamento no cartão de crédito não foi aprovado. O que fazer?",
        shortAnswer: "Confira limite, validade, dados digitados e endereço de fatura. Você também pode tentar pagar via Pix.",
        fullAnswer:
          "Recusas de cartão geralmente ocorrem por bloqueio temporário do banco emissor, limite insuficiente ou divergência no endereço de cobrança do titular. Recomendamos:",
        bullets: [
          "Verifique se o cartão está liberado para compras online no aplicativo do seu banco.",
          "Confira o código de segurança (CVV) e data de validade.",
          "Se preferir aprovação imediata sem depender do limite do cartão, escolha a opção Pix."
        ],
        keywords: ["recusado", "não aprovado", "cartão recusado", "erro no pagamento", "não autorizada"]
      }
    ]
  },
  {
    id: "entrega-frete",
    title: "Entrega, Frete e Prazos",
    icon: "map-pin",
    description: "Cálculo de CEP, prazos de envio, transportadoras parceiras e frete grátis.",
    questions: [
      {
        id: "como-calcular-frete",
        question: "Como calcular o valor do frete e o prazo de entrega?",
        shortAnswer: "Basta digitar seu CEP na página de qualquer produto ou na sacola de compras.",
        fullAnswer:
          "Você pode cotar o frete facilmente antes mesmo de fechar o pedido:",
        bullets: [
          "Na página do produto: digite seu CEP no campo 'Frete e prazo de entrega' e clique em 'Calcular'.",
          "No carrinho de compras: insira o CEP para comparar as opções de envio disponíveis (Correios PAC, Sedex e transportadoras privadas parceiras)."
        ],
        actionLinks: [
          { label: "Acessar Carrinho", href: "/carrinho" }
        ],
        keywords: ["frete", "prazo", "calcular cep", "valor do frete", "entrega", "correios", "sedex", "pac"]
      },
      {
        id: "regras-frete-gratis",
        question: "A Mistura Feminina oferece frete grátis?",
        shortAnswer: "Sim! Disponibilizamos frete grátis para compras que atingem o valor mínimo divulgado em nossa barra superior de benefícios.",
        fullAnswer:
          "Confira no topo do site a barra de benefícios atualizada com o valor da promoção ativa de frete grátis. Ao adicionar produtos ao carrinho e atingir o valor promocional, a opção de frete grátis será habilitada automaticamente na cotação.",
        keywords: ["frete grátis", "gratuito", "isenção frete", "promoção frete"]
      },
      {
        id: "tentativas-entrega",
        question: "Quantas tentativas de entrega são realizadas se eu não estiver no local?",
        shortAnswer: "Geralmente são realizadas até 3 tentativas de entrega no endereço cadastrado.",
        fullAnswer:
          "As transportadoras e os Correios costumam realizar até 3 tentativas consecutivas em dias úteis. Caso não haja ninguém para receber, a encomenda poderá ficar aguardando retirada na agência dos Correios mais próxima ou retornar ao nosso centro de distribuição. Mantenha seu endereço completo com número e complemento sempre atualizados.",
        keywords: ["tentativas", "não estava em casa", "retirada", "agência", "destinatário ausente"]
      }
    ]
  },
  {
    id: "trocas-devolucoes",
    title: "Trocas, Devoluções e Garantia",
    icon: "refresh-cw",
    description: "Orientações sobre prazo de arrependimento pelo CDC, troca de itens e suporte.",
    questions: [
      {
        id: "politica-trocas-devolucoes",
        question: "Como funciona a política de trocas e devoluções?",
        shortAnswer: "Você tem até 7 dias corridos após o recebimento para solicitar troca ou devolução por arrependimento, conforme o CDC.",
        fullAnswer:
          "Respeitamos integralmente o Código de Defesa do Consumidor. Caso o produto recebido não seja o que você esperava ou apresente alguma divergência, você pode solicitar a troca ou devolução:",
        bullets: [
          "Prazo: até 7 (sete) dias corridos a contar da data de entrega do pedido.",
          "Condições: o produto não deve apresentar sinais de uso, devendo estar em sua embalagem original, acompanhado de acessórios e manuais.",
          "Como solicitar: envie uma mensagem para o nosso suporte oficial com o número do seu pedido e fotos do item recebido."
        ],
        actionLinks: [
          { label: "Ler Política Completa", href: "/institucional/trocas-e-devolucoes" },
          { label: "Falar com Atendimento", href: "/contato" }
        ],
        keywords: ["troca", "devolução", "devolver", "arrependimento", "garantia", "estorno", "7 dias"]
      },
      {
        id: "produto-com-defeito",
        question: "Recebi um produto com defeito ou danificado no transporte. O que fazer?",
        shortAnswer: "Entre em contato conosco imediatamente com fotos e vídeo do produto e embalagem para agilizarmos a substituição sem custo.",
        fullAnswer:
          "Se algum produto chegar danificado ou apresentar avaria de fabricação, nossa equipe resolverá com prioridade. Envie pelo WhatsApp ou e-mail:",
        bullets: [
          "Número do pedido ou CPF do titular.",
          "Foto da etiqueta da caixa e do produto avariado.",
          "Breve descrição do ocorrido.",
          "Providenciaremos o reenvio sem custos ou o reembolso integral do item."
        ],
        keywords: ["quebrado", "defeito", "avariado", "estragado", "danificado", "troca com defeito"]
      },
      {
        id: "prazo-reembolso",
        question: "Qual o prazo para o reembolso ou estorno do valor?",
        shortAnswer: "Para Pix o estorno ocorre em até 1 dia útil após a conferência; para cartão, o prazo segue as regras da operadora (1 a 2 faturas).",
        fullAnswer:
          "Assim que a mercadoria devolvida chega à nossa central e passa pela conferência técnica das condições originais, o reembolso é solicitado de imediato:",
        bullets: [
          "Pagamento via Pix: o dinheiro é devolvido para a mesma chave/conta bancária utilizada na compra em até 1 dia útil.",
          "Pagamento via Cartão de Crédito: a notificação de cancelamento é enviada à operadora do cartão, e o crédito é lançado na fatura seguinte ou subsequente."
        ],
        keywords: ["reembolso", "estorno", "devolução dinheiro", "prazo estorno", "dinheiro de volta"]
      }
    ]
  },
  {
    id: "atacado",
    title: "Atacado para Profissionais",
    icon: "boxes",
    badge: "Vantagens",
    description: "Descontos progressivos automáticos por quantidade de peças para manicures e lojistas.",
    questions: [
      {
        id: "como-funciona-atacado",
        question: "Como funciona a compra no atacado da Mistura Feminina?",
        shortAnswer: "Oferecemos descontos progressivos por quantidade de peças adicionadas à sacola, calculados automaticamente.",
        fullAnswer:
          "Nosso programa de atacado foi criado para impulsionar manicures, nail designers, salões e revendedoras de cosméticos. Quanto mais unidades você adiciona ao carrinho, menor fica o valor unitário de cada peça.",
        bullets: [
          "Descontos automáticos aplicados diretamente na sacola de compras.",
          "Sem burocracia: não é obrigatório ter CNPJ para aproveitar as faixas de atacado.",
          "Produtos essenciais para bancada: esmaltes em gel, preparadores, tips, lixas, brocas e descartáveis."
        ],
        actionLinks: [
          { label: "Ver Tabela de Atacado Completa", href: "/atacado" }
        ],
        keywords: ["atacado", "desconto por quantidade", "revenda", "salão", "manicure atacado", "preço atacado"]
      },
      {
        id: "cnpj-obrigatorio-atacado",
        question: "Preciso ter CNPJ para comprar com preço de atacado?",
        shortAnswer: "Não! Qualquer cliente, profissional autônomo (CPF) ou pessoa jurídica (CNPJ) pode aproveitar as faixas de desconto por volume.",
        fullAnswer:
          "Entendemos a realidade de profissionais da beleza que atuam de forma autônoma. Por isso, os descontos por quantidade são válidos para compras realizadas tanto com CPF quanto com CNPJ.",
        actionLinks: [
          { label: "Acessar Catálogo de Atacado", href: "/atacado" }
        ],
        keywords: ["cnpj", "precisa de cnpj", "cpf atacado", "manicure autônoma", "sem cnpj"]
      }
    ]
  },
  {
    id: "minha-reposicao",
    title: "Lista de Reposição de Bancada",
    icon: "sparkles",
    badge: "Exclusivo MF",
    description: "Monte sua lista personalizada com os materiais que você mais usa e recompre com 1 clique.",
    questions: [
      {
        id: "o-que-e-minha-reposicao",
        question: "O que é e como funciona a Lista de Reposição?",
        shortAnswer: "É um recurso inteligente para você guardar os produtos de uso diário na sua bancada e recompra-los sem ter que pesquisar tudo de novo.",
        fullAnswer:
          "Sabemos que manicures e profissionais de unhas utilizam os mesmos preparadores, géis, lixas e descartáveis com frequência regular. A Lista de Reposição foi criada exclusivamente pela Mistura Feminina para facilitar sua rotina:",
        bullets: [
          "Ao navegar pela loja, clique no botão 'Adicionar à Lista de Reposição' em qualquer produto que você use com frequência.",
          "Quando seu material estiver acabando, acesse a página 'Minha Reposição'.",
          "Com apenas um clique no botão 'Adicionar Tudo ao Carrinho', todos os seus itens essenciais são colocados na sacola prontos para compra."
        ],
        actionLinks: [
          { label: "Acessar Minha Lista de Reposição", href: "/minha-reposicao" }
        ],
        keywords: ["reposição", "minha reposição", "lista rápida", "recompra", "materiais de bancada", "bancada manicure"]
      },
      {
        id: "salvar-itens-reposicao",
        question: "Como adicionar e remover itens da minha lista de reposição?",
        shortAnswer: "Basta clicar em 'Adicionar à Lista de Reposição' na página do item ou gerenciar pela página /minha-reposicao.",
        fullAnswer:
          "Sua lista fica salva de forma persistente no seu navegador e na sua conta. Você pode alterar as quantidades que costuma pedir a cada reposição e remover itens a qualquer momento com facilidade.",
        actionLinks: [
          { label: "Gerenciar Minha Reposição", href: "/minha-reposicao" }
        ],
        keywords: ["adicionar reposição", "salvar produtos", "favoritos de bancada", "remover reposição"]
      }
    ]
  },
  {
    id: "cadastro-acesso",
    title: "Cadastro, Conta e Senha",
    icon: "user",
    description: "Criação de cadastro rápido, recuperação de senha e gestão de endereços de entrega.",
    questions: [
      {
        id: "como-criar-conta",
        question: "Como criar minha conta na Mistura Feminina?",
        shortAnswer: "Acesse a tela de cadastro, preencha nome, e-mail e crie uma senha segura em menos de 1 minuto.",
        fullAnswer:
          "Com sua conta criada você pode acompanhar o status dos seus pedidos, salvar endereços para agilizar as próximas compras e manter sua lista de reposição sempre à mão:",
        bullets: [
          "Clique em 'Minha Conta' ou no link 'Cadastrar' no menu superior.",
          "Informe seus dados de contato básicos.",
          "Pronto! Sua conta estará pronta para utilização imediata."
        ],
        actionLinks: [
          { label: "Criar Conta Agora", href: "/cadastro" },
          { label: "Fazer Login", href: "/entrar" }
        ],
        keywords: ["criar conta", "cadastrar", "cadastro", "novo cliente", "fazer registro", "registro"]
      },
      {
        id: "recuperar-senha",
        question: "Esqueci minha senha de acesso. Como recuperar?",
        shortAnswer: "Na página de login, clique em 'Esqueceu a senha?' para receber as instruções de redefinição por e-mail.",
        fullAnswer:
          "Para sua segurança, a redefinição de senha é feita mediante envio de link seguro para o endereço de e-mail cadastrado em sua conta:",
        bullets: [
          "Acesse a página de login em /entrar.",
          "Clique no link 'Esqueceu a senha?'.",
          "Digite o e-mail cadastrado e envie.",
          "Abra sua caixa de entrada, clique no link de redefinição e escolha sua nova senha."
        ],
        actionLinks: [
          { label: "Recuperar Minha Senha", href: "/entrar" }
        ],
        keywords: ["esqueci a senha", "recuperar senha", "mudar senha", "redefinir senha", "não lembro a senha"]
      },
      {
        id: "alterar-enderecos",
        question: "Como atualizar meus dados ou endereço de entrega cadastrado?",
        shortAnswer: "Acesse a área 'Minha Conta' para visualizar e editar seus dados pessoais e endereços.",
        fullAnswer:
          "Dentro do painel Minha Conta você pode cadastrar múltiplos endereços (por exemplo, endereço do seu salão/espaço de atendimento e endereço residencial) e escolher o destino de entrega desejado durante o fechamento de cada compra.",
        actionLinks: [
          { label: "Ir para Minha Conta", href: "/minha-conta" }
        ],
        keywords: ["endereço", "mudar endereço", "atualizar dados", "trocar cep", "meus endereços"]
      }
    ]
  },
  {
    id: "falar-atendimento",
    title: "Falar com Atendente",
    icon: "message-circle",
    badge: "Humano",
    description: "Canais oficiais de suporte direto com a nossa equipe via WhatsApp e E-mail.",
    questions: [
      {
        id: "canais-atendimento-oficiais",
        question: "Como posso falar diretamente com a equipe da Mistura Feminina?",
        shortAnswer: "Você pode nos chamar pelo WhatsApp oficial ou nos enviar um e-mail. Respondemos com agilidade!",
        fullAnswer:
          "Se você tiver uma dúvida específica sobre aplicação de produtos, especificações técnicas de aparelhos ou precisar de apoio com um pedido em andamento, nossa equipe terá o maior prazer em te atender:",
        bullets: [
          "WhatsApp Oficial: atendimento rápido e humanizado para tirar dúvidas e receber suporte.",
          "E-mail: canal ideal para envio de comprovantes, relatórios de pedidos e solicitações formais.",
          "Horário de funcionamento: de Segunda a Sexta-feira, das 9h às 18h (exceto feriados)."
        ],
        actionLinks: [
          { label: "Fale Conosco na Loja", href: "/contato" }
        ],
        keywords: ["whatsapp", "contato", "atendimento", "falar com atendente", "email", "suporte", "humano", "telefone"]
      },
      {
        id: "horario-suporte",
        question: "Qual é o horário de funcionamento do atendimento?",
        shortAnswer: "Atendemos de segunda a sexta-feira, das 9h às 18h. Mensagens enviadas fora do horário são respondidas no próximo dia útil.",
        fullAnswer:
          "Nossa equipe de suporte atende nos dias úteis em horário comercial. Fique à vontade para deixar sua mensagem no WhatsApp a qualquer momento; responderemos assim que iniciarmos o expediente na ordem de chegada.",
        keywords: ["horário", "dias de atendimento", "quando atende", "aberto", "fechado", "expediente"]
      }
    ]
  }
];

export interface SearchFaqResult {
  topic: SupportTopic;
  question: SupportQuestion;
  matchScore: number;
}

export function searchSupportFaq(query: string): SearchFaqResult[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const results: SearchFaqResult[] = [];

  for (const topic of SELF_SERVICE_TOPICS) {
    for (const q of topic.questions) {
      let score = 0;
      const qText = `${q.question} ${q.shortAnswer} ${q.fullAnswer} ${q.keywords.join(" ")} ${topic.title}`.toLowerCase();

      // Frase exata
      if (qText.includes(normalized)) {
        score += 10;
      }

      // Tokens individuais
      for (const token of tokens) {
        if (q.question.toLowerCase().includes(token)) {
          score += 5;
        } else if (q.keywords.some((k) => k.toLowerCase().includes(token))) {
          score += 4;
        } else if (q.shortAnswer.toLowerCase().includes(token)) {
          score += 2;
        } else if (qText.includes(token)) {
          score += 1;
        }
      }

      if (score > 0) {
        results.push({ topic, question: q, matchScore: score });
      }
    }
  }

  return results.sort((a, b) => b.matchScore - a.matchScore);
}
