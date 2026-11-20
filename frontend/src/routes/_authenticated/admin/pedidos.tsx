import { createFileRoute } from "@tanstack/solid-router";
import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import Plus from "lucide-solid/icons/plus";
import Printer from "lucide-solid/icons/printer";
import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
} from "solid-js";
import { AdminAssistedOrderBuilder } from "../../../features/admin/AdminAssistedOrderBuilder";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminOrderAiAssistantPanel } from "../../../features/admin/ai/AdminOrderAiAssistantPanel";
import {
  AdminOrderTimelineAndAfterSales,
  type OrderOccurrenceRow,
  type TimelineEventItem,
} from "../../../features/admin/AdminOrderTimelineAndAfterSales";
import { ApiError, api } from "../../../lib/api";
import {
  formatCents,
  orderStatusLabel,
  paymentStatusLabel,
} from "../../../lib/format";
import { seoHead } from "../../../lib/seo";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  validateSearch: (raw: Record<string, unknown>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string" && v !== "") out[k] = v;
      else if (typeof v === "number") out[k] = String(v);
    }
    return out;
  },
  head: () =>
    seoHead({
      title: "Pedidos — Admin Mistura Feminina",
      description: "Gestão de pedidos, expedição, rastreio e estornos.",
      path: "/admin/pedidos",
      noindex: true,
    }),
  component: AdminOrdersPage,
});

interface AdminOrderRow {
  id: number;
  order_number: string;
  customer_name: string;
  customer_email: string;
  total_cents: number;
  status: string;
  has_issue?: boolean;
  open_occurrences_count?: number;
  assisted_order_id?: number | null;
  created_at: string;
  latest_payment?: { method: string; status: string } | null;
  shipment?: { carrier: string | null; tracking_code: string | null } | null;
}

interface OrderDetailPayload {
  id: number;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  status: string;
  has_issue?: boolean;
  issue_reason?: string | null;
  assisted_order?: { id: number; order_code: string } | null;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  total_cents: number;
  shipping_address_snapshot: Record<string, string>;
  items: {
    id: number;
    product_name_snapshot: string;
    variant_name_snapshot: string;
    sku_snapshot: string;
    quantity: number;
    total_cents: number;
  }[];
  shipment: {
    carrier: string | null;
    service_name: string | null;
    tracking_code: string | null;
    tracking_url: string | null;
  } | null;
  payments: {
    id: number;
    method: string;
    status: string;
    gross_amount_cents: number;
  }[];
  timeline?: TimelineEventItem[];
  occurrences?: OrderOccurrenceRow[];
}

function AdminOrdersPage() {
  const routeSearch = Route.useSearch();
  const [statusFilter, setStatusFilter] = createSignal("");
  const [opFilter, setOpFilter] = createSignal("");
  const [assistedOpen, setAssistedOpen] = createSignal(false);
  const [searchTerm, setSearchTerm] = createSignal("");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [newStatus, setNewStatus] = createSignal("preparing");
  const [statusNote, setStatusNote] = createSignal("");
  const [carrier, setCarrier] = createSignal("Correios");
  const [trackingCode, setTrackingCode] = createSignal("");
  const [trackingUrl, setTrackingUrl] = createSignal("");
  const [feedback, setFeedback] = createSignal<string | null>(null);

  createEffect(() => {
    const s = routeSearch();
    if (s.filter === "ship_today" || s.filter === "issues") {
      setOpFilter(s.filter);
    }
    if (s.order && Number.isFinite(Number(s.order))) {
      setSelectedId(Number(s.order));
    }
    if (s.mode === "assisted") {
      setAssistedOpen(true);
    }
  });

  const [orders, { refetch }] = createResource(
    () => ({
      status: statusFilter(),
      filter: opFilter(),
      search: searchTerm(),
    }),
    async (f) => {
      const qs = new URLSearchParams();
      if (f.status) qs.set("status", f.status);
      if (f.filter) qs.set("filter", f.filter);
      if (f.search) qs.set("search", f.search);
      const res = await api<{ data: AdminOrderRow[] }>(
        `/admin/orders?${qs.toString()}`,
      );
      return res.data ?? [];
    },
  );

  const [detail, { refetch: refetchDetail }] = createResource(
    selectedId,
    async (id) => {
      const res = await api<{ data: OrderDetailPayload }>(
        `/admin/orders/${id}`,
      );
      if (res.data.shipment?.tracking_code) {
        setTrackingCode(res.data.shipment.tracking_code);
      } else {
        setTrackingCode("");
      }
      if (res.data.shipment?.carrier) setCarrier(res.data.shipment.carrier);
      setNewStatus(res.data.status);
      return res.data;
    },
  );

  async function saveStatus(e: Event) {
    e.preventDefault();
    const id = selectedId();
    if (!id) return;
    setFeedback(null);
    try {
      await api(`/admin/orders/${id}/status`, {
        method: "PATCH",
        body: { status: newStatus(), note: statusNote().trim() || undefined },
      });
      setStatusNote("");
      await Promise.all([refetch(), refetchDetail()]);
      setFeedback("Status do pedido atualizado.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao atualizar status.",
      );
    }
  }

  async function saveShipment(e: Event) {
    e.preventDefault();
    const id = selectedId();
    if (!id || !trackingCode().trim()) return;
    setFeedback(null);
    try {
      await api(`/admin/orders/${id}/shipment`, {
        method: "PATCH",
        body: {
          carrier: carrier().trim(),
          tracking_code: trackingCode().trim(),
          tracking_url: trackingUrl().trim() || undefined,
          mark_shipped: true,
        },
      });
      await Promise.all([refetch(), refetchDetail()]);
      setFeedback("Rastreio salvo e pedido marcado como enviado.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Erro ao salvar rastreio.",
      );
    }
  }

  async function openPackingList(id: number) {
    const res = await api<{
      data: {
        order_number: string;
        customer_name: string;
        items: { sku: string; name: string; variant: string; qty: number }[];
      };
    }>(`/admin/orders/${id}/packing-list`);
    const w = window.open("", "_blank", "width=700,height=700");
    if (!w) return;
    const rows = res.data.items
      .map(
        (i) =>
          `<tr><td>${i.sku}</td><td>${i.name} (${i.variant})</td><td>${i.qty}</td></tr>`,
      )
      .join("");
    w.document.write(
      `<!doctype html><html><head><title>Romaneio ${res.data.order_number}</title><style>body{font-family:sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ccc;padding:8px;text-align:left}</style></head><body><h1>Mistura Feminina Cosméticos — Romaneio ${res.data.order_number}</h1><p>Cliente: ${res.data.customer_name}</p><table><thead><tr><th>SKU</th><th>Produto</th><th>Qtd</th></tr></thead><tbody>${rows}</tbody></table></body></html>`,
    );
    w.document.close();
  }

  async function requestRefund(id: number) {
    setFeedback(null);
    try {
      await api(`/admin/orders/${id}/refund`, {
        method: "POST",
        body: { reason: "Reembolso administrativo" },
      });
      await Promise.all([refetch(), refetchDetail()]);
      setFeedback("Reembolso registrado e estoque estornado quando aplicável.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Não foi possível reembolsar.",
      );
    }
  }

  return (
    <AdminLayout
      title="Pedidos e Expedição"
      subtitle="Acompanhe pagamentos, imprima romaneios e informe códigos de rastreio"
      permission="orders.view"
    >
      {/* Filter Tabs, Operational Queues, Assisted Orders & Search */}
      <div class="mb-5 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white p-1.5 shadow-2xs">
            <For
              each={[
                { id: "", label: "Todos os Pedidos" },
                { id: "paid", label: "Para Separar (Pago)" },
                { id: "preparing", label: "Em Separação" },
                { id: "shipped", label: "Enviados" },
                { id: "delivered", label: "Entregues" },
                { id: "pending_payment", label: "Aguardando Pagamento" },
                { id: "cancelled", label: "Cancelados" },
              ]}
            >
              {(tab) => (
                <button
                  type="button"
                  onClick={() => {
                    setOpFilter("");
                    setStatusFilter(tab.id);
                  }}
                  class={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    !opFilter() && statusFilter() === tab.id
                      ? "bg-[#93509e] text-white shadow-xs"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                  }`}
                >
                  {tab.label}
                </button>
              )}
            </For>

            <span class="mx-1 h-4 w-px bg-zinc-200" aria-hidden="true" />

            <button
              type="button"
              onClick={() =>
                setOpFilter((prev) =>
                  prev === "ship_today" ? "" : "ship_today",
                )
              }
              class={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                opFilter() === "ship_today"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              }`}
            >
              Para postar hoje
            </button>
            <button
              type="button"
              onClick={() =>
                setOpFilter((prev) => (prev === "issues" ? "" : "issues"))
              }
              class={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                opFilter() === "issues"
                  ? "bg-red-700 text-white shadow-xs"
                  : "bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              <AlertTriangle class="size-3.5" />
              Com problemas
            </button>
          </div>

          <button
            type="button"
            onClick={() => setAssistedOpen((v) => !v)}
            class="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[#93509e] px-4 text-xs font-bold text-white shadow-xs hover:bg-[#7c3f87]"
          >
            <Plus class="size-4" />
            {assistedOpen()
              ? "Fechar Pedido Assistido"
              : "Criar pedido assistido (WhatsApp)"}
          </button>
        </div>

        <Show when={assistedOpen()}>
          <AdminAssistedOrderBuilder
            onClose={() => setAssistedOpen(false)}
            onConverted={() => void refetch()}
          />
        </Show>

        <div class="relative">
          <input
            type="search"
            placeholder="Buscar por número do pedido, nome do cliente ou e-mail..."
            value={searchTerm()}
            onInput={(e) => setSearchTerm(e.currentTarget.value)}
            class="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-sm placeholder-zinc-400 shadow-2xs focus:border-[#93509e] focus:outline-none focus:ring-2 focus:ring-[#93509e]/20"
          />
        </div>
      </div>

      <Show when={feedback()}>
        <p
          role="status"
          class="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800"
        >
          {feedback()}
        </p>
      </Show>

      <div class="grid gap-6 lg:grid-cols-12">
        <section class="overflow-hidden rounded-xl border border-zinc-200 bg-white lg:col-span-7">
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th class="p-3">Pedido</th>
                  <th class="p-3">Cliente</th>
                  <th class="p-3">Status</th>
                  <th class="p-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100">
                <For each={orders() ?? []}>
                  {(ord) => (
                    <tr
                      onClick={() => setSelectedId(ord.id)}
                      class={`cursor-pointer hover:bg-zinc-50 ${
                        selectedId() === ord.id ? "bg-zinc-100" : ""
                      }`}
                    >
                      <td class="p-3 font-bold text-zinc-900">
                        <div>{ord.order_number}</div>
                        <div class="mt-0.5 flex flex-wrap gap-1">
                          <Show
                            when={
                              ord.has_issue ||
                              (ord.open_occurrences_count ?? 0) > 0
                            }
                          >
                            <span class="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                              Problema ({ord.open_occurrences_count ?? 1})
                            </span>
                          </Show>
                          <Show when={ord.assisted_order_id}>
                            <span class="rounded bg-[#F3E2F6] px-1.5 py-0.5 text-[10px] font-bold text-[#93509e]">
                              Assistido
                            </span>
                          </Show>
                        </div>
                      </td>
                      <td class="p-3">
                        <p class="font-medium text-zinc-900">
                          {ord.customer_name}
                        </p>
                        <p class="text-xs text-zinc-500">
                          {ord.customer_email}
                        </p>
                      </td>
                      <td class="p-3">
                        <span class="rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold">
                          {orderStatusLabel(ord.status)}
                        </span>
                      </td>
                      <td class="p-3 text-right font-bold">
                        {formatCents(ord.total_cents)}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </section>

        <section class="rounded-xl border border-zinc-200 bg-white p-5 lg:col-span-5">
          <Show
            when={detail()}
            fallback={
              <p class="text-sm text-zinc-500">
                Clique em um pedido na lista ao lado para visualizar itens,
                endereço e ações de expedição.
              </p>
            }
          >
            {(d) => (
              <div class="space-y-5 text-sm">
                <div class="flex items-start justify-between border-b border-zinc-200 pb-3">
                  <div>
                    <h2 class="text-lg font-bold text-zinc-900">
                      {d().order_number}
                    </h2>
                    <p class="text-xs text-zinc-500">
                      {d().customer_name} · {d().customer_email} ·{" "}
                      {d().customer_phone}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openPackingList(d().id)}
                    class="inline-flex items-center gap-1 rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-zinc-50"
                  >
                    <Printer class="h-3.5 w-3.5" />
                    Romaneio
                  </button>
                </div>

                <div class="rounded-lg bg-zinc-50 p-3 text-xs">
                  <p class="font-bold text-zinc-800">Endereço de entrega</p>
                  <p class="mt-0.5 text-zinc-600">
                    {d().shipping_address_snapshot?.street},{" "}
                    {d().shipping_address_snapshot?.number} ·{" "}
                    {d().shipping_address_snapshot?.neighborhood} ·{" "}
                    {d().shipping_address_snapshot?.city}/
                    {d().shipping_address_snapshot?.state} · CEP{" "}
                    {d().shipping_address_snapshot?.cep}
                  </p>
                </div>

                <div>
                  <h3 class="mb-2 text-xs font-bold uppercase text-zinc-500">
                    Itens
                  </h3>
                  <ul class="space-y-1.5 text-xs">
                    <For each={d().items}>
                      {(item) => (
                        <li class="flex justify-between">
                          <span>
                            {item.quantity}x {item.product_name_snapshot} (
                            {item.variant_name_snapshot})
                          </span>
                          <span class="font-semibold">
                            {formatCents(item.total_cents)}
                          </span>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>

                <Show when={d().payments[0]}>
                  {(pay) => (
                    <div class="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-xs">
                      <span>
                        Pagamento: <strong>{pay().method.toUpperCase()}</strong>{" "}
                        ({paymentStatusLabel(pay().status)})
                      </span>
                      <span class="font-bold">
                        {formatCents(pay().gross_amount_cents)}
                      </span>
                    </div>
                  )}
                </Show>

                <form
                  onSubmit={saveStatus}
                  class="space-y-2 border-t border-zinc-200 pt-4"
                >
                  <h3 class="text-xs font-bold uppercase text-zinc-500">
                    Alterar Status
                  </h3>
                  <select
                    value={newStatus()}
                    onChange={(e) => setNewStatus(e.currentTarget.value)}
                    class="h-9 w-full rounded-md border border-zinc-300 bg-white px-2.5 text-sm"
                  >
                    <option value="pending_payment">
                      Aguardando pagamento
                    </option>
                    <option value="paid">Pago</option>
                    <option value="preparing">Em separação</option>
                    <option value="shipped">Enviado</option>
                    <option value="delivered">Entregue</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Observação do andamento (opcional)"
                    value={statusNote()}
                    onInput={(e) => setStatusNote(e.currentTarget.value)}
                    class="h-9 w-full rounded-md border border-zinc-300 px-2.5 text-xs"
                  />
                  <button
                    type="submit"
                    class="h-9 rounded-md bg-zinc-900 px-4 text-xs font-semibold text-white"
                  >
                    Atualizar status
                  </button>
                </form>

                <form
                  onSubmit={saveShipment}
                  class="space-y-2 border-t border-zinc-200 pt-4"
                >
                  <h3 class="text-xs font-bold uppercase text-zinc-500">
                    Código de Rastreio
                  </h3>
                  <div class="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Transportadora"
                      value={carrier()}
                      onInput={(e) => setCarrier(e.currentTarget.value)}
                      class="h-9 rounded-md border border-zinc-300 px-2.5 text-xs"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Código (ex.: BR123456789)"
                      value={trackingCode()}
                      onInput={(e) => setTrackingCode(e.currentTarget.value)}
                      class="h-9 rounded-md border border-zinc-300 px-2.5 text-xs uppercase"
                    />
                  </div>
                  <input
                    type="url"
                    placeholder="URL de rastreio (opcional)"
                    value={trackingUrl()}
                    onInput={(e) => setTrackingUrl(e.currentTarget.value)}
                    class="h-9 w-full rounded-md border border-zinc-300 px-2.5 text-xs"
                  />
                  <button
                    type="submit"
                    class="h-9 rounded-md bg-[var(--mf-primary)] px-4 text-xs font-semibold text-white"
                  >
                    Salvar rastreio e marcar como enviado
                  </button>
                </form>

                <div class="border-t border-zinc-200 pt-4">
                  <button
                    type="button"
                    onClick={() => void requestRefund(d().id)}
                    class="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Reembolsar / Estornar pedido
                  </button>
                </div>

                <div class="border-t border-zinc-200 pt-4">
                  <AdminOrderAiAssistantPanel
                    orderId={d().id}
                    onNoteSaved={() =>
                      Promise.all([refetch(), refetchDetail()]).then(
                        () => undefined,
                      )
                    }
                  />
                </div>

                <div class="border-t border-zinc-200 pt-4">
                  <Show when={d().assisted_order}>
                    {(ao) => (
                      <p class="mb-3 rounded-lg border border-[#DFC2E3] bg-[#FCF8FD] px-3 py-2 text-xs font-semibold text-[#93509e]">
                        Originado do pedido assistido{" "}
                        <span class="font-mono">{ao().order_code}</span>
                      </p>
                    )}
                  </Show>
                  <AdminOrderTimelineAndAfterSales
                    orderId={d().id}
                    hasIssue={d().has_issue}
                    items={d().items}
                    timeline={d().timeline ?? []}
                    occurrences={d().occurrences ?? []}
                    onRefresh={() =>
                      Promise.all([refetch(), refetchDetail()]).then(
                        () => undefined,
                      )
                    }
                  />
                </div>
              </div>
            )}
          </Show>
        </section>
      </div>
    </AdminLayout>
  );
}
