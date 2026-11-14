import { createSignal, Show } from "solid-js";
import {
  analyticsConsent,
  analyticsEnabled,
  setAnalyticsConsent,
} from "../../lib/analytics";

export function ConsentBanner() {
  const [editing, setEditing] = createSignal(false);
  const choose = (value: "granted" | "denied") => {
    setAnalyticsConsent(value);
    setEditing(false);
  };
  return (
    <Show when={analyticsEnabled}>
      <button
        class="fixed right-4 bottom-4 z-40 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700 shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        onClick={() => setEditing(true)}
      >
        Preferências de privacidade
      </button>
      <Show when={analyticsConsent() === "unknown" || editing()}>
        <section
          class="fixed right-4 bottom-16 left-4 z-50 max-w-lg space-y-4 rounded-lg border border-zinc-200 bg-white p-5 text-sm text-zinc-900 shadow-lg sm:left-auto"
          aria-labelledby="consent-title"
          aria-describedby="consent-description"
        >
          <div>
            <h2 id="consent-title" class="font-semibold">
              Sua privacidade, sua escolha
            </h2>
            <p id="consent-description" class="mt-2 leading-6 text-zinc-600">
              Com sua permissão, usamos cookies de análise para entender a
              navegação e melhorar sua experiência. Você pode recusar ou alterar
              sua escolha a qualquer momento.
            </p>
          </div>
          <div class="flex flex-wrap gap-3">
            <button
              class="min-h-11 rounded-md border border-zinc-300 px-4 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => choose("denied")}
            >
              Recusar análises
            </button>
            <button
              class="min-h-11 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white focus-visible:outline-2 focus-visible:outline-offset-2"
              onClick={() => choose("granted")}
            >
              Aceitar análises
            </button>
          </div>
        </section>
      </Show>
    </Show>
  );
}
