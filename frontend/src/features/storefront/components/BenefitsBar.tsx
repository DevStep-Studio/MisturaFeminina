import { For, Show } from "solid-js";
import { storefrontStore } from "../store";

export function BenefitsBar() {
  const tickerItems = () => storefrontStore.settings().benefits_ticker || [];

  return (
    <Show when={tickerItems().length > 0}>
      <div
        class="w-full overflow-x-clip text-xs font-medium text-white"
        style={{ "background-color": "var(--mf-secondary)" }}
        aria-label="Benefícios da loja"
      >
        <div class="mf-ticker-track py-2">
          <div class="flex shrink-0 items-center gap-8 px-4">
            <For each={tickerItems()}>
              {(item) => (
                <span class="whitespace-nowrap tracking-wide">• {item}</span>
              )}
            </For>
          </div>
          <div class="flex shrink-0 items-center gap-8 px-4" aria-hidden="true">
            <For each={tickerItems()}>
              {(item) => (
                <span class="whitespace-nowrap tracking-wide">• {item}</span>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}
