import { useLocation } from "@tanstack/solid-router";
import { Show } from "solid-js";
import {
  analyticsConsent,
  hasActiveAnalyticsTag,
  setAnalyticsConsent,
} from "../../monitoring/analytics";

export function ConsentBanner() {
  const location = useLocation();
  const isAdminRoute = () => location().pathname.startsWith("/admin");

  return (
    <Show
      when={
        !isAdminRoute() &&
        hasActiveAnalyticsTag() &&
        analyticsConsent() === "unknown"
      }
    >
      <aside
        aria-label="Preferências de privacidade e cookies"
        class="fixed inset-x-0 bottom-0 z-40 border-t border-[#e9d5f0] bg-white/95 px-4 py-3 shadow-lg backdrop-blur"
      >
        <div class="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs leading-relaxed text-zinc-700">
            Usamos cookies de medição (Google Analytics) apenas com sua
            permissão para entender o desempenho dos produtos na vitrine, sem
            enviar dados pessoais (LGPD).
          </p>
          <div class="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setAnalyticsConsent("denied")}
              class="h-9 rounded-lg border border-zinc-300 bg-white px-3.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
            >
              Apenas essenciais
            </button>
            <button
              type="button"
              onClick={() => setAnalyticsConsent("granted")}
              class="h-9 rounded-lg bg-[#93509e] px-4 text-xs font-bold text-white transition hover:bg-[#7c3f87]"
            >
              Aceitar medição
            </button>
          </div>
        </div>
      </aside>
    </Show>
  );
}
