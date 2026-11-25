import { Show, createSignal } from "solid-js";
import { useNavigate } from "@tanstack/solid-router";
import Check from "lucide-solid/icons/check";
import ClipboardList from "lucide-solid/icons/clipboard-list";
import Copy from "lucide-solid/icons/copy";
import MessageCircle from "lucide-solid/icons/message-circle";
import Share2 from "lucide-solid/icons/share-2";
import { session } from "@/security/session";
import { saveCartAsReplenishmentList } from "@/features/storefront/replenishment";
import { shareCurrentCart } from "@/features/storefront/store";
import { ApiError } from "@/lib/api";

export function CartShareWidget() {
  const navigate = useNavigate();
  const [title, setTitle] = createSignal("");
  const [shareUrl, setShareUrl] = createSignal<string | null>(null);
  const [copied, setCopied] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [listBusy, setListBusy] = createSignal(false);
  const [message, setMessage] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  async function handleCreateShareLink() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await shareCurrentCart(title().trim() || undefined);
      const absolute =
        typeof window !== "undefined"
          ? `${window.location.origin}/carrinho/compartilhado/${res.token}`
          : res.url;
      setShareUrl(absolute);
      setMessage("Link de carrinho compartilhado pronto por 30 dias!");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível gerar o link compartilhável.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const url = shareUrl();
    if (!url || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSaveAsReplenishment() {
    if (session.status() !== "authenticated") {
      await navigate({ to: "/entrar", search: { redirect: "/carrinho" } });
      return;
    }
    setListBusy(true);
    setError(null);
    try {
      const created = await saveCartAsReplenishmentList(
        title().trim() || undefined,
      );
      setMessage(`Carrinho salvo na lista de reposição "${created.name}"!`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível salvar como lista de reposição.",
      );
    } finally {
      setListBusy(false);
    }
  }

  return (
    <div class="space-y-3 rounded-xl border border-[#DFC2E3] bg-[#FCF8FD] p-4">
      <div class="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-[#2E0C49]">
        <Share2 class="h-4 w-4 text-[#93509e]" />
        <span>Compartilhar ou Salvar Seleção</span>
      </div>

      <input
        type="text"
        value={title()}
        onInput={(e) => setTitle(e.currentTarget.value)}
        placeholder="Nome da seleção (opcional, ex.: Pedido Studio)"
        aria-label="Nome opcional para carrinho compartilhado"
        class="h-9 w-full rounded-lg border border-[#DFC2E3] bg-white px-3 text-xs text-zinc-900 focus:border-[#93509e] focus:outline-none"
      />

      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={busy()}
          onClick={() => void handleCreateShareLink()}
          class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#93509e] px-3 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-60"
        >
          <Share2 class="h-3.5 w-3.5" />
          {busy() ? "Gerando link..." : "Compartilhar carrinho"}
        </button>

        <button
          type="button"
          disabled={listBusy()}
          onClick={() => void handleSaveAsReplenishment()}
          class="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#93509e] bg-white px-3 text-xs font-bold text-[#93509e] hover:bg-[#93509e] hover:text-white disabled:opacity-60"
        >
          <ClipboardList class="h-3.5 w-3.5" />
          {listBusy() ? "Salvando..." : "Salvar p/ reposição"}
        </button>
      </div>

      <Show when={shareUrl()}>
        {(url) => (
          <div class="space-y-2 rounded-lg border border-[#EADBED] bg-white p-2.5 text-xs">
            <div class="flex items-center gap-1.5">
              <input
                type="text"
                readOnly
                value={url()}
                aria-label="Link do carrinho compartilhado"
                class="h-8 min-w-0 flex-1 rounded border border-zinc-200 bg-zinc-50 px-2 font-mono text-[11px] text-zinc-700"
              />
              <button
                type="button"
                onClick={() => void copyLink()}
                class="inline-flex h-8 shrink-0 items-center gap-1 rounded bg-[#93509e] px-2.5 text-[11px] font-bold text-white hover:bg-[#7c3f87]"
              >
                <Show when={copied()} fallback={<Copy class="h-3 w-3" />}>
                  <Check class="h-3 w-3" />
                </Show>
                {copied() ? "Copiado" : "Copiar"}
              </button>
            </div>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `Separei estes produtos na Mistura Feminina: ${url()}`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              class="mf-btn-whats inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold"
            >
              <MessageCircle class="h-3.5 w-3.5" />
              <span class="whitespace-nowrap">
                <span class="hidden sm:inline">Enviar pelo </span>
                <span>WhatsApp</span>
              </span>
            </a>
          </div>
        )}
      </Show>

      <Show when={message()}>
        <p class="text-[11px] font-semibold text-emerald-700">{message()}</p>
      </Show>
      <Show when={error()}>
        <p role="alert" class="text-[11px] font-semibold text-red-700">
          {error()}
        </p>
      </Show>
    </div>
  );
}
