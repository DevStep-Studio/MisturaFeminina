import Check from "lucide-solid/icons/check";
import Copy from "lucide-solid/icons/copy";
import X from "lucide-solid/icons/x";
import { Show, createEffect, createSignal } from "solid-js";
import { storefrontStore } from "../store";

const POPUP_DISMISSED_KEY = "mf:promo-popup-dismissed:v1";

export function PromoPopup() {
  const settings = () => storefrontStore.settings();
  const [open, setOpen] = createSignal(false);
  const [copied, setCopied] = createSignal(false);

  createEffect(() => {
    if (!settings().popup_enabled) {
      setOpen(false);
      return;
    }
    try {
      if (
        typeof sessionStorage !== "undefined" &&
        !sessionStorage.getItem(POPUP_DISMISSED_KEY)
      ) {
        setOpen(true);
      }
    } catch {
      setOpen(false);
    }
  });

  function close() {
    setOpen(false);
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(POPUP_DISMISSED_KEY, "1");
      }
    } catch {
      // ignore storage limits
    }
  }

  async function copyCoupon() {
    const code = settings().popup_coupon_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Show when={open() && settings().popup_enabled}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-popup-title"
        class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4"
      >
        <div class="relative w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
          <button
            type="button"
            onClick={close}
            aria-label="Fechar aviso promocional"
            class="absolute right-3 top-3 rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X class="h-5 w-5" />
          </button>

          <p class="text-xs font-semibold uppercase tracking-wide text-[var(--mf-primary)]">
            {settings().store_name}
          </p>
          <h2
            id="promo-popup-title"
            class="mt-1 text-xl font-bold text-zinc-900"
          >
            {settings().popup_title}
          </h2>
          <p class="mt-2 text-sm text-zinc-600">{settings().popup_subtitle}</p>

          <Show when={settings().popup_coupon_code}>
            <div class="mt-4 flex items-center justify-between gap-2 rounded-lg border-2 border-dashed border-[var(--mf-primary)] bg-zinc-50 px-4 py-3">
              <span class="font-mono text-base font-bold tracking-wider text-zinc-900">
                {settings().popup_coupon_code}
              </span>
              <button
                type="button"
                onClick={copyCoupon}
                class="inline-flex items-center gap-1.5 rounded-md bg-[var(--mf-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--mf-primary-hover)]"
              >
                <Show when={copied()} fallback={<Copy class="h-3.5 w-3.5" />}>
                  <Check class="h-3.5 w-3.5" />
                </Show>
                <span>{copied() ? "Copiado!" : "Copiar cupom"}</span>
              </button>
            </div>
          </Show>

          <button
            type="button"
            onClick={close}
            class="mt-5 w-full rounded-lg border border-zinc-300 bg-white py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Continuar comprando
          </button>
        </div>
      </div>
    </Show>
  );
}
