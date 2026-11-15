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

/** Add indexable public content pages when the client application needs them. */
export const publicPages: Record<
  string,
  { path: string; title: string; description: string }
> = {};
