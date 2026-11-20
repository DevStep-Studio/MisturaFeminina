import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import Clock from "lucide-solid/icons/clock";
import CreditCard from "lucide-solid/icons/credit-card";
import MessageSquarePlus from "lucide-solid/icons/message-square-plus";
import RotateCcw from "lucide-solid/icons/rotate-ccw";
import ShieldAlert from "lucide-solid/icons/shield-exclamation-point";
import Truck from "lucide-solid/icons/truck";
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { ApiError, api } from "../../lib/api";

export interface TimelineEventItem {
  id: string;
  category: "payment" | "logistics" | "support" | "internal" | "returns";
  event_type: string;
  title: string;
  description: string | null;
  origin: string;
  actor_name: string | null;
  occurred_at: string | null;
}

export interface OrderOccurrenceRow {
  id: number;
  occurrence_number: string;
  order_item_id: number | null;
  type: string;
  priority: string;
  status: string;
  affected_qty: number;
  description: string;
  resolution_type: string | null;
  resolution_notes: string | null;
  reverse_tracking_code: string | null;
  assigned_to: { id: number; name: string } | null;
  product_snapshot: {
    product_name?: string;
    variant_name?: string;
    sku?: string;
  } | null;
  created_at: string;
}

const OCC_TYPES = [
  ["wrong_product", "Produto incorreto"],
  ["wrong_shade", "Cor / Tonalidade incorreta"],
  ["damaged", "Produto danificado"],
  ["missing_item", "Item faltante"],
  ["delivery_delay", "Atraso na entrega"],
  ["payment_issue", "Problema com pagamento"],
  ["exchange", "Solicitação de troca"],
  ["return", "Devolução"],
  ["complaint", "Reclamação"],
  ["question", "Dúvida do cliente"],
  ["other", "Outro"],
] as const;

const OCC_STATUS = [
  ["open", "Aberta"],
  ["in_progress", "Em atendimento"],
  ["waiting_customer", "Aguardando cliente"],
  ["waiting_carrier", "Aguardando transportadora"],
  ["waiting_supplier", "Aguardando fornecedor"],
  ["resolved", "Resolvida"],
  ["closed", "Encerrada"],
] as const;

export function AdminOrderTimelineAndAfterSales(props: {
  orderId: number;
  hasIssue?: boolean;
  items: Array<{
    id: number;
    product_name_snapshot: string;
    variant_name_snapshot: string;
    sku_snapshot: string;
    quantity: number;
  }>;
  timeline: TimelineEventItem[];
  occurrences: OrderOccurrenceRow[];
  onRefresh: () => Promise<void> | void;
}) {
  const [timelineFilter, setTimelineFilter] = createSignal("all");
  const [showOccForm, setShowOccForm] = createSignal(false);
  const [occType, setOccType] = createSignal("wrong_shade");
  const [occItemId, setOccItemId] = createSignal("");
  const [occPriority, setOccPriority] = createSignal("high");
  const [occDesc, setOccDesc] = createSignal("");
  const [occAssignee, setOccAssignee] = createSignal("");

  const [noteBody, setNoteBody] = createSignal("");
  const [noteNextAction, setNoteNextAction] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [feedback, setFeedback] = createSignal<string | null>(null);

  const [staff] = createResource(async () => {
    const res = await api<{ data: Array<{ id: number; name: string }> }>(
      "/admin/team-members",
    );
    return res.data ?? [];
  });

  const filteredTimeline = createMemo(() => {
    const f = timelineFilter();
    if (f === "all") return props.timeline;
    return props.timeline.filter((ev) => ev.category === f);
  });

  async function toggleManualIssue() {
    setBusy(true);
    setFeedback(null);
    try {
      await api(`/admin/orders/${props.orderId}/flag-issue`, {
        method: "POST",
        body: {
          has_issue: !props.hasIssue,
          issue_reason: !props.hasIssue
            ? "Sinalizado manualmente na fila operacional"
            : null,
        },
      });
      await props.onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function submitOccurrence(e: Event) {
    e.preventDefault();
    if (!occDesc().trim()) return;
    setBusy(true);
    setFeedback(null);
    try {
      await api(`/admin/orders/${props.orderId}/occurrences`, {
        method: "POST",
        body: {
          order_item_id: occItemId() ? Number(occItemId()) : null,
          type: occType(),
          priority: occPriority(),
          description: occDesc().trim(),
          assigned_to_user_id: occAssignee() ? Number(occAssignee()) : null,
        },
      });
      setOccDesc("");
      setOccItemId("");
      setShowOccForm(false);
      setFeedback("Ocorrência registrada e vinculada ao pedido.");
      await props.onRefresh();
    } catch (err) {
      setFeedback(
        err instanceof ApiError
          ? err.message
          : "Não foi possível abrir a ocorrência.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateOccStatus(occId: number, status: string) {
    await api(`/admin/occurrences/${occId}`, {
      method: "PATCH",
      body: { status },
    });
    await props.onRefresh();
  }

  async function transferOcc(occId: number, userIdStr: string) {
    await api(`/admin/occurrences/${occId}`, {
      method: "PATCH",
      body: {
        assigned_to_user_id: userIdStr ? Number(userIdStr) : null,
      },
    });
    await props.onRefresh();
  }

  async function submitNote(e: Event) {
    e.preventDefault();
    if (!noteBody().trim()) return;
    setBusy(true);
    try {
      await api(`/admin/orders/${props.orderId}/notes`, {
        method: "POST",
        body: {
          body: noteBody().trim(),
          next_action: noteNextAction().trim() || undefined,
          note_type: "internal",
        },
      });
      setNoteBody("");
      setNoteNextAction("");
      setFeedback("Nota interna salva no histórico.");
      await props.onRefresh();
    } finally {
      setBusy(false);
    }
  }

  function categoryIcon(cat: TimelineEventItem["category"]) {
    switch (cat) {
      case "payment":
        return <CreditCard class="size-3.5 text-emerald-700" />;
      case "logistics":
        return <Truck class="size-3.5 text-[#93509e]" />;
      case "returns":
        return <RotateCcw class="size-3.5 text-amber-700" />;
      case "support":
        return <AlertTriangle class="size-3.5 text-red-600" />;
      default:
        return <Clock class="size-3.5 text-zinc-500" />;
    }
  }

  return (
    <div class="space-y-4 border-t border-zinc-200 pt-4 text-xs">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="font-extrabold uppercase tracking-wide text-[#2E0C49]">
          Pós-Venda &amp; Linha do Tempo
        </h3>
        <div class="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy()}
            onClick={() => void toggleManualIssue()}
            class={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-bold ${
              props.hasIssue
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            <ShieldAlert class="size-3" />
            {props.hasIssue ? "Limpar pendência" : "Sinalizar problema"}
          </button>
          <button
            type="button"
            onClick={() => setShowOccForm((v) => !v)}
            class="rounded-md bg-[#93509e] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#7c3f87]"
          >
            + Registrar ocorrência
          </button>
        </div>
      </div>

      <Show when={feedback()}>
        <p class="rounded bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-800">
          {feedback()}
        </p>
      </Show>

      {/* Create Occurrence Form */}
      <Show when={showOccForm()}>
        <form
          onSubmit={(e) => void submitOccurrence(e)}
          class="space-y-2.5 rounded-lg border border-[#DFC2E3] bg-[#FCF8FD] p-3"
        >
          <div class="grid gap-2 sm:grid-cols-2">
            <select
              value={occType()}
              onChange={(e) => setOccType(e.currentTarget.value)}
              class="h-8 rounded border border-zinc-300 bg-white px-2"
            >
              <For each={OCC_TYPES}>
                {([val, label]) => <option value={val}>{label}</option>}
              </For>
            </select>
            <select
              value={occPriority()}
              onChange={(e) => setOccPriority(e.currentTarget.value)}
              class="h-8 rounded border border-zinc-300 bg-white px-2"
            >
              <option value="urgent">Urgente</option>
              <option value="high">Alta</option>
              <option value="normal">Normal</option>
              <option value="low">Baixa</option>
            </select>
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
            <select
              value={occItemId()}
              onChange={(e) => setOccItemId(e.currentTarget.value)}
              class="h-8 rounded border border-zinc-300 bg-white px-2"
            >
              <option value="">Item afetado (opcional)</option>
              <For each={props.items}>
                {(item) => (
                  <option value={item.id}>
                    {item.product_name_snapshot} ({item.variant_name_snapshot})
                  </option>
                )}
              </For>
            </select>
            <select
              value={occAssignee()}
              onChange={(e) => setOccAssignee(e.currentTarget.value)}
              class="h-8 rounded border border-zinc-300 bg-white px-2"
            >
              <option value="">Responsável automático</option>
              <For each={staff() ?? []}>
                {(u) => <option value={u.id}>{u.name}</option>}
              </For>
            </select>
          </div>

          <textarea
            rows={2}
            required
            placeholder="Descreva a ocorrência, defeito, troca ou dúvida..."
            value={occDesc()}
            onInput={(e) => setOccDesc(e.currentTarget.value)}
            class="w-full rounded border border-zinc-300 bg-white p-2"
          />

          <div class="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowOccForm(false)}
              class="rounded border border-zinc-300 bg-white px-3 py-1 font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={busy()}
              class="rounded bg-[#93509e] px-3 py-1 font-bold text-white"
            >
              Abrir ocorrência
            </button>
          </div>
        </form>
      </Show>

      {/* Active & Historical Occurrences */}
      <Show when={props.occurrences.length > 0}>
        <div class="space-y-2">
          <p class="font-bold text-zinc-700">
            Ocorrências de Atendimento ({props.occurrences.length})
          </p>
          <For each={props.occurrences}>
            {(occ) => (
              <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span class="font-bold text-[#2E0C49]">
                      {occ.occurrence_number}
                    </span>{" "}
                    <span class="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-zinc-600">
                      {OCC_TYPES.find((t) => t[0] === occ.type)?.[1] ??
                        occ.type}
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <select
                      value={occ.status}
                      onChange={(e) =>
                        void updateOccStatus(occ.id, e.currentTarget.value)
                      }
                      class="h-7 rounded border border-zinc-300 bg-white px-1.5 text-[11px] font-semibold"
                    >
                      <For each={OCC_STATUS}>
                        {([v, l]) => <option value={v}>{l}</option>}
                      </For>
                    </select>
                    <select
                      value={occ.assigned_to?.id ?? ""}
                      onChange={(e) =>
                        void transferOcc(occ.id, e.currentTarget.value)
                      }
                      class="h-7 rounded border border-zinc-300 bg-white px-1.5 text-[11px]"
                    >
                      <option value="">Sem resp.</option>
                      <For each={staff() ?? []}>
                        {(u) => <option value={u.id}>{u.name}</option>}
                      </For>
                    </select>
                  </div>
                </div>
                <Show when={occ.product_snapshot}>
                  {(snap) => (
                    <p class="text-[11px] font-semibold text-[#93509e]">
                      Item: {snap().product_name} — {snap().variant_name} (
                      {snap().sku})
                    </p>
                  )}
                </Show>
                <p class="text-zinc-700">{occ.description}</p>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Internal Note Box */}
      <form
        onSubmit={(e) => void submitNote(e)}
        class="space-y-1.5 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
      >
        <label class="flex items-center gap-1.5 font-bold text-zinc-700">
          <MessageSquarePlus class="size-3.5 text-[#93509e]" />
          Adicionar nota interna da equipe
        </label>
        <input
          type="text"
          placeholder="Resumo do atendimento, contato via WhatsApp ou solução combinada..."
          value={noteBody()}
          onInput={(e) => setNoteBody(e.currentTarget.value)}
          class="h-8 w-full rounded border border-zinc-300 bg-white px-2.5"
        />
        <div class="flex gap-2">
          <input
            type="text"
            placeholder="Próxima ação (opcional)"
            value={noteNextAction()}
            onInput={(e) => setNoteNextAction(e.currentTarget.value)}
            class="h-8 flex-1 rounded border border-zinc-300 bg-white px-2.5"
          />
          <button
            type="submit"
            disabled={busy()}
            class="h-8 rounded bg-zinc-900 px-3 font-bold text-white"
          >
            Salvar nota
          </button>
        </div>
      </form>

      {/* Unified Timeline */}
      <div>
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p class="font-bold text-zinc-800">Histórico do Pedido</p>
          <select
            value={timelineFilter()}
            onChange={(e) => setTimelineFilter(e.currentTarget.value)}
            aria-label="Filtrar eventos da linha do tempo"
            class="h-7 rounded border border-zinc-300 bg-white px-2 text-[11px]"
          >
            <option value="all">Todos os eventos</option>
            <option value="payment">Pagamento</option>
            <option value="logistics">Logística</option>
            <option value="support">Atendimento</option>
            <option value="returns">Trocas / Devoluções</option>
            <option value="internal">Notas Internas</option>
          </select>
        </div>

        <ol class="relative ml-2 space-y-3 border-l border-[#DFC2E3] pl-4">
          <For each={filteredTimeline()}>
            {(ev) => (
              <li class="relative">
                <span class="absolute -left-[25px] top-0.5 flex size-5 items-center justify-center rounded-full border border-[#DFC2E3] bg-white">
                  {categoryIcon(ev.category)}
                </span>
                <p class="font-bold text-zinc-900">{ev.title}</p>
                <Show when={ev.description}>
                  <p class="text-[11px] text-zinc-600">{ev.description}</p>
                </Show>
                <p class="text-[10px] text-zinc-400">
                  {ev.occurred_at
                    ? new Date(ev.occurred_at).toLocaleString("pt-BR")
                    : ""}
                  {ev.actor_name ? ` • ${ev.actor_name}` : ""}
                </p>
              </li>
            )}
          </For>
        </ol>
      </div>
    </div>
  );
}
