import { Link } from "@tanstack/solid-router";
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
  "VISA",
  "Mastercard",
  "Elo",
  "Amex",
  "Hipercard",
  "Pix",
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
    <footer class="relative border-t border-zinc-200/80 bg-white text-[#2E0C49]">
      <div class="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.85fr_0.95fr_1.25fr_1.05fr]">
        <div class="flex flex-col items-start space-y-4">
          <Link
            to="/"
            class="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#62298D]"
          >
            <img
              src={assetUrl(settings().logo_light_url || "/logo-mf.png")}
              alt={settings().store_name || "Mistura Feminina Cosméticos"}
              class="h-11 w-auto object-contain"
              onError={(e) => {
                if (!e.currentTarget.dataset.fallback) {
                  e.currentTarget.dataset.fallback = "1";
                  e.currentTarget.src = "/logo-mf.png";
                }
              }}
            />
          </Link>

          <p class="max-w-xs text-[13px] leading-relaxed text-zinc-600">
            Curadoria completa em nail design, esmalteria em gel, cabines e
            equipamentos profissionais com envio para todo o Brasil.
          </p>

          <div class="flex items-center gap-2.5">
            <Show when={settings().social_instagram}>
              <a
                href={settings().social_instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram da Mistura Feminina"
                class="inline-flex size-9 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] transition hover:bg-[#93509e] hover:text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
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
                class="inline-flex size-9 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] transition hover:bg-[#93509e] hover:text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
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
                class="inline-flex size-9 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] transition hover:bg-[#93509e] hover:text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
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
                class="inline-flex size-9 items-center justify-center rounded-lg border border-[#13b918] bg-white text-[#0d8211] transition hover:border-[#0d8211] hover:bg-[#0d8211] hover:text-white"
              >
                <MessageCircle class="h-4 w-4" aria-hidden="true" />
              </a>
            </Show>
          </div>
        </div>

        <div class="space-y-3.5">
          <h2 class="text-xs font-bold uppercase tracking-[0.14em] text-[#2E0C49]">
            Categorias
          </h2>
          <ul class="space-y-2.5 text-[13px] text-zinc-600">
            <For each={categories().slice(0, 6)}>
              {(cat) => (
                <li>
                  <Link
                    to="/categoria/$slug"
                    params={{ slug: cat.slug }}
                    class="transition-colors hover:text-[#3D1260]"
                  >
                    {cat.name}
                  </Link>
                </li>
              )}
            </For>
            <li>
              <Link
                to="/categorias"
                class="transition-colors hover:text-[#3D1260]"
              >
                Mapa de Categorias
              </Link>
            </li>
            <li>
              <Link to="/marcas" class="transition-colors hover:text-[#3D1260]">
                Marcas parceiras
              </Link>
            </li>
            <li>
              <Link
                to="/promocoes"
                class="transition-colors hover:text-[#3D1260]"
              >
                Promoções
              </Link>
            </li>
          </ul>
        </div>

        <div class="space-y-3.5">
          <h2 class="text-xs font-bold uppercase tracking-[0.14em] text-[#2E0C49]">
            Institucional
          </h2>
          <ul class="space-y-2.5 text-[13px] text-zinc-600">
            <For each={groupedPages()}>
              {(page) => (
                <li>
                  <Link
                    to="/$slug"
                    params={{ slug: page.slug }}
                    class="transition-colors hover:text-[#3D1260]"
                  >
                    {page.title}
                  </Link>
                </li>
              )}
            </For>
            <li>
              <Link
                to="/rastrear-pedido"
                class="transition-colors hover:text-[#3D1260]"
              >
                Rastrear Pedido
              </Link>
            </li>
            <li>
              <Link
                to="/minha-conta"
                class="transition-colors hover:text-[#3D1260]"
              >
                Minha Conta
              </Link>
            </li>
            <li>
              <Link
                to="/contato"
                class="transition-colors hover:text-[#3D1260]"
              >
                Fale Conosco
              </Link>
            </li>
          </ul>
        </div>

        <div class="space-y-3.5">
          <h2 class="text-xs font-bold uppercase tracking-[0.14em] text-[#2E0C49]">
            Atendimento
          </h2>
          <ul class="space-y-3 text-[13px] text-zinc-600">
            <Show when={settings().whatsapp_number || settings().phone}>
              <li>
                <a
                  href={whatsHref()}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center gap-2 transition-colors hover:text-[#3D1260]"
                >
                  <Phone
                    class="h-4 w-4 shrink-0 text-[#62298D]"
                    aria-hidden="true"
                  />
                  <span>{settings().phone || settings().whatsapp_number}</span>
                </a>
              </li>
            </Show>
            <Show when={settings().email}>
              <li>
                <a
                  href={`mailto:${settings().email}`}
                  class="inline-flex items-center gap-2 transition-colors hover:text-[#3D1260]"
                >
                  <Mail
                    class="h-4 w-4 shrink-0 text-[#62298D]"
                    aria-hidden="true"
                  />
                  <span>{settings().email}</span>
                </a>
              </li>
            </Show>
            <li class="pt-1 text-xs text-zinc-500">
              Seg. a Sex. das 9h às 18h
            </li>
          </ul>
        </div>

        <div class="space-y-6">
          <div class="space-y-3">
            <h2 class="text-xs font-bold uppercase tracking-[0.14em] text-[#2E0C49]">
              Formas de pagamento
            </h2>
            <div class="flex flex-wrap gap-1.5">
              <For each={PAYMENT_BADGES}>
                {(badge) => (
                  <span class="inline-flex h-7 items-center justify-center rounded-md border border-zinc-200/90 bg-zinc-50/80 px-2.5 text-[11px] font-semibold tracking-wide text-zinc-700">
                    {badge}
                  </span>
                )}
              </For>
            </div>
          </div>

          <div class="space-y-3">
            <h2 class="text-xs font-bold uppercase tracking-[0.14em] text-[#2E0C49]">
              Segurança
            </h2>
            <div class="flex flex-wrap gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-md border border-zinc-200/90 bg-zinc-50/80 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700">
                <ShieldCheck
                  class="h-3.5 w-3.5 shrink-0 text-[#3D1260]"
                  aria-hidden="true"
                />
                <span>Site Seguro SSL</span>
              </span>
              <span class="inline-flex items-center gap-1.5 rounded-md border border-zinc-200/90 bg-zinc-50/80 px-2.5 py-1.5 text-[11px] font-medium text-zinc-700">
                <Lock
                  class="h-3.5 w-3.5 shrink-0 text-[#3D1260]"
                  aria-hidden="true"
                />
                <span>Loja Protegida</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="border-t border-zinc-200/70 bg-[#FAF8FC] px-4 py-5 text-xs text-zinc-600">
        <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
          <p>
            {settings().company_legal_name || settings().store_name}
            <Show when={settings().cnpj}> • CNPJ: {settings().cnpj}</Show>
            <Show when={settings().address}> • {settings().address}</Show>
            {" — "}© {new Date().getFullYear()} Todos os direitos reservados.
          </p>
          <p class="shrink-0 text-[11px] text-zinc-600">
            Em até {settings().max_installments}x sem juros no cartão.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Voltar ao topo"
        class="fixed bottom-5 right-5 z-40 inline-flex size-10 items-center justify-center rounded-lg border border-[#93509e] bg-white text-[#93509e] shadow-md transition hover:bg-[#93509e] hover:text-white"
      >
        <ChevronUp class="h-4 w-4" aria-hidden="true" />
      </button>
    </footer>
  );
}
