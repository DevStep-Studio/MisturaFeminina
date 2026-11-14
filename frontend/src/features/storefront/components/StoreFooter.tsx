import { Link } from "@tanstack/solid-router";
import ChevronRight from "lucide-solid/icons/chevron-right";
import ChevronUp from "lucide-solid/icons/chevron-up";
import Lock from "lucide-solid/icons/lock";
import Mail from "lucide-solid/icons/mail";
import MessageCircle from "lucide-solid/icons/message-circle";
import Phone from "lucide-solid/icons/phone";
import ShieldCheck from "lucide-solid/icons/shield-check";
import { For, Show, createMemo } from "solid-js";
import { assetUrl, whatsappUrl } from "../../../lib/format";
import { storefrontStore } from "../store";

const PAYMENT_BADGES = [
  { label: "VISA", color: "text-[#1A1F71]" },
  { label: "Mastercard", color: "text-[#B91C1C]" },
  { label: "Elo", color: "text-[#0369A1]" },
  { label: "Amex", color: "text-[#005EA6]" },
  { label: "Hipercard", color: "text-[#991B1B]" },
  { label: "Pix", color: "text-[#047857]" },
] as const;

export function StoreFooter() {
  const settings = () => storefrontStore.settings();
  const categories = () => storefrontStore.bootstrap().menu_categories;

  const groupedPages = createMemo(() => {
    const pages = storefrontStore
      .bootstrap()
      .footer_pages.filter((p) => p.slug !== "contato");
    return [
      ...pages.filter((p) => p.footer_group === "institucional"),
      ...pages.filter((p) => p.footer_group === "ajuda"),
      ...pages.filter((p) => p.footer_group === "politicas"),
    ];
  });

  const whatsHref = () =>
    whatsappUrl(
      settings().whatsapp_number,
      settings().whatsapp_default_message,
    );

  return (
    <footer class="relative bg-gradient-to-b from-[#FDC8FC] to-[#FDBDFA] text-[#3D1260]">
      <div class="mx-auto max-w-7xl px-4 pb-6 pt-8 text-center">
        <Link
          to="/categorias"
          class="inline-flex items-center gap-1 rounded-full border border-[#62298D] bg-white px-6 py-2 text-xs font-bold text-[#3D1260] shadow-xs transition hover:bg-[#3D1260] hover:text-white"
        >
          <span>Mapa de Categorias</span>
          <ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div class="mx-auto grid max-w-7xl gap-8 px-4 pb-12 pt-2 sm:grid-cols-2 lg:grid-cols-[0.85fr_0.95fr_1.1fr_1.35fr_1.1fr]">
        <div class="flex flex-col items-start space-y-4">
          <Link to="/" class="inline-flex items-center">
            <img
              src={assetUrl(settings().logo_light_url)}
              alt={settings().store_name}
              onError={(e) => {
                e.currentTarget.src = "/logo-mf.png";
              }}
              class="h-12 w-auto max-w-[180px] object-contain"
              loading="lazy"
            />
          </Link>

          <div class="flex items-center gap-3 text-[#2E0C49]">
            <Show when={settings().social_instagram}>
              <a
                href={settings().social_instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram da Mistura Feminina"
                class="inline-flex size-8 items-center justify-center rounded-full border border-[#62298D]/30 bg-white/70 transition hover:bg-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
                </svg>
              </a>
            </Show>
            <Show when={settings().social_youtube}>
              <a
                href={settings().social_youtube}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube da Mistura Feminina"
                class="inline-flex size-8 items-center justify-center rounded-full border border-[#62298D]/30 bg-white/70 transition hover:bg-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
                  <polygon
                    points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"
                    fill="currentColor"
                  />
                </svg>
              </a>
            </Show>
            <Show when={settings().social_tiktok}>
              <a
                href={settings().social_tiktok}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok da Mistura Feminina"
                class="inline-flex size-8 items-center justify-center rounded-full border border-[#62298D]/30 bg-white/70 transition hover:bg-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
                </svg>
              </a>
            </Show>
            <Show when={settings().whatsapp_number}>
              <a
                href={whatsHref()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="WhatsApp da Mistura Feminina"
                class="inline-flex size-8 items-center justify-center rounded-full border border-[#62298D]/30 bg-white/70 transition hover:bg-white"
              >
                <MessageCircle class="h-4 w-4" aria-hidden="true" />
              </a>
            </Show>
          </div>
        </div>

        <div class="space-y-3">
          <h2 class="text-[15px] font-bold text-[#2E0C49]">Categorias</h2>
          <ul class="space-y-2 text-[13px] font-medium text-[#3D1260]">
            <For each={categories().slice(0, 8)}>
              {(cat) => (
                <li>
                  <Link
                    to="/categoria/$slug"
                    params={{ slug: cat.slug }}
                    class="transition-colors hover:text-[#2E0C49] hover:underline"
                  >
                    {cat.name}
                  </Link>
                </li>
              )}
            </For>
            <li>
              <Link
                to="/marcas"
                class="transition-colors hover:text-[#2E0C49] hover:underline"
              >
                Marcas parceiras
              </Link>
            </li>
            <li>
              <Link
                to="/promocoes"
                class="transition-colors hover:text-[#2E0C49] hover:underline"
              >
                Promoções
              </Link>
            </li>
          </ul>
        </div>

        <div class="space-y-3">
          <h2 class="text-[15px] font-bold text-[#2E0C49]">Institucional</h2>
          <ul class="space-y-2 text-[13px] font-medium text-[#3D1260]">
            <For each={groupedPages()}>
              {(page) => (
                <li>
                  <Link
                    to="/$slug"
                    params={{ slug: page.slug }}
                    class="transition-colors hover:text-[#2E0C49] hover:underline"
                  >
                    {page.title}
                  </Link>
                </li>
              )}
            </For>
            <li>
              <Link
                to="/rastrear-pedido"
                class="transition-colors hover:text-[#2E0C49] hover:underline"
              >
                Rastrear Pedido
              </Link>
            </li>
            <li>
              <Link
                to="/minha-conta"
                class="transition-colors hover:text-[#2E0C49] hover:underline"
              >
                Minha Conta
              </Link>
            </li>
            <li>
              <Link
                to="/contato"
                class="transition-colors hover:text-[#2E0C49] hover:underline"
              >
                Fale Conosco
              </Link>
            </li>
          </ul>
        </div>

        <div class="space-y-3">
          <h2 class="text-[15px] font-bold text-[#2E0C49]">Atendimento</h2>
          <ul class="space-y-2.5 text-[13px] font-medium text-[#3D1260]">
            <Show when={settings().whatsapp_number || settings().phone}>
              <li>
                <a
                  href={whatsHref()}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-2 hover:underline"
                >
                  <Phone class="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{settings().phone || settings().whatsapp_number}</span>
                </a>
              </li>
            </Show>
            <Show when={settings().email}>
              <li>
                <a
                  href={`mailto:${settings().email}`}
                  class="inline-flex items-center gap-2 hover:underline"
                >
                  <Mail class="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{settings().email}</span>
                </a>
              </li>
            </Show>
          </ul>
        </div>

        <div class="space-y-5">
          <div>
            <h2 class="mb-2.5 text-[15px] font-bold text-[#2E0C49]">
              Formas de pagamento
            </h2>
            <div class="flex flex-wrap gap-1.5">
              <For each={PAYMENT_BADGES}>
                {(badge) => (
                  <span
                    class={`inline-flex h-7 items-center justify-center rounded border border-zinc-200 bg-white px-2 text-[10px] font-extrabold shadow-2xs ${badge.color}`}
                  >
                    {badge.label}
                  </span>
                )}
              </For>
            </div>
          </div>

          <div>
            <h2 class="mb-2.5 text-[15px] font-bold text-[#2E0C49]">
              Selos de Segurança
            </h2>
            <div class="flex flex-wrap gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#2E0C49] shadow-2xs">
                <ShieldCheck
                  class="h-4 w-4 shrink-0 text-emerald-700"
                  aria-hidden="true"
                />
                <span>Site Seguro SSL</span>
              </span>
              <span class="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#2E0C49] shadow-2xs">
                <Lock
                  class="h-4 w-4 shrink-0 text-[#3D1260]"
                  aria-hidden="true"
                />
                <span>Loja Protegida</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-zinc-200 bg-white px-4 py-5 text-center text-xs text-zinc-700">
        <div class="mx-auto max-w-7xl space-y-1.5">
          <p>
            {settings().company_legal_name || settings().store_name}
            <Show when={settings().cnpj}> • CNPJ: {settings().cnpj}</Show>
            <Show when={settings().address}> / {settings().address}</Show>
            {" — "}© {new Date().getFullYear()} Todos os direitos reservados.
          </p>
          <p class="text-[11px] text-zinc-600">
            Preços, estoque e condições de parcelamento em até{" "}
            {settings().max_installments}x sem juros sujeitos a confirmação no
            carrinho.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Voltar ao topo"
        class="fixed bottom-5 right-5 z-40 inline-flex size-11 items-center justify-center rounded-full bg-[#E82EA6] text-white shadow-lg transition hover:bg-[#C22583]"
      >
        <ChevronUp class="h-5 w-5" aria-hidden="true" />
      </button>
    </footer>
  );
}
