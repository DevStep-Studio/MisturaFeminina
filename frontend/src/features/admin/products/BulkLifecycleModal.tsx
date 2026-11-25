import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import { For, Show, createEffect, createSignal } from "solid-js";
import { ApiError, api } from "../../../lib/api";
import { AdminButton, AdminModal } from "../ui";
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
  const [preview, setPreview] =
    createSignal<BulkLifecyclePreviewPayload | null>(null);
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
    if (busy()) return;
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

  const countLabel = (n: number) =>
    n === 1 ? "1 produto" : `${n} produtos`;

  const actionTitle = () => {
    const p = preview();
    if (props.action === "delete") {
      if (p) return `Excluir ${countLabel(p.total_products)}`;
      return "Excluir produtos";
    }
    if (props.action === "restore") {
      return p ? `Restaurar ${countLabel(p.total_products)}` : "Restaurar produtos";
    }
    return p ? `Arquivar ${countLabel(p.total_products)}` : "Arquivar produtos";
  };

  return (
    <AdminModal
      open={props.open}
      title={actionTitle()}
      maxWidthClass="max-w-2xl"
      closeLabel="Fechar confirmação"
      onClose={() => props.onClose()}
      footer={
        <>
          <AdminButton variant="secondary" onClick={() => props.onClose()}>
            Cancelar
          </AdminButton>
          <Show when={preview()}>
            {(p) => (
              <Show
                when={props.action === "delete"}
                fallback={
                  <AdminButton
                    variant="primary"
                    loading={busy()}
                    loadingLabel="Salvando…"
                    onClick={() => void confirm(false)}
                  >
                    {props.action === "restore"
                      ? `Restaurar ${countLabel(p().total_products)}`
                      : `Arquivar ${countLabel(p().total_products)}`}
                  </AdminButton>
                }
              >
                <>
                  <Show when={p().blocked_count > 0}>
                    <AdminButton
                      variant="primary"
                      loading={busy()}
                      loadingLabel="Salvando…"
                      onClick={() => void confirm(true)}
                    >
                      {p().deletable_count > 0
                        ? `Excluir ${p().deletable_count} livres e arquivar ${p().blocked_count} vinculados`
                        : `Arquivar ${countLabel(p().blocked_count)} vinculados`}
                    </AdminButton>
                  </Show>
                  <Show when={p().deletable_count > 0}>
                    <AdminButton
                      variant="danger"
                      loading={busy()}
                      loadingLabel="Excluindo…"
                      onClick={() => void confirm(false)}
                    >
                      {p().blocked_count > 0
                        ? `Excluir apenas os ${p().deletable_count} permitidos`
                        : `Excluir ${countLabel(p().deletable_count)}`}
                    </AdminButton>
                  </Show>
                </>
              </Show>
            )}
          </Show>
        </>
      }
    >
      <div class="space-y-3 text-xs">
        <Show when={loading()}>
          <p class="text-zinc-500">
            Verificando pedidos, movimentações de estoque e recebimentos
            vinculados...
          </p>
        </Show>

        <Show when={errorMsg()}>
          <div
            role="alert"
            class="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-red-800"
          >
            {errorMsg()}
          </div>
        </Show>

        <Show when={result()}>
          {(r) => (
            <div class="space-y-2 rounded-[8px] border border-zinc-200 bg-zinc-50 p-3">
              <p class="font-bold text-zinc-900">
                Resultado: {r().counts.completed} concluído(s) ·{" "}
                {r().counts.skipped} ignorado(s) · {r().counts.pending}{" "}
                pendente(s)
              </p>
              <Show when={r().blocked_items.length > 0}>
                <ul class="space-y-1 text-red-700">
                  <For each={r().blocked_items}>
                    {(b) => (
                      <li>
                        <strong>
                          {b.sku} ({b.name}):
                        </strong>{" "}
                        {b.reason}
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
              <div class="space-y-1.5 rounded-[8px] border border-zinc-200 bg-zinc-50 p-3.5">
                <p class="font-semibold text-zinc-900">
                  Escopo: {p().scope_label}
                </p>
                <p class="text-zinc-700">
                  Impacto: <strong>{countLabel(p().total_products)}</strong> e{" "}
                  <strong>{p().total_variants_affected}</strong> variação(ões)
                  associada(s).
                </p>
                <Show when={p().has_multi_variant_products}>
                  <p class="font-medium text-amber-800">
                    Produtos com variações atingirão todas as suas cores/opções
                    simultaneamente.
                  </p>
                </Show>
              </div>

              <div>
                <p class="mb-1.5 font-semibold text-zinc-700">
                  Amostra dos itens selecionados:
                </p>
                <ul class="divide-y divide-zinc-100 rounded-[8px] border border-zinc-200">
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
                <div class="space-y-2 rounded-[8px] border border-red-200 bg-red-50/70 p-3 text-red-900">
                  <p class="flex items-center gap-1.5 font-bold">
                    <AlertTriangle class="h-4 w-4 shrink-0" />
                    {countLabel(p().blocked_count)} não podem ser excluídos para
                    preservar o histórico
                  </p>
                  <ul class="space-y-1">
                    <For each={p().items.filter((i) => !i.links.can_delete)}>
                      {(item) => (
                        <li>
                          <strong>
                            {item.sku} ({item.name}):
                          </strong>{" "}
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
    </AdminModal>
  );
}
