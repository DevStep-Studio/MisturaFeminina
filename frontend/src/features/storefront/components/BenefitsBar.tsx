import { For, Show } from "solid-js";
import BadgeDollarSign from "lucide-solid/icons/badge-dollar-sign";
import CreditCard from "lucide-solid/icons/credit-card";
import Sparkles from "lucide-solid/icons/sparkles";
import Truck from "lucide-solid/icons/truck";
import { storefrontStore } from "../store";

function renderTickerIcon(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("frete") || lower.includes("envio")) {
    return <Truck class="size-4 shrink-0 text-white" aria-hidden="true" />;
  }
  if (
    lower.includes("preço") ||
    lower.includes("preco") ||
    lower.includes("melhor")
  ) {
    return (
      <BadgeDollarSign class="size-4 shrink-0 text-white" aria-hidden="true" />
    );
  }
  if (
    lower.includes("parcel") ||
    lower.includes("juros") ||
    lower.includes("6x")
  ) {
    return <CreditCard class="size-4 shrink-0 text-white" aria-hidden="true" />;
  }
  return <Sparkles class="size-3.5 shrink-0 text-white" aria-hidden="true" />;
}

export function BenefitsBar() {
  const tickerItems = () => storefrontStore.settings().benefits_ticker || [];

  return (
    <Show when={tickerItems().length > 0}>
      <div
        class="w-full overflow-x-clip text-[13px] font-semibold text-white"
        style={{ "background-color": "var(--mf-secondary)" }}
        aria-label="Benefícios da loja"
      >
        <div class="mf-ticker-track py-2.5">
          <div class="flex shrink-0 items-center gap-8 px-4">
            <For each={tickerItems()}>
              {(item) => (
                <span class="inline-flex items-center gap-2 whitespace-nowrap tracking-wide">
                  <span class="text-white/90" aria-hidden="true">
                    •
                  </span>
                  {renderTickerIcon(item)}
                  <span>{item}</span>
                </span>
              )}
            </For>
          </div>
          <div class="flex shrink-0 items-center gap-8 px-4" aria-hidden="true">
            <For each={tickerItems()}>
              {(item) => (
                <span class="inline-flex items-center gap-2 whitespace-nowrap tracking-wide">
                  <span class="text-white/90">•</span>
                  {renderTickerIcon(item)}
                  <span>{item}</span>
                </span>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  );
}
