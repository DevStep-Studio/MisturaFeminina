import { createSignal, onCleanup, onMount, Show } from "solid-js";
import {
  analyticsConsent,
  setAnalyticsConsent,
} from "../../monitoring/analytics";

const [isOpen, setIsOpen] = createSignal(false);

export function openPrivacyModal() {
  setIsOpen(true);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mf:open-privacy-modal"));
  }
}

export function closePrivacyModal() {
  setIsOpen(false);
}

export function PrivacyModal() {
  const isDenied = () => analyticsConsent() === "denied";

  onMount(() => {
    if (typeof window !== "undefined") {
      const handler = () => setIsOpen(true);
      window.addEventListener("mf:open-privacy-modal", handler);
      (window as unknown as { openPrivacyModal?: () => void }).openPrivacyModal =
        openPrivacyModal;
      onCleanup(() => {
        window.removeEventListener("mf:open-privacy-modal", handler);
      });
    }
  });

  const handleOptOut = () => {
    setAnalyticsConsent("denied");
  };

  const handleEnable = () => {
    setAnalyticsConsent("granted");
  };

  return (
    <Show when={isOpen()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="privacy-modal-title"
        class="fixed inset-0 z-[999] flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div
          class="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
          onClick={closePrivacyModal}
          aria-hidden="true"
        />

        {/* Modal Dialog */}
        <div class="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl transition-all sm:p-7">
          <div class="flex items-start justify-between gap-4">
            <div class="flex items-center gap-3">
              <div class="flex size-10 items-center justify-center rounded-xl bg-[#f5ecf8] text-[#93509e]">
                <svg
                  class="size-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <div>
                <h2
                  id="privacy-modal-title"
                  class="text-base font-bold text-zinc-900 sm:text-lg"
                >
                  Preferências de Privacidade
                </h2>
                <p class="text-xs text-zinc-500">
                  Mistura Feminina Cosméticos • LGPD & Google Consent Mode v2
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={closePrivacyModal}
              class="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition"
              aria-label="Fechar janela de privacidade"
            >
              <svg
                class="size-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div class="mt-4 space-y-3.5 text-xs text-zinc-600 leading-relaxed">
            <p>
              Em conformidade com a <strong>LGPD</strong>, a Mistura Feminina não
              utiliza cookies invasivos nem rastreamento de anúncios de terceiros.
              A medição da vitrine é utilizada para fins estatísticos
              agregados (páginas visitadas, buscas e conversões de catálogo), sem
              coleta de nomes, e-mails, telefones ou documentos pessoais.
            </p>

            <div class="space-y-2 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3.5">
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-semibold text-zinc-800">
                    Medição estatística da loja (Google Analytics)
                  </p>
                  <p class="text-[11px] text-zinc-500">
                    Métricas agregadas de desempenho e navegação
                  </p>
                </div>
                <span
                  class={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    isDenied()
                      ? "bg-zinc-200 text-zinc-700"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {isDenied() ? "Desativada" : "Ativa"}
                </span>
              </div>

              <div class="flex items-center justify-between border-t border-zinc-200/60 pt-2">
                <div>
                  <p class="font-semibold text-zinc-800">
                    Anúncios personalizados & remarketing
                  </p>
                  <p class="text-[11px] text-zinc-500">
                    Cookies publicitários e perfilamento entre sites
                  </p>
                </div>
                <span class="inline-flex items-center rounded-full bg-zinc-200 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-700">
                  Desativado por padrão
                </span>
              </div>
            </div>
          </div>

          <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={closePrivacyModal}
              class="h-9 rounded-xl border border-zinc-300 bg-white px-4 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
            >
              Fechar
            </button>

            <Show
              when={!isDenied()}
              fallback={
                <button
                  type="button"
                  onClick={handleEnable}
                  class="h-9 rounded-xl bg-[#93509e] px-4 text-xs font-bold text-white hover:bg-[#7c3f87] transition"
                >
                  Ativar medição
                </button>
              }
            >
              <button
                type="button"
                onClick={handleOptOut}
                class="h-9 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition"
              >
                Desativar medição (Opt-out)
              </button>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
