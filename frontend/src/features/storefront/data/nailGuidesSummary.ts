export interface NailGuideSummary {
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  readTimeMinutes: number;
  category: string;
  categorySlug: string;
  tags: string[];
}

export const NAIL_GUIDES_SUMMARY: NailGuideSummary[] = [
  {
    slug: "alongamento-unhas-em-gel-guia-completo",
    title: "Alongamento de Unhas em Gel: Diferenças entre Tip, Fibra e Molde F1",
    subtitle:
      "Tudo o que você precisa saber sobre as principais técnicas de extensão, materiais essenciais e durabilidade para manicures e clientes.",
    summary:
      "Descubra as vantagens e indicações do gel na tip, fibra de vidro e moldes F1 dual form, além do passo a passo seguro para preservar a saúde da lâmina natural.",
    readTimeMinutes: 7,
    category: "Alongamento e Estruturação",
    categorySlug: "alongamento-unhas",
    tags: ["Gel", "Molde F1", "Tips", "Nail Design", "Cuidados"],
  },
  {
    slug: "esmalte-em-gel-durabilidade-passo-a-passo",
    title: "Esmaltação em Gel Perfeita: Segredos de Preparação e Durabilidade de 21 Dias",
    subtitle:
      "Diga adeus a descolamentos e lascas. Conheça a sequência de preparadores e técnicas de selagem profissional.",
    summary:
      "Aprenda a função do prep, desidratador e primers, a importância da limpeza da cutícula e o tempo de cura correto na cabine LED/UV para unhas intactas.",
    readTimeMinutes: 6,
    category: "Esmaltação e Finalização",
    categorySlug: "esmalte-em-gel",
    tags: ["Esmalte em Gel", "Preparação", "Top Coat", "Cabine LED", "Durabilidade"],
  },
  {
    slug: "como-escolher-brocas-de-unha-ceramica-tungstenio",
    title: "Como Escolher Brocas para Unhas: Guia de Cerâmica, Tungstênio e Diamantadas",
    subtitle:
      "Identifique as cores das tarjas, formatos ideais e rotações seguras para cada etapa do atendimento em mesa.",
    summary:
      "Entenda a diferença prática entre brocas de tungstênio para remoção rápida, cerâmica para menor aquecimento e diamantadas para cuticulagem russa precisa.",
    readTimeMinutes: 8,
    category: "Equipamentos e Acessórios",
    categorySlug: "maquinarios",
    tags: ["Brocas", "Lixadeiras", "Cuticulagem", "Biossegurança", "Tungstênio"],
  },
  {
    slug: "cuidados-manutencao-alicates-cuticula-esterilizacao",
    title: "Manutenção e Esterilização de Alicates de Cutícula: Guia Prático Profissional",
    subtitle:
      "Biossegurança em salões, afiação correta e protocolos de autoclave para proteger a saúde das clientes.",
    summary:
      "Descubra como higienizar, secar e esterilizar alicates de cutícula em autoclave ou estufa, além de dicas para prolongar a vida útil do fio de corte.",
    readTimeMinutes: 5,
    category: "Biossegurança e Ferramentas",
    categorySlug: "acessorios",
    tags: ["Alicates", "Biossegurança", "Autoclave", "Esterilização", "Manicure"],
  },
];
