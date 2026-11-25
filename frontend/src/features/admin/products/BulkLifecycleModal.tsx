import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import X from "lucide-solid/icons/x";
import { For, Show, createEffect, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import {
  type BulkLifecyclePreviewPayload,
  type BulkSelectionPayload,
  makeIdempotencyKey,
} from "./types";

export function BulkLifecycleModal(props: {
  open: boolean;
  action: "archive" | "restore" | "delete";
  selection: BulkSelectionPayload;
  onClose: () => void;
  onCommitted: (message: string) => Promise<void> | void;
}) {
  const [preview, setPreview] = createSignal<BulkLifecyclePreviewPayload | null>(
    null,
  );
  const [loading, setLoading] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = createSignal(
    makeIdempotencyKey("lifecycle"),
  );
  const [result, setResult] = createSignal<{
    counts: { completed: number; skipped: number; pending: number };
    blocked_items: Array<{ name: string; sku: string; reason: string }>;
  } | null>(null);

  createEffect(() => {
    if (!props.open) return;
    setPreview(null);
    setResult(null);
    setErrorMsg(null);
    setIdempotencyKey(makeIdempotencyKey("lifecycle"));
    void loadPreview();
  });

  async function loadPreview() {
    setLoading(true);
    try {
      const res = await api<{ data: BulkLifecyclePreviewPayload }>(
        "/admin/products/bulk-lifecycle/preview",
        {
          method: "POST",
          body: {
            selection: props.selection,
            action: props.action,
          },
        },
      );
      setPreview(res.data);
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Erro ao verificar vínculos.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function confirm(archiveBlocked = false) {
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await api<{
        data: {
          counts: { completed: number; skipped: number; pending: number };
          blocked_items: Array<{ name: string; sku: string; reason: string }>;
        };
      }>("/admin/products/bulk-lifecycle/commit", {
        method: "POST",
        body: {
          selection: props.selection,
          action: props.action,
          idempotency_key: idempotencyKey(),
          archive_blocked: archiveBlocked,
        },
      });
      setResult(res.data);
      const c = res.data.counts;
      await props.onCommitted(
        `${c.completed} concluído(s), ${c.skipped} ignorado(s), ${c.pending} bloqueado(s).`,
      );
      if (c.pending === 0) {
        props.onClose();
      }
    } catch (err) {
      setErrorMsg(
        err instanceof ApiError ? err.message : "Erro ao executar operação.",
      );
    } finally {
      setBusy(false);
    }
  }

  const actionTitle = () =>
    props.action === "delete"
      ? "Excluir produtos"
      : props.action === "restore"
        ? "Restaurar produtos arquivados"
        : "Arquivar produtos";

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
        <div class="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-t-xl border border-zinc-200 bg-white sm:rounded-xl">
          <div class="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5">
            <h2 class="text-base font-bold text-zinc-900">{actionTitle()}</h2>
            <button
              type="button"
              aria-label="Fechar confirmação"
              onClick={() => props.onClose()}
              class="rounded p-1 text-zinc-500 hover:bg-zinc-100"
            >
              <X class="h-4 w-4" />
            </button>
          </div>

          <div class="flex-1 space-y-3 overflow-y-auto p-5 text-xs">
            <Show when={loading()}>
              <p class="text-zinc-500">
                Verificando pedidos, movimentações de estoque e recebimentos vinculados...
              </p>
            </Show>

            <Show when={errorMsg()}>
              <div class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                {errorMsg()}
              </div>
            </Show>

            <Show when={result()}>
              {(r) => (
                <div class="space-y-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                  <p class="font-bold text-zinc-900">
                    Resultado: {r().counts.completed} concluídos · {r().counts.skipped} ignorados · {r().counts.pending} pendentes
                  </p>
                  <Show when={r().blocked_items.length > 0}>
                    <ul class="space-y-1 text-red-700">
                      <For each={r().blocked_items}>
                        {(b) => (
                          <li>
                            <strong>{b.sku} ({b.name}):</strong> {b.reason}
                          </li>
                        )}
                      </For>
                    </ul>
                  </Show>
                </div>
              )}
            </Show>

            <Show when={preview()}>
              {(p) => (
                <>
                  <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 space-y-1.5">
                    <p class="font-semibold text-zinc-900">
                      Escopo: {p().scope_label}
                    </p>
                    <p class="text-zinc-700">
                      Impacto: <strong>{p().total_products}</strong> produto(s) e{" "}
                      <strong>{p().total_variants_affected}</strong> variação(ões) associada(s).
                    </p>
                    <Show when={p().has_multi_variant_products}>
                      <p class="font-medium text-amber-800">
                        Produtos com variações atingirão todas as suas cores/opções simultaneamente.
                      </p>
                    </Show>
                  </div>

                  <div>
                    <p class="mb-1.5 font-semibold text-zinc-700">
                      Amostra dos itens selecionados:
                    </p>
                    <ul class="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
                      <For each={p().sample}>
                        {(s) => (
                          <li class="flex items-center justify-between px-3 py-2">
                            <span class="font-medium text-zinc-900">{s.name}</span>
                            <span class="font-mono text-[11px] text-zinc-500">
                              {s.sku} · {s.variants_count} var.
                            </span>
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>

                  <Show when={props.action === "delete" && p().blocked_count > 0}>
                    <div class="space-y-2 rounded-lg border border-red-200 bg-red-50/70 p-3 text-red-900">
                      <p class="flex items-center gap-1.5 font-bold">
                        <AlertTriangle class="h-4 w-4 shrink-0" />
                        {p().blocked_count} produto(s) não podem ser excluídos para preservar o histórico
                      </p>
                      <ul class="space-y-1">
                        <For each={p().items.filter((i) => !i.links.can_delete)}>
                          {(item) => (
                            <li>
                              <strong>{item.sku} ({item.name}):</strong>{" "}
                              {item.links.impediment_reason}
                            </li>
                          )}
                        </For>
                      </ul>
                    </div>
                  </Show>
                </>
              )}
            </Show>
          </div>

          <div class="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-zinc-200 bg-white px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={() => props.onClose()}
              class="rounded-md border border-zinc-300 px-3.5 py-2 text-xs font-semibold text-zinc-700"
            >
              Cancelar
            </button>
            <Show when={preview()}>
              {(p) => (
                <Show
                  when={props.action === "delete"}
                  fallback={
                    <button
                      type="button"
                      disabled={busy()}
                      onClick={() => void confirm(false)}
                      class="rounded-md bg-[#93509e] px-4 py-2 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-60"
                    >
                      {busy()
                        ? "Executando..."
                        : props.action === "restore"
                          ? "Confirmar restauração"
                          : "Confirmar arquivamento"}
                    </button>
                  }
                >
                  <>
                    <Show when={p().blocked_count > 0}>
                      <button
                        type="button"
                        disabled={busy()}
                        onClick={() => void confirm(true)}
                        class="rounded-md bg-[#93509e] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#7c3f87] disabled:opacity-60"
                      >
                        {p().deletable_count > 0
                          ? `Excluir ${p().deletable_count} livres e arquivar ${p().blocked_count} vinculados`
                          : `Arquivar os ${p().blocked_count} vinculados`}
                      </button>
                    </Show>
                    <Show when={p().deletable_count > 0}>
                      <button
                        type="button"
                        disabled={busy()}
                        onClick={() => void confirm(false)}
                        class="rounded-md border border-red-300 bg-red-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-60"
                      >
                        {p().blocked_count > 0
                          ? `Excluir apenas os ${p().deletable_count} permitidos`
                          : `Excluir ${p().deletable_count} produto(s)`}
                      </button>
                    </Show>
                  </>
                </Show>
              )}
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
