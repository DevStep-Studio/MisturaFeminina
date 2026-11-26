export interface CategorySeoFaq {
  question: string;
  answer: string;
}

export interface CategorySeoTip {
  title: string;
  description: string;
}

export interface CategoryRelatedLink {
  label: string;
  path: string;
  badge?: string;
}

export interface CategorySeoData {
  slug: string;
  heading: string;
  intro: string;
  description: string;
  tips: CategorySeoTip[];
  faqs: CategorySeoFaq[];
  relatedCategories: CategoryRelatedLink[];
  relatedGuide?: {
    title: string;
    slug: string;
    summary: string;
  };
}

export const CATEGORY_SEO_MAP: Record<string, CategorySeoData> = {
  "alongamento-unhas": {
    slug: "alongamento-unhas",
    heading: "Guia de Alongamento de Unhas: Técnicas, Géis e Materiais Profissionais",
    intro:
      "O alongamento de unhas em gel e técnicas estruturadas conquistaram o mercado profissional de beleza por oferecer resistência, curvatura anatômica e acabamento natural.",
    description:
      "Na Mistura Feminina, selecionamos os materiais essenciais para manicures e nail designers: géis construtores autonivelantes (como Any Lovy), moldes F1 dual form para pré-moldagem rápida, tips resistentes e pincéis específicos. Cada técnica atende a uma necessidade: os moldes F1 agilizam o atendimento mantendo a curvatura C uniforme; as tips oferecem base clássica para formatos amendoados e bailarinas; e o gel moldado permite reconstrução personalizada de unhas roídas ou irregulares.",
    tips: [
      {
        title: "Preparação Correta",
        description:
          "A adesão do gel depende de uma lâmina limpa, higienizada com Prep e desidratador, sem oleosidade residual e sem lixamento excessivo.",
      },
      {
        title: "Controle de Produto",
        description:
          "Aplique o gel em camadas finas e estruturadas, evitando encostar na pele e na cutícula para prevenir infiltrações e descolamentos.",
      },
      {
        title: "Tempo de Cabine",
        description:
          "Respeite o tempo de pré-curvatura (geralmente 5 a 10 segundos) e a cura total de 60 a 120 segundos conforme a potência da sua cabine LED/UV.",
      },
    ],
    faqs: [
      {
        question: "Qual a diferença entre gel construtor e gel base?",
        answer:
          "O gel base tem maior flexibilidade e serve para criar a camada de aderência entre a unha natural desidratada e o alongamento. Já o gel construtor (builder gel) possui densidade estrutural para formar o ponto de tensão, o comprimento e a curvatura.",
      },
      {
        question: "Por que usar moldes F1 em vez de tips convencionais?",
        answer:
          "Os moldes F1 (Dual Forms) são reutilizáveis e reduzem o tempo de lixamento em até 50%, pois entregam a superfície lisa e a curvatura pronta diretamente após a secagem na cabine.",
      },
      {
        question: "O alongamento danifica as unhas naturais?",
        answer:
          "O alongamento não enfraquece a lâmina se a preparação for suave (apenas tirando o brilho com lixa 100/180) e a remoção for realizada de forma técnica, sem arrancar o produto à força.",
      },
    ],
    relatedCategories: [
      { label: "Géis Construtores", path: "/categoria/gel", badge: "Essencial" },
      { label: "Moldes F1 Dual Form", path: "/categoria/molde-f1" },
      { label: "Tips e Unhas Postiças", path: "/categoria/tips" },
      { label: "Preparadores (Prep e Primer)", path: "/categoria/cuidados-unhas" },
      { label: "Cabines LED/UV", path: "/categoria/maquinarios" },
    ],
    relatedGuide: {
      title: "Guia Completo de Alongamento de Unhas em Gel",
      slug: "alongamento-unhas-em-gel-guia-completo",
      summary:
        "Entenda o comparativo detalhado entre Tip, Fibra e Molde F1, materiais necessários e dicas de durabilidade.",
    },
  },

  gel: {
    slug: "gel",
    heading: "Géis para Alongamento e Estruturação de Unhas",
    intro:
      "Géis construtores, géis base e géis autonivelantes formulados para resistência mecânica e flexibilidade balanceada.",
    description:
      "A linha de géis da Mistura Feminina inclui formulações profissionais com alta estabilidade de cor, tons de camuflagem (Cover, Nude, Natural e Pink) e opções transparentes (Clear). Com tecnologia autonivelante, nossos géis facilitam o controle de produto no ponto de tensão e diminuem a necessidade de lixamento agressivo pós-cura.",
    tips: [
      {
        title: "Curvatura Perfeita",
        description:
          "Faça uma pré-cura rápida de 8 a 15 segundos para pinçar a curvatura C antes de retornar à cabine para a cura final.",
      },
      {
        title: "Camuflagem de Leito",
        description:
          "Tons como Cover Nude e Nude disfarçam irregularidades da unha natural e criam um fundo perfeito para francesinhas e nail arts.",
      },
    ],
    faqs: [
      {
        question: "O gel aquece muito na cabine?",
        answer:
          "A sensação de calor decorre da reação exotérmica de polimerização dos monômeros. Em clientes sensíveis, oriente a colocar a mão na cabine em modo gradual (Low Heat) de potência reduzida nos primeiros segundos.",
      },
    ],
    relatedCategories: [
      { label: "Pincéis para Gel", path: "/categoria/acessorios" },
      { label: "Lixas e Niveladores", path: "/categoria/lixas" },
      { label: "Top Coat Finalizador", path: "/categoria/top-coat" },
    ],
  },

  "esmalte-em-gel": {
    slug: "esmalte-em-gel",
    heading: "Esmalte em Gel: Brilho Espelhado e Longa Duração para Cabine",
    intro:
      "Esmaltes com secagem exclusiva em cabine LED/UV, desenvolvidos para durar de 15 a 21 dias sem descascar.",
    description:
      "A esmaltação em gel revolucionou os cuidados com as mãos por oferecer secagem imediata ao sair da cabine, pigmentação uniforme em poucas camadas e brilho duradouro. Na Mistura Feminina, você encontra esmaltes em gel formulados para aderência segura, compatíveis com unhas naturais e alongamentos.",
    tips: [
      {
        title: "Camadas Bem Finas",
        description:
          "Sempre passe camadas finas de esmalte em gel. Camadas grossas impedem a luz da cabine de penetrar no fundo, causando enrugamento do esmalte.",
      },
      {
        title: "Selagem da Borda Livre",
        description:
          "Pincele suavemente a ponta da unha na última camada de cor e no Top Coat para selar a borda e evitar descascamento precoce.",
      },
    ],
    faqs: [
      {
        question: "Esmalte em gel seca ao ar livre?",
        answer:
          "Não. O esmalte em gel contém fotoiniciadores que só polimerizam e secam sob o comprimento de onda emitido pelas lâmpadas LED/UV.",
      },
      {
        question: "Como retirar o esmalte em gel sem danificar a unha?",
        answer:
          "Quebre o selamento do Top Coat com lixa suave e utilize removedor de esmalte em gel adequado com algodão prensado ou broca de cerâmica em baixa rotação, sem raspar com força.",
      },
    ],
    relatedCategories: [
      { label: "Cabines de Secagem", path: "/categoria/maquinarios", badge: "Indispensável" },
      { label: "Top Coat e Finalizadores", path: "/categoria/top-coat" },
      { label: "Preparadores e Primers", path: "/categoria/cuidados-unhas" },
    ],
    relatedGuide: {
      title: "Esmaltação em Gel Passo a Passo",
      slug: "esmaltacao-em-gel-passo-a-passo",
      summary:
        "Aprenda o passo a passo da preparação da lâmina, aplicação correta de camadas finas e cura perfeita na cabine.",
    },
  },

  lixas: {
    slug: "lixas",
    heading: "Lixas para Unhas: Gramaturas 100/180, Formatos Caixão, Banana e Buff",
    intro:
      "Ferramentas essenciais para modelar, alinhar simetria e dar polimento com controle preciso de abrasividade.",
    description:
      "A escolha da lixa correta é decisiva para um resultado profissional. A gramatura 100/180 é o padrão ouro na mesa da manicure: o lado 100 (mais áspero) serve para desbaste e redução de comprimento em géis e acrílicos, enquanto o lado 180 (médio) nivela a superfície e aproxima a curvatura. Já as lixas bloco polidor (Buff e Mini Buff) fecham os poros da unha artificial antes da selagem com Top Coat.",
    tips: [
      {
        title: "Uso em Unhas Naturais",
        description:
          "Em unhas naturais, use sempre gramaturas mais suaves (180 a 240) em movimentos unidirecionais para não abrir as escamas da queratina.",
      },
      {
        title: "Diferença de Formatos",
        description:
          "A lixa caixão oferece bordas retas perfeitas para paredes laterais; a lixa banana contorna a área da cutícula com ergonomia e menor risco de ferir a pele.",
      },
    ],
    faqs: [
      {
        question: "O que significam os números 100/180 na lixa?",
        answer:
          "Os números indicam a quantidade de grãos abrasivos por polegada quadrada. Quanto menor o número, mais áspera e agressiva é a lixa; quanto maior o número, mais fina e suave.",
      },
    ],
    relatedCategories: [
      { label: "Brocas de Cerâmica e Tungstênio", path: "/categoria/brocas" },
      { label: "Alongamento e Géis", path: "/categoria/alongamento-unhas" },
      { label: "Acessórios e Cutelaria", path: "/categoria/acessorios" },
    ],
    relatedGuide: {
      title: "Como Escolher a Gramatura de Lixas e Brocas",
      slug: "como-escolher-lixas-e-brocas",
      summary:
        "Guia prático sobre numerações de lixas, tipos de brocas e como trabalhar com segurança na mesa de atendimento.",
    },
  },

  brocas: {
    slug: "brocas",
    heading: "Brocas de Cerâmica e Tungstênio para Micromotores de Unhas",
    intro:
      "Acessórios rotativos de alta precisão para cuticulagem russa, remoção rápida e acabamento milimétrico.",
    description:
      "As brocas profissionais garantem agilidade na rotina de manicures e nail designers. As brocas de cerâmica dissipam o calor com eficiência durante a manutenção de géis; as brocas de tungstênio possuem corte afiado para remoção e desbaste estruturado; e as brocas diamantadas menores são ideais para o levantamento e limpeza da cutícula a seco.",
    tips: [
      {
        title: "Controle de Rotação",
        description:
          "Ajuste a rotação (RPM) conforme a broca: brocas de remoção em velocidade média/alta com toque suave; brocas de cutícula em baixa rotação para segurança da pele.",
      },
      {
        title: "Higienização Após o Uso",
        description:
          "Retire o pó residual com escovinha de aço ou cerdas duras antes da imersão em desinfetante hospitalar ou esterilização.",
      },
    ],
    faqs: [
      {
        question: "Broca de cerâmica esquenta na unha?",
        answer:
          "As brocas de cerâmica esquentam consideravelmente menos que as brocas de aço comum, mas é fundamental manter a broca em movimento constante sem pressionar um único ponto.",
      },
    ],
    relatedCategories: [
      { label: "Lixas Manuais e Blocos", path: "/categoria/lixas" },
      { label: "Coletores de Pó", path: "/categoria/maquinarios" },
      { label: "Alicates e Espátulas", path: "/categoria/alicates-e-cortadores" },
    ],
  },

  "alicates-e-cortadores": {
    slug: "alicates-e-cortadores",
    heading: "Alicates de Cutícula Mundial e Cutelaria de Alta Precisão",
    intro:
      "Alicates em aço inoxidável e carbono com afiação de fábrica, ergonomia balanceada e durabilidade.",
    description:
      "Na cutelaria profissional, o corte preciso é sinônimo de segurança e agilidade. Disponibilizamos os principais modelos da Mundial (como o Classic 522 e os profissionais 722 e 777), projetados para corte limpo sem mastigar a pele. O aço inox permite processos rigorosos de esterilização em autoclave e estufa mantendo o fio afiado por muito mais tempo.",
    tips: [
      {
        title: "Proteção da Ponta",
        description:
          "Sempre guarde seu alicate com a ponteira de silicone protetora para evitar quedas que entortem ou lasquem as lâminas.",
      },
      {
        title: "Uso da Espátula Inox",
        description:
          "Antes de cortar, afaste suavemente a cutícula com espátula apropriada. Corte apenas a pele solta e o excesso, preservando a proteção natural da lâmina.",
      },
    ],
    faqs: [
      {
        question: "Qual a diferença entre o alicate Mundial 522 e o 722?",
        answer:
          "O Mundial 522 é fabricado em aço carbono niquelado, muito popular para uso doméstico ou inicial. O Mundial 722 é feito em aço inoxidável cirúrgico, suporta autoclave sem oxidar e mantém a afiação por períodos prolongados de atendimento contínuo.",
      },
    ],
    relatedCategories: [
      { label: "Bisturis e Espátulas Inox", path: "/categoria/bisturi-espatulas" },
      { label: "Porta-Acetona e Algodão", path: "/categoria/acessorios" },
      { label: "Cuidados e Higiene", path: "/categoria/cuidados-unhas" },
    ],
    relatedGuide: {
      title: "Cuidados, Afiação e Conservação de Alicates",
      slug: "cuidados-e-higiene-de-alicates-e-cutelaria",
      summary:
        "Dicas essenciais para prolongar a vida útil de alicates em aço inox, higienização correta e proteção de corte.",
    },
  },

  "cuidados-unhas": {
    slug: "cuidados-unhas",
    heading: "Preparadores e Cuidados: Prep, Desidratador, Primer e Óleo Nutritivo",
    intro:
      "Produtos químicos essenciais para higienizar, desidratar, promover adesão química e finalizar unhas.",
    description:
      "A durabilidade de qualquer esmaltação ou alongamento começa na química da preparação. A combinação de Prep (antisséptico e higienizador), Desidratador (regulador de pH) e Primer (promotor de adesão) elimina a oleosidade e prepara as microrranhuras da queratina para receber o gel ou a base. Na finalização, óleos nutritivos restauram a hidratação da dobra periungueal.",
    tips: [
      {
        title: "Primer Ácido vs Sem Ácido",
        description:
          "O Primer ácido é indicado para clientes com unhas muito oleosas ou hiperidrose nas mãos. O Primer não ácido (adesivador) funciona como fita dupla face e é seguro para unhas normais a secas.",
      },
      {
        title: "Secagem do Prep",
        description:
          "Deixe o Prep e o Desidratador secarem totalmente ao ar antes de aplicar o Primer. A lâmina deve ficar esbranquiçada e completamente fosca.",
      },
    ],
    faqs: [
      {
        question: "O Primer precisa ir para a cabine?",
        answer:
          "A grande maioria dos primers e desidratadores seca 100% ao ar em 30 a 60 segundos. Sempre consulte a instrução do fabricante na embalagem.",
      },
    ],
    relatedCategories: [
      { label: "Géis e Alongamento", path: "/categoria/alongamento-unhas" },
      { label: "Esmaltes em Gel", path: "/categoria/esmalte-em-gel" },
      { label: "Top Coat e Brilho", path: "/categoria/top-coat" },
    ],
  },

  maquinarios: {
    slug: "maquinarios",
    heading: "Cabines LED/UV, Motores de Bancada e Coletores de Pó para Unhas",
    intro:
      "Equipamentos elétricos projetados para proporcionar velocidade, segurança e ergonomia na mesa da manicure.",
    description:
      "A infraestrutura de trabalho impacta diretamente a saúde postural da profissional e o conforto da cliente. Cabines híbridas LED/UV com distribuição uniforme de diodos garantem cura total sem pontos cegos; micromotores de bancada permitem lixamento técnico com controle fino de rotação; e coletores de pó aspiram as micropartículas suspensas no ar geradas no desbaste do gel.",
    tips: [
      {
        title: "Posicionamento na Cabine",
        description:
          "Oriente a cliente a posicionar o polegar reto no centro da cabine para que os diodos laterais curem as bordas laterais por completo.",
      },
      {
        title: "Manutenção do Coletor",
        description:
          "Limpe ou substitua o filtro do coletor de pó regularmente para manter o fluxo de ar desobstruído e proteger a saúde respiratória no ambiente de trabalho.",
      },
    ],
    faqs: [
      {
        question: "Qual a potência ideal para uma cabine de unhas?",
        answer:
          "Cabines a partir de 48W com tecnologia híbrida LED/UV (comprimento de onda de 365nm a 405nm) atendem perfeitamente à cura de qualquer gel ou esmalte profissional do mercado.",
      },
    ],
    relatedCategories: [
      { label: "Alongamento em Gel", path: "/categoria/alongamento-unhas" },
      { label: "Esmaltes para Cabine", path: "/categoria/esmalte-em-gel" },
      { label: "Brocas e Ponteiras", path: "/categoria/brocas" },
    ],
  },
};

export function getCategorySeoContent(slug: string): CategorySeoData | null {
  return CATEGORY_SEO_MAP[slug] ?? null;
}
