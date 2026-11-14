import { For, Show } from "solid-js";
import BadgeDollarSign from "lucide-solid/icons/badge-dollar-sign";
import CreditCard from "lucide-solid/icons/credit-card";
import ShieldCheck from "lucide-solid/icons/shield-check";
import Sparkles from "lucide-solid/icons/sparkles";
import Truck from "lucide-solid/icons/truck";
import { storefrontStore } from "../store";

function renderTickerIcon(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("frete") || lower.includes("envio")) {
    return <Truck class="size-3.5 shrink-0" aria-hidden="true" />;
  }
  if (
    lower.includes("preço") ||
    lower.includes("preco") ||
    lower.includes("melhor")
  ) {
    return <BadgeDollarSign class="size-3.5 shrink-0" aria-hidden="true" />;
  }
  if (
    lower.includes("parcel") ||
    lower.includes("juros") ||
    lower.includes("6x")
  ) {
    return <CreditCard class="size-3.5 shrink-0" aria-hidden="true" />;
  }
  if (lower.includes("segur") || lower.includes("compra")) {
    return <ShieldCheck class="size-3.5 shrink-0" aria-hidden="true" />;
  }
  return <Sparkles class="size-3.5 shrink-0" aria-hidden="true" />;
}

export function BenefitsBar() {
  const tickerItems = () => storefrontStore.settings().benefits_ticker || [];

  return (
    <Show when={tickerItems().length > 0}>
      <div
        class="relative w-full overflow-hidden border-b border-white/10 bg-[#3D1260] text-[12px] font-medium tracking-[0.02em] text-white select-none sm:text-[12.5px]"
        aria-label="Benefícios da loja"
      >
        <div class="mf-ticker-track py-2">
          <For each={[0, 1]}>
            {(halfIndex) => (
              <div
                class="flex shrink-0 items-center"
                aria-hidden={halfIndex > 0 ? "true" : undefined}
              >
                <For each={[0, 1, 2, 3]}>
                  {(repeatIndex) => (
                    <div
                      class="flex shrink-0 items-center"
                      aria-hidden={
                        halfIndex === 0 && repeatIndex > 0 ? "true" : undefined
                      }
                    >
                      <For each={tickerItems()}>
                        {(item) => (
                          <span class="inline-flex items-center whitespace-nowrap">
                            <span class="inline-flex items-center gap-2">
                              <span class="inline-flex size-5 shrink-0 items-center justify-center rounded-md bg-white/15 text-[#F5D0FE]">
                                {renderTickerIcon(item)}
                              </span>
                              <span>{item}</span>
                            </span>
                            <span
                              class="mx-6 inline-block size-1 shrink-0 rotate-45 rounded-[1px] bg-[#E879F9]/75"
                              aria-hidden="true"
                            />
                          </span>
                        )}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}
