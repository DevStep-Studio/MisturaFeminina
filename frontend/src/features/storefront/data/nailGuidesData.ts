export interface NailGuideFaq {
  question: string;
  answer: string;
}

export interface NailGuideProduct {
  name: string;
  slug: string;
  badge: string;
  description: string;
}

export interface NailGuideRelatedCategory {
  name: string;
  slug: string;
}

export interface NailGuideArticle {
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  readTimeMinutes: number;
  datePublished: string;
  dateModified: string;
  category: string;
  categorySlug: string;
  tags: string[];
  image: string;
  contentHtml: string;
  faqs: NailGuideFaq[];
  relatedProducts: NailGuideProduct[];
  relatedCategories: NailGuideRelatedCategory[];
}

export const NAIL_GUIDES: NailGuideArticle[] = [
  {
    slug: "alongamento-unhas-em-gel-guia-completo",
    title: "Alongamento de Unhas em Gel: Diferenças entre Tip, Fibra e Molde F1",
    subtitle:
      "Tudo o que você precisa saber sobre as principais técnicas de extensão, materiais essenciais e durabilidade para manicures e clientes.",
    summary:
      "Descubra as vantagens e indicações do gel na tip, fibra de vidro e moldes F1 dual form, além do passo a passo seguro para preservar a saúde da lâmina natural.",
    readTimeMinutes: 7,
    datePublished: "2026-11-26",
    dateModified: "2026-11-26",
    category: "Alongamento e Estruturação",
    categorySlug: "alongamento-unhas",
    tags: ["Gel", "Molde F1", "Tips", "Nail Design", "Cuidados"],
    image: "/products/banner-alongamento-gel.jpg",
    contentHtml: `
      <p class="lead">O alongamento de unhas em gel tornou-se uma das técnicas mais requisitadas nos salões de beleza em todo o Brasil. Além de proporcionar unhas longas e impecáveis, a técnica oferece resistência para quem lida com unhas quebradiças ou tem o hábito de roer.</p>

      <h2>1. Como Funciona a Tecnologia do Gel Construtor</h2>
      <p>O gel para unhas é um composto acrílico pré-misturado (oligômeros e monômeros) fotoativado. Diferente dos esmaltes comuns que secam pela evaporação de solventes, o gel necessita do comprimento de onda emitido pelas lâmpadas LED/UV para polimerizar e endurecer.</p>
      <p>Géis de alta qualidade, como o <strong>Gel Any Lovy</strong>, contam com formulação autonivelante. Isso significa que o produto se distribui de maneira suave na lâmina, reduzindo a necessidade de lixamento pesado e garantindo uma curvatura natural com ponto de tensão uniforme.</p>

      <h2>2. As Três Principais Técnicas: Comparativo Prático</h2>
      <div class="table-responsive">
        <table class="guide-table">
          <thead>
            <tr>
              <th>Técnica</th>
              <th>Indicação Principal</th>
              <th>Vantagens</th>
              <th>Ponto de Atenção</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Moldes F1 (Dual Form)</strong></td>
              <td>Agilidade em mesa e alunas iniciantes</td>
              <td>Simetria perfeita, acabamento superior já liso e redução de 50% no tempo de lixamento</td>
              <td>Ajuste milimétrico do tamanho do molde na largura do leito</td>
            </tr>
            <tr>
              <td><strong>Tips Plásticas</strong></td>
              <td>Formatos clássicos (quadrada, stiletto, bailarina)</td>
              <td>Extensão imediata com curvatura padronizada</td>
              <td>Colagem cuidadosa sem bolhas e nivelamento do degrau</td>
            </tr>
            <tr>
              <td><strong>Fibra de Vidro</strong></td>
              <td>Unhas com formatos irregulares ou assimétricas</td>
              <td>Adaptação total ao formato natural da cliente e excelente durabilidade</td>
              <td>Exige destreza para selar bem os filamentos de fibra</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>3. Materiais Indispensáveis na Mesa de Atendimento</h2>
      <p>Para um alongamento seguro e com retenção superior a 20 dias, os seguintes itens compõem o kit básico profissional:</p>
      <ul>
        <li><strong>Higienizador Prep e Desidratador:</strong> removem impurezas e oleosidade sem agredir a lâmina.</li>
        <li><strong>Primer (com ou sem ácido):</strong> cria o ancoramento químico na queratina.</li>
        <li><strong>Gel Base Flexível:</strong> primeira camada protetora que impede o descolamento precoce.</li>
        <li><strong>Gel Construtor (Builder Gel):</strong> responsável pela estrutura, borda livre e curvatura.</li>
        <li><strong>Cabine LED/UV híbrida:</strong> com diodos bem distribuídos para cura completa em 60 a 120 segundos.</li>
        <li><strong>Lixa 100/180 e Bloco Polidor (Buff):</strong> para alinhamento das paredes laterais e polimento pré-finalização.</li>
        <li><strong>Top Coat Selante:</strong> confere o brilho espelhado final resistente a riscos.</li>
      </ul>

      <h2>4. Preparação da Lâmina: O Segredo da Retenção</h2>
      <p>A maior causa de descolamento de alongamentos não é o gel, mas sim a preparação deficiente. A regra de ouro é: <em>nunca desbaste excessivamente a unha natural</em>. Com o lado 180 da lixa (ou broca fina diamantada em baixa rotação), faça apenas movimentos leves em uma única direção para abrir os poros da queratina. Em seguida, limpe o pó com Prep e aplique os preparadores químicos respeitando o tempo de evaporação.</p>

      <h2>5. Manutenção e Remoção Segura</h2>
      <p>A manutenção deve ser recomendada a cada 20 a 25 dias, conforme o ritmo de crescimento da cliente. Jamais remova o alongamento puxando ou arrancando com os dentes: essa prática remove camadas vivas de queratina da unha natural. A remoção correta deve ser feita por desbaste técnico com brocas de cerâmica ou imersão em removedores específicos.</p>
    `,
    faqs: [
      {
        question: "Quanto tempo dura um alongamento de unhas em gel?",
        answer:
          "Com cuidados normais e manutenção periódica a cada 20 a 25 dias, o alongamento em gel pode ser mantido indefinidamente, renovando apenas a área de crescimento próxima à cutícula.",
      },
      {
        question: "Qual o melhor gel para iniciantes?",
        answer:
          "Géis autonivelantes de viscosidade média, como os da Any Lovy nas tonalidades Cover Nude e Natural, são os mais indicados porque não escorrem facilmente para a cutícula e facilitam a construção do ponto de tensão.",
      },
      {
        question: "Posso usar esmalte comum por cima do gel?",
        answer:
          "Sim! Sobre a estrutura selada com Top Coat, é possível aplicar esmaltes convencionais. Para retirar, utilize removedor sem acetona para não ressecar ou retirar o brilho do Top Coat.",
      },
    ],
    relatedProducts: [
      {
        name: "Gel Any Lovy (Natural, Cover Nude, Cover, Nude, Base)",
        slug: "gel-any-lovy",
        badge: "Mais Vendido",
        description: "Gel construtor autonivelante com 5 variações e alta durabilidade.",
      },
      {
        name: "Molde F1 Kaisa (Bailarina, Mandorla, Quadrada)",
        slug: "molde-f1-kaisa",
        badge: "Agilidade",
        description: "Moldes reutilizáveis para pré-moldagem rápida com curvatura perfeita.",
      },
      {
        name: "Unhas Postiças Bailarina Kaisa",
        slug: "unhas-posticas-bailarina-kaisa",
        badge: "Clássico",
        description: "Tips resistentes com encaixe preciso para extensão estruturada.",
      },
    ],
    relatedCategories: [
      { name: "Alongamento de Unhas", slug: "alongamento-unhas" },
      { name: "Géis para Unhas", slug: "gel" },
      { name: "Moldes F1 Dual Form", slug: "molde-f1" },
      { name: "Lixas e Niveladores", slug: "lixas" },
    ],
  },

  {
    slug: "esmaltacao-em-gel-passo-a-passo",
    title: "Esmaltação em Gel Passo a Passo: Preparação, Aplicação e Durabilidade",
    subtitle:
      "Aprenda o método correto para obter unhas esmaltadas com brilho espelhado que não descascam durante 15 a 21 dias.",
    summary:
      "Guia prático da ordem dos preparadores químicos, aplicação de camadas finas de cor e tempo de cura em cabine LED/UV.",
    readTimeMinutes: 6,
    datePublished: "2026-11-26",
    dateModified: "2026-11-26",
    category: "Esmaltação Profissional",
    categorySlug: "esmalte-em-gel",
    tags: ["Esmalte em Gel", "Cabine LED/UV", "Top Coat", "Manicure"],
    image: "/products/banner-esmaltacao-gel.jpg",
    contentHtml: `
      <p class="lead">A esmaltação em gel conquistou clientes que desejam sair do salão com unhas 100% secas, sem o receio de borrar na bolsa ou no sapato, e com cor vibrante durante semanas.</p>

      <h2>1. A Ordem Exata dos Produtos</h2>
      <p>O segredo de uma esmaltação duradoura reside no respeito rigoroso à sequência físico-química dos produtos:</p>
      <ol>
        <li><strong>Higienização com Prep:</strong> limpa a pele e a lâmina, eliminando microrganismos.</li>
        <li><strong>Lixamento Superficial Suave:</strong> feito com bloco polidor (Buff) ou lixa 180 para retirar o brilho oleoso natural.</li>
        <li><strong>Desidratador / Regulador de pH:</strong> retira a umidade residual em segundos ao ar livre.</li>
        <li><strong>Primer Adesivador:</strong> cria uma película microscópica de retenção (como uma fita dupla face).</li>
        <li><strong>Base em Gel:</strong> camada protetora fina e flexível que polimeriza na cabine em 30 a 60 segundos.</li>
        <li><strong>Primeira Camada de Cor:</strong> aplicada em filme fino e uniforme, sem encostar na pele (cura de 60s).</li>
        <li><strong>Segunda Camada de Cor:</strong> fecha a cobertura e uniformiza a tonalidade (cura de 60s).</li>
        <li><strong>Top Coat (Finalizador):</strong> sela a cor, previne riscos e confere o brilho espelhado final (cura de 60 a 90s).</li>
      </ol>

      <h2>2. Por que o Esmalte em Gel Enruga na Cabine?</h2>
      <p>Um dos erros mais comuns de iniciantes é aplicar camadas espessas na tentativa de cobrir tudo de primeira. A luz UV/LED não consegue transpassar grandes volumes de pigmento escuro; o resultado é que a parte superior endurece enquanto a inferior fica líquida, causando enrugamento imediato. A regra é: <em>duas ou três camadas extremamente finas são sempre melhores que uma camada grossa</em>.</p>

      <h2>3. Distância da Cutícula: O Espaço de Segurança</h2>
      <p>Mantenha sempre uma margem de aproximadamente 1 milímetro entre o esmalte em gel e a cutícula. Se o gel encostar na pele ou na dobra periungueal, a oleosidade natural do corpo entrará por baixo da borda em poucos dias, gerando bolhas e descolamento precoce.</p>

      <h2>4. Selagem da Borda Livre</h2>
      <p>A borda livre (a ponta da unha) deve receber uma pincelada sutil e transversal de base, esmalte e Top Coat. Essa selagem encapsula a ponta e impede que atritos diários — como digitação em teclados e celulares — desgastem a extremidade da esmaltação.</p>
    `,
    faqs: [
      {
        question: "Preciso tirar a goma do Top Coat?",
        answer:
          "Depende do produto. Top coats modernos (No Wipe) saem da cabine 100% secos e sem resíduo pegajoso. Se o seu Top Coat apresentar dispersão (goma), limpe suavemente com algodão prensado embebido em Prep após o esfriamento da unha.",
      },
      {
        question: "Por que as unhas em gel parecem 'queimar' nos primeiros segundos da cabine?",
        answer:
          "Isso ocorre pela reação exotérmica das moléculas de acrilato se unindo. Basta retirar a mão da cabine por 3 segundos assim que sentir o calor e recolocá-la em seguida, ou utilizar a função 'Low Heat' (modo suave) da cabine.",
      },
    ],
    relatedProducts: [
      {
        name: "Esmalte em Gel Alta Duração 15ml",
        slug: "esmalte-em-gel-alta-duracao-15ml",
        badge: "Destaque",
        description: "Pigmentação uniforme com secagem rápida em cabines LED/UV.",
      },
      {
        name: "Lixa Buff e Mini Buff Bloco Polidor",
        slug: "lixa-buff",
        badge: "Acabamento",
        description: "Nivelamento delicado para garantir a fixação da base sem ranhuras profundas.",
      },
    ],
    relatedCategories: [
      { name: "Esmalte em Gel", slug: "esmalte-em-gel" },
      { name: "Cabines e Equipamentos", slug: "maquinarios" },
      { name: "Cuidados e Preparadores", slug: "cuidados-unhas" },
    ],
  },

  {
    slug: "como-escolher-lixas-e-brocas",
    title: "Como Escolher a Gramatura de Lixas e os Tipos de Brocas para Unhas",
    subtitle:
      "Entenda o significado dos números de abrasividade e selecione o acessório certo para desbaste, curvatura e cutícula.",
    summary:
      "Guia técnico sobre numerações de lixas manuais (100/180, buff) e características de brocas de cerâmica, tungstênio e diamantadas.",
    readTimeMinutes: 5,
    datePublished: "2026-11-26",
    dateModified: "2026-11-26",
    category: "Ferramentas e Acessórios",
    categorySlug: "lixas",
    tags: ["Lixas", "Brocas", "Abrasividade", "Cuticulagem", "Biossegurança"],
    image: "/products/banner-lixas-brocas.jpg",
    contentHtml: `
      <p class="lead">Trabalhar com lixas e brocas inadequadas atrasa o atendimento e pode machucar a lâmina ungueal da cliente. Compreender a escala de granulação e a função de cada acessório é fundamental para qualquer profissional.</p>

      <h2>1. O que Significam os Números nas Lixas de Unha?</h2>
      <p>A numeração impressa nas lixas indica a densidade de grânulos abrasivos contidos em uma polegada quadrada. A regra básica é simples:</p>
      <ul>
        <li><strong>Grão 80 a 100 (Muito Áspero):</strong> indicado exclusivamente para redução de tamanho de materiais artificiais rígidos (acrílico, poligel e gel espesso). <em>Nunca utilize sobre a unha natural.</em></li>
        <li><strong>Grão 150 a 180 (Médio):</strong> ideal para modelar as laterais do alongamento, definir o ponto de tensão e desgastar suavemente o brilho da unha natural na preparação.</li>
        <li><strong>Grão 220 a 240 (Fino):</strong> recomendado para encurtar e arredondar unhas naturais sem abrir as camadas de queratina.</li>
        <li><strong>Grão 400 a 600 (Bloco Polidor / Buff):</strong> fecha as microfissuras da superfície artificial antes do Top Coat, garantindo que o selante não fique opaco ou com riscos visíveis.</li>
      </ul>

      <h2>2. Formatos de Lixas e Suas Funções</h2>
      <p>Além da espessura dos grãos, o formato da lixa proporciona ergonomia específica:</p>
      <ul>
        <li><strong>Lixa Caixão (Retangular):</strong> bordas paralelas e retas facilitam o alinhamento da borda livre em formatos quadrados e bailarinas.</li>
        <li><strong>Lixa Banana (Curva):</strong> seu formato anatômico semicircular acompanha com perfeição o contorno da cutícula sem encostar na pele circundante.</li>
        <li><strong>Lixa Losango / Meia-Lua:</strong> combina um lado reto com um lado curvo, proporcionando versatilidade em um único acessório.</li>
      </ul>

      <h2>3. Brocas de Cerâmica vs. Tungstênio vs. Diamantadas</h2>
      <p>Nos micromotores elétricos, três famílias de brocas dominam as bancadas:</p>
      <ol>
        <li><strong>Brocas de Cerâmica:</strong> feitas de zircônia, geram baixíssima fricção térmica (não esquentam a unha) e são perfeitas para manutenção e remoção suave de esmalte em gel e géis leves.</li>
        <li><strong>Brocas de Tungstênio:</strong> possuem corte de navalha extremamente durável, indicadas para desbaste rápido de excesso de produto na curvatura e nivelamento inferior da unha.</li>
        <li><strong>Brocas Diamantadas:</strong> com grânulos microscópicos, são as únicas recomendadas para a técnica de cuticulagem russa a seco, limpando a eponíquia e levantando a cutícula com total segurança.</li>
      </ol>
    `,
    faqs: [
      {
        question: "De quanto em quanto tempo devo trocar a lixa?",
        answer:
          "Lixas manuais acumulam queratina e perdem o poder de corte após poucos atendimentos. Por razões de biossegurança e higiene, o ideal é utilizar lixas descartáveis individuais por cliente ou higienizar blocos laváveis com desinfetante específico.",
      },
      {
        question: "Qual o sentido correto de rotação do motor (F e R)?",
        answer:
          "O botão Forward (F) gira no sentido horário, ideal para profissionais destras trabalhando da direita para a esquerda. O Reverse (R) gira no sentido anti-horário, permitindo que profissionais canhotas ou trocas de ângulo não empurrem a broca contra o sentido de corte.",
      },
    ],
    relatedProducts: [
      {
        name: "Lixa OPI 100/180 (Banana, Caixão e Reta)",
        slug: "lixa-opi-100-180",
        badge: "Padrão Ouro",
        description: "Abrasividade precisa para desbaste e nivelamento de unhas em gel.",
      },
      {
        name: "Porta-Acetona com Válvula Dosadora",
        slug: "porta-acetona",
        badge: "Praticidade",
        description: "Economia e segurança evitando evaporação e derramamento na bancada.",
      },
    ],
    relatedCategories: [
      { name: "Lixas Manuais", slug: "lixas" },
      { name: "Brocas Profissionais", slug: "brocas" },
      { name: "Acessórios de Mesa", slug: "acessorios" },
    ],
  },

  {
    slug: "cuidados-e-higiene-de-alicates-e-cutelaria",
    title: "Cuidados, Afiação e Conservação de Alicates de Cutícula e Espátulas",
    subtitle:
      "Como manter o corte perfeito de alicates em aço inox, normas de esterilização e proteção do investimento das manicures.",
    summary:
      "Saiba como cuidar de alicates Mundial (522, 722, 777), uso correto de espátulas para afastar cutículas e prevenção de quedas e oxidação.",
    readTimeMinutes: 5,
    datePublished: "2026-11-26",
    dateModified: "2026-11-26",
    category: "Cutelaria e Biossegurança",
    categorySlug: "alicates-e-cortadores",
    tags: ["Alicates", "Mundial 722", "Esterilização", "Cutelaria", "Inox"],
    image: "/products/banner-cutelaria.jpg",
    contentHtml: `
      <p class="lead">O alicate de cutícula é a extensão das mãos da manicure. Um instrumento de corte afiado e bem cuidado proporciona um contorno limpo sem repuxar a pele, reduzindo pela metade o tempo de trabalho e garantindo o bem-estar da cliente.</p>

      <h2>1. Aço Carbono vs. Aço Inoxidável Cirúrgico</h2>
      <p>Ao selecionar um alicate profissional, o material de fabricação determina sua vida útil e compatibilidade com métodos de esterilização:</p>
      <ul>
        <li><strong>Aço Carbono Niquelado (ex: Mundial Classic 522):</strong> possui excelente pega e custo acessível. Contudo, oxida com facilidade se for colocado em autoclave sem secagem imediata. Indicado para uso individual ou esterilização em estufa regulada.</li>
        <li><strong>Aço Inoxidável (ex: Mundial Professional 722 e 777):</strong> forjado em aço inox de grau cirúrgico, pode ser esterilizado repetidamente em autoclave e estufa sem perder o brilho ou sofrer corrosão. O modelo 777 conta ainda com mola especial redonda e anatômica para alívio de esforço repetitivo (LER/DORT).</li>
      </ul>

      <h2>2. O Papel Crucial da Espátula de Inox</h2>
      <p>Muitos cortes indesejados acontecem porque a manicure tenta levantar a cutícula diretamente com o bico do alicate. O protocolo correto recomenda sempre o uso prévio de uma <strong>Espátula para Cutícula em Inox</strong> com ponta chanfrada:</p>
      <ol>
        <li>Embeba a cutícula com emoliente ou água morna.</li>
        <li>Com a espátula inclinada em 45 graus, empurre delicadamente a eponíquia para trás, descolando o excesso de pele morta aderida à lâmina.</li>
        <li>Utilize a lâmina curva (cureta) da outra extremidade da espátula para retirar as impurezas dos cantos.</li>
        <li>Somente então passe o alicate, cortando unicamente a sobra de pele que foi previamente afastada.</li>
      </ol>

      <h2>3. Dicas de Ouro para Preservar a Afiação</h2>
      <p>Manter o fio do alicate intacto por meses exige pequenos hábitos de bancada:</p>
      <ul>
        <li><strong>Nunca deixe o alicate solto na gaveta:</strong> o contato com outras ferramentas de metal amassa o fio milimétrico. Utilize sempre a ponteira de proteção de silicone ou plástico rígido.</li>
        <li><strong>Evite quedas:</strong> uma única queda com o bico para baixo em piso cerâmico é suficiente para entortar a ponta ou lascar o corte.</li>
        <li><strong>Lubrificação periódica da mola:</strong> após a secagem e antes do armazenamento, aplique uma microgota de óleo mineral no rebite central para manter o movimento suave e sem atrito.</li>
      </ul>
    `,
    faqs: [
      {
        question: "Posso esterilizar alicates de cutícula com água fervente?",
        answer:
          "A fervura não atinge a temperatura e pressão necessárias para destruir esporos bacterianos e vírus. Para ambientes comerciais, a ANVISA exige o uso de autoclave a vapor sob pressão ou estufa de calor seco com monitoramento de tempo e temperatura.",
      },
      {
        question: "Quantas vezes posso afiar um alicate Mundial?",
        answer:
          "Alicates de aço inoxidável como o Mundial 722 permitem de 10 a 15 afiações profissionais ao longo da sua vida útil, mantendo espessura estrutural segura nas lâminas.",
      },
    ],
    relatedProducts: [
      {
        name: "Alicate de Cutícula Mundial Classic 522",
        slug: "alicate-cuticula-mundial-522",
        badge: "Tradicional",
        description: "Aço carbono niquelado com corte preciso e mola resistente.",
      },
      {
        name: "Espátula para Cutícula em Inox",
        slug: "espatula-cuticula-inox",
        badge: "Indispensável",
        description: "Ponta chanfrada e raspador para afastamento seguro da cutícula.",
      },
      {
        name: "Palitos para Unhas com Ponta e Chanfro",
        slug: "palitos-unhas-inoven",
        badge: "Higiene",
        description: "Descartáveis de madeira de alta qualidade para contorno e limpeza de esmalte.",
      },
    ],
    relatedCategories: [
      { name: "Alicates e Cortadores", slug: "alicates-e-cortadores" },
      { name: "Bisturis e Espátulas", slug: "bisturi-espatulas" },
      { name: "Acessórios e Descartáveis", slug: "acessorios" },
    ],
  },
];

export function getNailGuideBySlug(slug: string): NailGuideArticle | null {
  return NAIL_GUIDES.find((g) => g.slug === slug) ?? null;
}
