import { Link } from "@tanstack/solid-router";
import BookOpen from "lucide-solid/icons/book-open";
import ChevronUp from "lucide-solid/icons/chevron-up";
import Clock from "lucide-solid/icons/clock";
import CreditCard from "lucide-solid/icons/credit-card";
import Headset from "lucide-solid/icons/headset";
import Lock from "lucide-solid/icons/lock";
import Mail from "lucide-solid/icons/mail";
import MessageCircle from "lucide-solid/icons/message-circle";
import Phone from "lucide-solid/icons/phone";
import QrCode from "lucide-solid/icons/qr-code";
import ShieldCheck from "lucide-solid/icons/shield-check";
import Sparkles from "lucide-solid/icons/sparkles";
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import { assetUrl, whatsappUrl } from "../../../lib/format";
import { trackContactClick } from "../../../monitoring/analytics";
import { storefrontStore } from "../store";
import { selfServiceStore } from "../selfServiceSupport";
import { openPrivacyModal, PrivacyModal } from "../../../components/privacy/privacy-modal";

const PAYMENT_BADGES = [
  { name: "Pix", isPix: true },
  { name: "VISA", isPix: false },
  { name: "Mastercard", isPix: false },
  { name: "Elo", isPix: false },
  { name: "Amex", isPix: false },
  { name: "Hipercard", isPix: false },
] as const;

export function StoreFooter() {
  const settings = () => storefrontStore.settings();
  const categories = () => storefrontStore.bootstrap().menu_categories;
  const [showBackToTop, setShowBackToTop] = createSignal(false);

  if (typeof window !== "undefined") {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 250);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    onCleanup(() => window.removeEventListener("scroll", handleScroll));
  }

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
    <footer class="relative bg-[#93509e] text-white">
      <div class="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:grid-cols-2 lg:grid-cols-[1.3fr_0.85fr_0.95fr_1.25fr_1.05fr]">
        {/* Brand Column */}
        <div class="flex flex-col items-start space-y-4">
          <Link
            to="/"
            class="inline-flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <img
              src={assetUrl(settings().logo_dark_url || "/logo-mf-dark.png")}
              alt={settings().store_name || "Mistura Feminina Cosméticos"}
              class="h-11 w-auto object-contain brightness-0 invert"
              onError={(e) => {
                if (!e.currentTarget.dataset.fallback) {
                  e.currentTarget.dataset.fallback = "1";
                  e.currentTarget.src = "/logo-mf-dark.png";
                  e.currentTarget.classList.remove("brightness-0", "invert");
                }
              }}
            />
          </Link>

          <p class="max-w-xs text-[13px] leading-relaxed text-white/90">
            Curadoria completa em nail design, esmalteria em gel, cabines e
            equipamentos profissionais com envio para todo o Brasil.
          </p>

          {/* Social Icons */}
          <div class="flex items-center gap-2 pt-1">
            <Show when={settings().social_instagram}>
              <a
                href={settings().social_instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram da Mistura Feminina"
                class="inline-flex size-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-2xs transition hover:border-white hover:bg-white hover:text-[#93509e]"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-4"
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
                class="inline-flex size-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-2xs transition hover:border-white hover:bg-white hover:text-[#93509e]"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-4"
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
                class="inline-flex size-9 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white shadow-2xs transition hover:border-white hover:bg-white hover:text-[#93509e]"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-4"
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
                onClick={() => trackContactClick("whatsapp")}
                aria-label="WhatsApp da Mistura Feminina"
                class="inline-flex size-9 items-center justify-center rounded-xl border border-[#25D366] bg-[#25D366] text-white shadow-2xs transition hover:border-[#1da851] hover:bg-[#1da851]"
              >
                <MessageCircle class="size-4" aria-hidden="true" />
              </a>
            </Show>
          </div>
        </div>

        {/* Categories Column */}
        <div class="space-y-3.5">
          <h2 class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white">
            <Sparkles class="size-3.5 text-white/90" aria-hidden="true" />
            <span>Categorias</span>
          </h2>
          <ul class="space-y-2.5 text-[13px] text-white/85">
            <For each={categories().slice(0, 6)}>
              {(cat) => (
                <li>
                  <Link
                    to="/categoria/$slug"
                    params={{ slug: cat.slug }}
                    class="transition-colors hover:text-white"
                  >
                    {cat.name}
                  </Link>
                </li>
              )}
            </For>
            <li>
              <Link
                to="/categorias"
                class="transition-colors hover:text-white"
              >
                Mapa de Categorias
              </Link>
            </li>
            <li>
              <Link to="/marcas" class="transition-colors hover:text-white">
                Marcas parceiras
              </Link>
            </li>
            <li>
              <Link
                to="/guia"
                class="inline-flex items-center gap-1 font-semibold text-white transition-colors hover:text-[#FFD166]"
              >
                <BookOpen class="size-3.5" aria-hidden="true" />
                <span>Guia da Manicure & Dicas</span>
              </Link>
            </li>
            <li>
              <Link
                to="/promocoes"
                class="transition-colors hover:text-white"
              >
                Promoções
              </Link>
            </li>
          </ul>
        </div>

        {/* Institutional Column */}
        <div class="space-y-3.5">
          <h2 class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white">
            <ShieldCheck class="size-3.5 text-white/90" aria-hidden="true" />
            <span>Institucional</span>
          </h2>
          <ul class="space-y-2.5 text-[13px] text-white/85">
            <For each={groupedPages()}>
              {(page) => (
                <li>
                  <Link
                    to="/$slug"
                    params={{ slug: page.slug }}
                    class="transition-colors hover:text-white"
                  >
                    {page.title}
                  </Link>
                </li>
              )}
            </For>
            <li>
              <Link
                to="/rastrear-pedido"
                class="transition-colors hover:text-white"
              >
                Rastrear Pedido
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={() => selfServiceStore.open()}
                class="transition-colors hover:text-white cursor-pointer text-left"
              >
                Autoatendimento & FAQ
              </button>
            </li>
            <li>
              <Link
                to="/minha-conta"
                class="transition-colors hover:text-white"
              >
                Minha Conta
              </Link>
            </li>
            <li>
              <Link
                to="/contato"
                class="transition-colors hover:text-white"
              >
                Fale Conosco
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={openPrivacyModal}
                class="transition-colors hover:text-white cursor-pointer"
              >
                Privacidade e Cookies
              </button>
            </li>
          </ul>
        </div>

        {/* Customer Support Column */}
        <div class="space-y-3.5">
          <h2 class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white">
            <Phone class="size-3.5 text-white/90" aria-hidden="true" />
            <span>Atendimento</span>
          </h2>
          <ul class="space-y-3 text-[13px] text-white/90">
            <li>
              <button
                type="button"
                onClick={() => selfServiceStore.open()}
                class="inline-flex items-center gap-2 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-white hover:text-[#93509e] cursor-pointer"
              >
                <Headset class="size-4 shrink-0" aria-hidden="true" />
                <span>Central de Autoatendimento</span>
              </button>
            </li>
            <Show when={settings().whatsapp_number || settings().phone}>
              <li>
                <a
                  href={whatsHref()}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackContactClick("whatsapp")}
                  class="inline-flex items-center gap-2 transition-colors hover:text-white"
                >
                  <Phone
                    class="size-4 shrink-0 text-white/90"
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
                  class="inline-flex items-center gap-2 transition-colors hover:text-white"
                >
                  <Mail
                    class="size-4 shrink-0 text-white/90"
                    aria-hidden="true"
                  />
                  <span>{settings().email}</span>
                </a>
              </li>
            </Show>
            <li class="inline-flex items-center gap-2 pt-1 text-xs text-white/80">
              <Clock class="size-3.5 shrink-0 text-white/80" aria-hidden="true" />
              <span>Seg. a Sex. das 9h às 18h</span>
            </li>
          </ul>
        </div>

        {/* Payments and Security */}
        <div class="space-y-6">
          <div class="space-y-3">
            <h2 class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white">
              <CreditCard class="size-3.5 text-white/90" aria-hidden="true" />
              <span>Formas de pagamento</span>
            </h2>
            <div class="flex flex-wrap gap-1.5">
              <For each={PAYMENT_BADGES}>
                {(badge) => (
                  <span class="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-white/20 bg-white px-2.5 text-[11px] font-bold tracking-wide text-[#2E0C49] shadow-2xs">
                    <Show
                      when={badge.isPix}
                      fallback={<CreditCard class="size-3 text-[#93509e]" aria-hidden="true" />}
                    >
                      <QrCode class="size-3 text-[#93509e]" aria-hidden="true" />
                    </Show>
                    <span>{badge.name}</span>
                  </span>
                )}
              </For>
            </div>
          </div>

          <div class="space-y-3">
            <h2 class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white">
              <Lock class="size-3.5 text-white/90" aria-hidden="true" />
              <span>Segurança</span>
            </h2>
            <div class="flex flex-wrap gap-2">
              <span class="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#2E0C49] shadow-2xs">
                <ShieldCheck
                  class="size-3.5 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
                <span>Site Seguro SSL</span>
              </span>
              <span class="inline-flex items-center gap-1.5 rounded-md border border-white/20 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#2E0C49] shadow-2xs">
                <Lock
                  class="size-3.5 shrink-0 text-[#93509e]"
                  aria-hidden="true"
                />
                <span>Loja Protegida</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-Footer / Copyright */}
      <div class="border-t border-white/10 bg-[#7c3f87] px-4 py-5 text-xs text-white/90 sm:px-6">
        <div class="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2.5 text-center sm:flex-row sm:text-left">
          <p>
            {settings().company_legal_name || settings().store_name}
            <Show when={settings().cnpj}> • CNPJ: {settings().cnpj}</Show>
            <Show when={settings().address}> • {settings().address}</Show>
            {" — "}© {new Date().getFullYear()} Todos os direitos reservados.
            {" • "}
            <button
              type="button"
              onClick={openPrivacyModal}
              class="underline underline-offset-2 transition-colors hover:text-white cursor-pointer"
            >
              Privacidade
            </button>
          </p>
          <p class="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-white/90">
            <CreditCard class="size-3.5 text-white/80" aria-hidden="true" />
            <span>Em até {settings().max_installments}x sem juros no cartão.</span>
          </p>
        </div>
      </div>

      {/* Floating Back-To-Top Button */}
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Voltar ao topo"
        class={`fixed right-4 bottom-20 z-40 inline-flex size-10 items-center justify-center rounded-xl border border-white/40 bg-white text-[#93509e] shadow-lg transition-all duration-300 ease-out hover:-translate-y-1 hover:bg-[#7c3f87] hover:text-white md:right-5 md:bottom-5 ${
          showBackToTop()
            ? "translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-4 scale-90 opacity-0"
        }`}
      >
        <ChevronUp class="size-4 stroke-[2.2]" aria-hidden="true" />
      </button>
      <PrivacyModal />
    </footer>
  );
}
