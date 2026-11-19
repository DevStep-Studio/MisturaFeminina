export interface SiteEnvironment {
  VITE_SITE_URL?: string;
  VITE_SITE_NAME?: string;
  VITE_SITE_INDEXABLE?: string;
}

/** Shared by runtime metadata and the Vite sitemap/robots plugin. */
export function siteSettings(env: SiteEnvironment, development = false) {
  const url = new URL(env.VITE_SITE_URL || "http://localhost:4321");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "VITE_SITE_URL deve ser a origem HTTP(S) do site, sem caminho, credenciais ou parâmetros.",
    );
  }
  return {
    url: url.origin,
    name: env.VITE_SITE_NAME?.trim() || "Mistura Feminina Cosméticos",
    indexable: development
      ? false
      : env.VITE_SITE_INDEXABLE === "false"
        ? false
        : true,
  };
}

/** Indexable public storefront pages emitted in static sitemap builds. */
export const publicPages: Record<
  string,
  { path: string; title: string; description: string }
> = {
  home: {
    path: "/",
    title: "Mistura Feminina | Cosméticos, Maquiagem e Beleza",
    description:
      "Encontre cosméticos, maquiagens e produtos de beleza na Mistura Feminina. Explore nosso catálogo e descubra opções para seus cuidados diários.",
  },
  categorias: {
    path: "/categorias",
    title: "Todas as Categorias | Mistura Feminina",
    description:
      "Explore todas as categorias de produtos de beleza, maquiagem, cabelos e unhas da Mistura Feminina.",
  },
  marcas: {
    path: "/marcas",
    title: "Marcas Oficiais | Mistura Feminina",
    description:
      "Conheça todas as marcas de beleza e cosméticos disponíveis na Mistura Feminina Cosméticos.",
  },
  promocoes: {
    path: "/promocoes",
    title: "Ofertas e Promoções | Mistura Feminina",
    description:
      "Confira as melhores ofertas e descontos imperdíveis em cosméticos, esmaltes e maquiagens na Mistura Feminina.",
  },
  novidades: {
    path: "/novidades",
    title: "Lançamentos e Novidades | Mistura Feminina",
    description:
      "Descubra os lançamentos mais recentes em produtos de beleza, maquiagem e cuidados pessoais na Mistura Feminina.",
  },
  contato: {
    path: "/contato",
    title: "Fale Conosco e Atendimento | Mistura Feminina",
    description:
      "Entre em contato com a equipe da Mistura Feminina Cosméticos. Atendimento rápido via WhatsApp e e-mail para todo o Brasil.",
  },
  rastrear: {
    path: "/rastrear-pedido",
    title: "Rastrear Pedido — Mistura Feminina Cosméticos",
    description:
      "Consulte o status, pagamento e código de rastreio do seu pedido.",
  },
};
