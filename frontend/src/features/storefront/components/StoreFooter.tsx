import { Link } from "@tanstack/solid-router";
import Mail from "lucide-solid/icons/mail";
import MapPin from "lucide-solid/icons/map-pin";
import MessageCircle from "lucide-solid/icons/message-circle";
import Phone from "lucide-solid/icons/phone";
import ShieldCheck from "lucide-solid/icons/shield-check";
import { For, Show, createMemo } from "solid-js";
import { assetUrl, whatsappUrl } from "../../../lib/format";
import { storefrontStore } from "../store";

export function StoreFooter() {
  const settings = () => storefrontStore.settings();
  const categories = () => storefrontStore.bootstrap().menu_categories;

  const groupedPages = createMemo(() => {
    const pages = storefrontStore.bootstrap().footer_pages;
    return {
      institucional: pages.filter((p) => p.footer_group === "institucional"),
      ajuda: pages.filter((p) => p.footer_group === "ajuda"),
      politicas: pages.filter((p) => p.footer_group === "politicas"),
    };
  });

  const whatsHref = () =>
    whatsappUrl(
      settings().whatsapp_number,
      settings().whatsapp_default_message,
    );

  return (
    <footer class="border-t border-zinc-200 bg-[var(--mf-secondary)] text-zinc-100">
      <div class="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div class="space-y-4">
          <Link to="/" class="inline-flex items-center">
            <img
              src={assetUrl(
                settings().logo_dark_url || settings().logo_light_url,
              )}
              alt={settings().store_name}
              class="h-10 w-auto max-w-[190px] object-contain"
              loading="lazy"
            />
          </Link>
          <p class="text-sm leading-relaxed text-zinc-300">
            {settings().tagline}
          </p>
          <div class="flex flex-wrap gap-2 pt-1">
            <Show when={settings().social_instagram}>
              <a
                href={settings().social_instagram}
                target="_blank"
                rel="noopener noreferrer"
                class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:border-zinc-500"
              >
                Instagram
              </a>
            </Show>
            <Show when={settings().social_tiktok}>
              <a
                href={settings().social_tiktok}
                target="_blank"
                rel="noopener noreferrer"
                class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:border-zinc-500"
              >
                TikTok
              </a>
            </Show>
            <Show when={settings().social_youtube}>
              <a
                href={settings().social_youtube}
                target="_blank"
                rel="noopener noreferrer"
                class="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:border-zinc-500"
              >
                YouTube
              </a>
            </Show>
          </div>
        </div>

        <div class="space-y-3">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-white">
            Departamentos
          </h2>
          <ul class="space-y-2 text-sm text-zinc-300">
            <For each={categories().slice(0, 7)}>
              {(cat) => (
                <li>
                  <Link
                    to="/categoria/$slug"
                    params={{ slug: cat.slug }}
                    class="hover:text-white hover:underline"
                  >
                    {cat.name}
                  </Link>
                </li>
              )}
            </For>
            <li>
              <Link to="/marcas" class="hover:text-white hover:underline">
                Marcas parceiras
              </Link>
            </li>
            <li>
              <Link to="/promocoes" class="hover:text-white hover:underline">
                Ofertas e Promoções
              </Link>
            </li>
          </ul>
        </div>

        <div class="space-y-3">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-white">
            Institucional e Ajuda
          </h2>
          <ul class="space-y-2 text-sm text-zinc-300">
            <li>
              <Link
                to="/rastrear-pedido"
                class="hover:text-white hover:underline"
              >
                Rastrear Pedido
              </Link>
            </li>
            <li>
              <Link to="/minha-conta" class="hover:text-white hover:underline">
                Minha Conta
              </Link>
            </li>
            <li>
              <Link to="/contato" class="hover:text-white hover:underline">
                Fale Conosco
              </Link>
            </li>
            <For
              each={[
                ...groupedPages().institucional,
                ...groupedPages().ajuda,
                ...groupedPages().politicas,
              ]}
            >
              {(page) => (
                <li>
                  <Link
                    to="/$slug"
                    params={{ slug: page.slug }}
                    class="hover:text-white hover:underline"
                  >
                    {page.title}
                  </Link>
                </li>
              )}
            </For>
          </ul>
        </div>

        <div class="space-y-3">
          <h2 class="text-sm font-semibold uppercase tracking-wide text-white">
            Atendimento e Segurança
          </h2>
          <ul class="space-y-2.5 text-sm text-zinc-300">
            <Show when={settings().whatsapp_number}>
              <li>
                <a
                  href={whatsHref()}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-2 text-emerald-400 hover:underline"
                >
                  <MessageCircle class="h-4 w-4 shrink-0" />
                  <span>
                    WhatsApp: {settings().phone || settings().whatsapp_number}
                  </span>
                </a>
              </li>
            </Show>
            <Show when={settings().phone}>
              <li class="flex items-center gap-2">
                <Phone class="h-4 w-4 shrink-0 text-zinc-400" />
                <span>{settings().phone}</span>
              </li>
            </Show>
            <Show when={settings().email}>
              <li class="flex items-center gap-2">
                <Mail class="h-4 w-4 shrink-0 text-zinc-400" />
                <a
                  href={`mailto:${settings().email}`}
                  class="hover:text-white hover:underline"
                >
                  {settings().email}
                </a>
              </li>
            </Show>
            <Show when={settings().address}>
              <li class="flex items-start gap-2">
                <MapPin class="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                <span>{settings().address}</span>
              </li>
            </Show>
          </ul>

          <div class="pt-2">
            <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
              Formas de pagamento
            </p>
            <div class="flex flex-wrap gap-1.5 text-xs">
              <span class="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200">
                Pix Instantâneo
              </span>
              <span class="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-200">
                Cartão em até {settings().max_installments}x
              </span>
              <span class="inline-flex items-center gap-1 rounded border border-emerald-800 bg-emerald-950 px-2 py-1 text-emerald-300">
                <ShieldCheck class="h-3.5 w-3.5" />
                Ambiente Seguro
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-zinc-800 bg-zinc-950 px-4 py-4">
        <div class="mx-auto flex max-w-7xl flex-col items-start justify-between gap-2 text-xs text-zinc-400 sm:flex-row sm:items-center">
          <p>
            © {new Date().getFullYear()}{" "}
            {settings().company_legal_name || settings().store_name}
            <Show when={settings().cnpj}> · CNPJ: {settings().cnpj}</Show>
          </p>
          <p>
            Todos os direitos reservados. Preços e estoque sujeitos a
            confirmação no carrinho.
          </p>
        </div>
      </div>
    </footer>
  );
}
