/**
 * Mapeamento de compatibilidade para categorias migradas ou slugs legados.
 * Redireciona de forma suave e transparente sem exibir erro 404.
 */
export const LEGACY_CATEGORY_REDIRECTS: Record<string, string> = {
  "cabines-e-estufas": "/categoria/cabines-uv-led",
  "cabines": "/categoria/cabines-uv-led",
  "maquinarios-cabines-e-estufas": "/categoria/cabines-uv-led",
  "motores-lixadeiras": "/categoria/maquinarios",
  "aspiradores-sugadores": "/categoria/maquinarios",
  "luminarias-e-lampadas": "/categoria/maquinarios",
  "acessorios-pro": "/categoria/maquinarios",
  "unhas-e-esmalteria": "/categoria/acessorios",
  "esmaltes-em-gel": "/categoria/esmalte-em-gel",
};

export function getLegacyCategoryRedirect(slug: string): string | null {
  const normalized = (slug || "").toLowerCase().trim();
  return LEGACY_CATEGORY_REDIRECTS[normalized] ?? null;
}
