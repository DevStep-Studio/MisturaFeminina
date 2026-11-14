import { For, Show } from "solid-js";
import { storefrontStore } from "../store";

function renderTickerIcon(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("frete") || lower.includes("envio")) {
    return (
      <svg
        viewBox="0 0 24 18"
        class="h-4 w-5 shrink-0"
        fill="none"
        aria-hidden="true"
      >
        <rect x="1" y="3" width="14" height="10" rx="1.5" fill="#FACC15" />
        <path d="M15 6h4.2L22 9.5V13h-7V6z" fill="#FDE047" />
        <path d="M16.5 7.5h2.2l1.8 2.2h-4V7.5z" fill="#62298D" />
        <circle cx="5.5" cy="14" r="2.2" fill="#FEF08A" />
        <circle cx="5.5" cy="14" r="0.9" fill="#62298D" />
        <circle cx="18.5" cy="14" r="2.2" fill="#FEF08A" />
        <circle cx="18.5" cy="14" r="0.9" fill="#62298D" />
      </svg>
    );
  }
  if (
    lower.includes("preço") ||
    lower.includes("preco") ||
    lower.includes("melhor")
  ) {
    return (
      <span
        class="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[15px] font-black leading-none text-[#22C55E]"
        aria-hidden="true"
      >
        $
      </span>
    );
  }
  if (
    lower.includes("parcel") ||
    lower.includes("juros") ||
    lower.includes("6x")
  ) {
    return (
      <svg
        viewBox="0 0 24 18"
        class="h-4 w-5 shrink-0"
        fill="none"
        aria-hidden="true"
      >
        <rect x="2" y="3" width="20" height="13" rx="2.5" fill="#F97316" />
        <rect x="2" y="6" width="20" height="3" fill="#EA580C" />
        <rect x="5" y="11" width="5" height="2" rx="0.5" fill="#FED7AA" />
      </svg>
    );
  }
  return (
    <span class="text-white/90" aria-hidden="true">
      •
    </span>
  );
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
