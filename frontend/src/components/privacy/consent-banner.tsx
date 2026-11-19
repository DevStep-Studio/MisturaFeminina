import { createEffect, onCleanup, Show } from "solid-js";
import {
  analyticsConsent,
  analyticsEnabled,
  setAnalyticsConsent,
} from "../../lib/analytics";

const AUTO_DISMISS_MS = 8000;

export function ConsentBanner() {
  const isVisible = () => analyticsEnabled && analyticsConsent() === "unknown";

  createEffect(() => {
    if (!isVisible()) return;
    const timer = setTimeout(() => {
      setAnalyticsConsent("granted");
    }, AUTO_DISMISS_MS);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    <Show when={isVisible()}>
      <section
        class="fixed right-3 bottom-20 left-3 z-50 max-w-md space-y-3 rounded-xl border border-purple-200/80 bg-white/95 p-3.5 text-xs text-zinc-800 shadow-lg backdrop-blur-md sm:right-4 sm:left-auto sm:p-4 sm:text-sm md:bottom-4"
        aria-labelledby="consent-title"
        aria-describedby="consent-description"
      >
        <div>
          <h2 id="consent-title" class="font-semibold text-zinc-900">
            Aviso de cookies
          </h2>
          <p id="consent-description" class="mt-1 leading-5 text-zinc-600">
            Usamos cookies de análise para melhorar sua navegação. Você pode
            aceitar ou recusar a qualquer momento.
          </p>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            class="min-h-9 cursor-pointer rounded-lg border border-[#93509e] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#93509e] transition-colors hover:bg-[#93509e] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93509e] sm:text-sm"
            onClick={() => setAnalyticsConsent("denied")}
          >
            Recusar análises
          </button>
          <button
            type="button"
            class="min-h-9 cursor-pointer rounded-lg bg-[#93509e] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#7c3f87] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#93509e] sm:text-sm"
            onClick={() => setAnalyticsConsent("granted")}
          >
            Aceitar análises
          </button>
        </div>
      </section>
    </Show>
  );
}
