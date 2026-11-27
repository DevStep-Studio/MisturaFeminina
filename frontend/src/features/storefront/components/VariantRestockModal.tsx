import { Show, createEffect, createSignal } from "solid-js";
import BellRing from "lucide-solid/icons/bell-ring";
import CheckCircle2 from "lucide-solid/icons/circle-check";
import Mail from "lucide-solid/icons/mail";
import MessageCircle from "lucide-solid/icons/message-circle";
import X from "lucide-solid/icons/x";
import { ApiError, api } from "@/lib/api";
import { session } from "@/security/session";
import type { ProductVariantData } from "../types";

export interface VariantRestockModalProps {
  open: boolean;
  productSlug: string;
  productName: string;
  variant: ProductVariantData | null;
  whatsappEnabled?: boolean;
  onClose: () => void;
}

export function VariantRestockModal(props: VariantRestockModalProps) {
  const [name, setName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [channel, setChannel] = createSignal<"email" | "whatsapp">("email");
  const [consent, setConsent] = createSignal(true);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [success, setSuccess] = createSignal<string | null>(null);

  createEffect(() => {
    if (props.open) {
      const user = session.user();
      if (user) {
        if (!name()) setName(user.name || "");
        if (!email()) setEmail(user.email || "");
      }
      setError(null);
      setSuccess(null);
    }
  });

  async function submitAlert(e: Event) {
    e.preventDefault();
    if (!props.variant) return;
    if ((props.variant.available_stock ?? 0) > 0 || props.variant.in_stock) {
      setError(
        `Esta tonalidade já está disponível para compra imediata (${props.variant.available_stock ?? 1} un. em estoque).`,
      );
      return;
    }
    if (!consent()) {
      setError(
        "Confirme o consentimento para receber o aviso de volta ao estoque.",
      );
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await api<{ message?: string; duplicate?: boolean }>(
        `/catalog/products/${props.productSlug}/restock-alert`,
        {
          method: "POST",
          body: {
            variant_id: props.variant.id,
            name: name().trim() || undefined,
            email:
              channel() === "email"
                ? email().trim()
                : email().trim() || undefined,
            phone: channel() === "whatsapp" ? phone().trim() : undefined,
            channel: channel(),
            consent_given: consent(),
          },
        },
      );
      setSuccess(
        res.message ||
          "Pronto! Você receberá o aviso assim que esta tonalidade voltar ao estoque.",
      );
    } catch (err) {
      if (err instanceof ApiError) {
        const validationMsg =
          Object.values(err.validation || {}).flat()[0] ||
          (typeof err.payload?.message === "string" ? err.payload.message : undefined);
        setError(validationMsg || err.message);
      } else {
        setError("Não foi possível registrar seu aviso agora.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Show when={props.open && props.variant}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="restock-modal-title"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
      >
        <div class="relative w-full max-w-md rounded-2xl border border-[#DFC2E3] bg-white p-5 shadow-2xl sm:p-6">
          <button
            type="button"
            onClick={() => props.onClose()}
            aria-label="Fechar aviso de reposição"
            class="absolute right-3.5 top-3.5 inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X class="h-4 w-4" />
          </button>

          <div class="flex items-start gap-3 pr-8">
            <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FDF2FD] text-[#93509e]">
              <BellRing class="h-5 w-5" />
            </span>
            <div>
              <h2
                id="restock-modal-title"
                class="text-base font-extrabold text-[#2E0C49]"
              >
                Avise-me quando chegar
              </h2>
              <p class="mt-0.5 text-xs text-zinc-600">{props.productName}</p>
            </div>
          </div>

          <Show when={props.variant}>
            {(v) => (
              <div class="mt-4 flex items-center gap-2.5 rounded-xl border border-[#EFE2F2] bg-[#FAF7FC] px-3 py-2.5">
                <Show when={v().color_hex}>
                  <span
                    class="h-6 w-6 shrink-0 rounded-full border border-black/15 shadow-inner"
                    style={{ "background-color": v().color_hex! }}
                  />
                </Show>
                <div class="min-w-0 flex-1 text-xs">
                  <p class="truncate font-bold text-[#2E0C49]">
                    Tonalidade: {v().name}
                    <Show when={v().shade_code}> ({v().shade_code})</Show>
                  </p>
                  <p class="text-[11px] text-zinc-500">SKU: {v().sku}</p>
                </div>
              </div>
            )}
          </Show>

          <Show when={props.variant && ((props.variant.available_stock ?? 0) > 0 || props.variant.in_stock)}>
            <div class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <p class="font-bold">Esta tonalidade já está em estoque!</p>
              <p class="mt-0.5 text-[11px] text-emerald-800">
                Disponível para compra imediata ({props.variant!.available_stock} un.). Não é necessário solicitar aviso.
              </p>
            </div>
          </Show>

          <Show
            when={!success()}
            fallback={
              <div class="mt-5 space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <CheckCircle2 class="mx-auto h-9 w-9 text-emerald-600" />
                <p class="text-sm font-bold text-emerald-950">{success()}</p>
                <button
                  type="button"
                  onClick={() => props.onClose()}
                  class="h-10 w-full rounded-lg bg-[#93509e] text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#7c3f87]"
                >
                  Continuar comprando
                </button>
              </div>
            }
          >
            <form
              onSubmit={(e) => void submitAlert(e)}
              class="mt-4 space-y-3.5"
            >
              <Show when={props.whatsappEnabled}>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setChannel("email")}
                    class={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-bold transition-colors ${
                      channel() === "email"
                        ? "border-[#93509e] bg-[#FDF2FD] text-[#93509e]"
                        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    <Mail class="h-3.5 w-3.5" />
                    E-mail
                  </button>
                  <button
                    type="button"
                    onClick={() => setChannel("whatsapp")}
                    class={`flex h-9 items-center justify-center gap-1.5 rounded-lg border text-xs font-bold transition-colors ${
                      channel() === "whatsapp"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    <MessageCircle class="h-3.5 w-3.5" />
                    WhatsApp
                  </button>
                </div>
              </Show>

              <div>
                <label class="mb-1 block text-xs font-semibold text-zinc-700">
                  Seu nome (opcional)
                </label>
                <input
                  type="text"
                  value={name()}
                  onInput={(e) => setName(e.currentTarget.value)}
                  placeholder="Ex.: Maria / Studio Unhas"
                  class="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-[#93509e] focus:outline-none"
                />
              </div>

              <Show when={channel() === "email"}>
                <div>
                  <label class="mb-1 block text-xs font-semibold text-zinc-700">
                    E-mail para notificação *
                  </label>
                  <input
                    type="email"
                    required
                    value={email()}
                    onInput={(e) => setEmail(e.currentTarget.value)}
                    placeholder="voce@seusalao.com.br"
                    class="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-[#93509e] focus:outline-none"
                  />
                </div>
              </Show>

              <Show when={channel() === "whatsapp"}>
                <div>
                  <label class="mb-1 block text-xs font-semibold text-zinc-700">
                    WhatsApp com DDD *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone()}
                    onInput={(e) => setPhone(e.currentTarget.value)}
                    placeholder="(11) 99999-9999"
                    class="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:border-[#93509e] focus:outline-none"
                  />
                </div>
              </Show>

              <label class="flex cursor-pointer items-start gap-2 rounded-lg bg-zinc-50 p-2.5 text-[11px] leading-relaxed text-zinc-600">
                <input
                  type="checkbox"
                  checked={consent()}
                  onChange={(e) => setConsent(e.currentTarget.checked)}
                  class="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-[#93509e]"
                />
                <span>
                  Autorizo o envio de uma única notificação quando esta
                  tonalidade for reposta (LGPD).
                </span>
              </label>

              <Show when={error()}>
                <p
                  role="alert"
                  class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700"
                >
                  {error()}
                </p>
              </Show>

              <div class="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => props.onClose()}
                  class="h-10 flex-1 rounded-lg border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={busy() || Boolean(props.variant && ((props.variant.available_stock ?? 0) > 0 || props.variant.in_stock))}
                  class="h-10 flex-1 rounded-lg bg-[#93509e] text-xs font-bold text-white transition-colors hover:bg-[#7c3f87] disabled:opacity-60"
                >
                  {busy() ? "Enviando..." : "Me avise"}
                </button>
              </div>
            </form>
          </Show>
        </div>
      </div>
    </Show>
  );
}
