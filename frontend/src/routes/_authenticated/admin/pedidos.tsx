import { createFileRoute } from "@tanstack/solid-router";
import AlertTriangle from "lucide-solid/icons/triangle-exclamation-point";
import ExternalLink from "lucide-solid/icons/external-link";
import Package from "lucide-solid/icons/package";
import Plus from "lucide-solid/icons/plus";
import Printer from "lucide-solid/icons/printer";
import Search from "lucide-solid/icons/search";
import Tag from "lucide-solid/icons/tag";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import { AdminAssistedOrderBuilder } from "../../../features/admin/AdminAssistedOrderBuilder";
import { AdminLayout } from "../../../features/admin/AdminLayout";
import { AdminOrderAiAssistantPanel } from "../../../features/admin/ai/AdminOrderAiAssistantPanel";
import { OrderPrintModal } from "../../../features/admin/orders/OrderPrintModal";
import {
  AdminOrderTimelineAndAfterSales,
  type OrderOccurrenceRow,
  type TimelineEventItem,
} from "../../../features/admin/AdminOrderTimelineAndAfterSales";
import {
  formatBrlSigned,
  formatMarginPercentage,
  parseBrlNullableCost,
} from "../../../features/admin/profit-math";
import { ApiError, api } from "../../../lib/api";
import {
  assetUrl,
  formatCents,
  orderStatusLabel,
  paymentStatusLabel,
} from "../../../lib/format";
import { seoHead } from "../../../lib/seo";
import { trackRefund } from "../../../monitoring/analytics";
import { hasPermission } from "../../../security/permissions";
import { session } from "../../../security/session";

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
    image_path?: string | null;
    product_name_snapshot: string;
    variant_name_snapshot: string;
    sku_snapshot: string;
    quantity: number;
    returned_qty?: number;
    restocked_qty?: number;
    remaining_qty?: number;
    unit_price_cents?: number;
    order_discount_allocated_cents?: number;
    total_cents: number;
    net_revenue_cents?: number;
    returned_revenue_cents?: number;
    unit_cost_cents_snapshot?: number | null;
    has_cost?: boolean;
    cost_source?: string;
    cost_recorded_at?: string | null;
    cost_backfilled_at?: string | null;
    cmv_cents?: number | null;
    gross_profit_cents?: number | null;
    gross_margin_pct?: number | null;
    wholesale_rule_id?: number | null;
    wholesale_rule_name?: string | null;
    wholesale_tier_min_qty?: number | null;
    wholesale_discount_cents?: number;
  }[];
  financial_summary?: {
    is_recognized_sale: boolean;
    products_revenue_cents: number;
    covered_revenue_cents: number;
    cmv_cents: number;
    gross_profit_cents: number;
    gross_margin_pct: number | null;
    is_partial: boolean;
    missing_cost_items_count: number;
    coverage_label: string;
  } | null;
  returns?: Array<{
    id: number;
    return_type: string;
    restock_items: boolean;
    financial_refund_cents: number;
    reason: string;
    occurred_at: string;
    items: Array<{
      order_item_id: number;
      returned_qty: number;
      restocked_qty: number;
      revenue_reversed_cents: number;
      cogs_reversed_cents: number | null;
    }>;
  }>;
  shipment: {
    carrier: string | null;
    service_name: string | null;
    tracking_code: string | null;
    tracking_url: string | null;
    label_url?: string | null;
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
  const canViewProfit = createMemo(() =>
    hasPermission(session.user()?.permissions ?? [], "reports.profit.view"),
  );
  const canBackfillCost = createMemo(() =>
    hasPermission(session.user()?.permissions ?? [], "orders.cost.backfill"),
  );
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
  const [backfillTarget, setBackfillTarget] = createSignal<{
    itemId: number;
    label: string;
  } | null>(null);
  const [backfillCostInput, setBackfillCostInput] = createSignal("");
  const [backfillReason, setBackfillReason] = createSignal(
    "Preenchimento histórico autorizado pela conferência de nota fiscal",
  );
  const [backfillSaving, setBackfillSaving] = createSignal(false);
  const [returnOpen, setReturnOpen] = createSignal(false);
  const [returnQtyByItem, setReturnQtyByItem] = createSignal<
    Record<number, number>
  >({});
  const [returnRestock, setReturnRestock] = createSignal(true);
  const [returnReason, setReturnReason] = createSignal(
    "Devolução parcial / estorno administrativo",
  );
  const [refundSaving, setRefundSaving] = createSignal(false);
  const [printModalState, setPrintModalState] = createSignal<{
    orderId: number;
    mode: "label" | "packing_slip";
  } | null>(null);

  createEffect(() => {
    const s = routeSearch();
    if (
      s.filter === "ship_today" ||
      s.filter === "issues" ||
      s.filter === "wholesale"
    ) {
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

  createEffect(() => {
    const list = orders();
    if (list && list.length > 0 && selectedId() === null) {
      setSelectedId(list[0].id);
    }
  });

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

  function openPackingList(id: number) {
    setPrintModalState({ orderId: id, mode: "packing_slip" });
  }

  function openAddressLabel(id: number) {
    setPrintModalState({ orderId: id, mode: "label" });
  }

  function openReturnPanel(order: OrderDetailPayload) {
    const initialQty: Record<number, number> = {};
    for (const item of order.items) {
      initialQty[item.id] = 0;
    }
    setReturnQtyByItem(initialQty);
    setReturnRestock(true);
    setReturnReason("Devolução parcial / estorno administrativo");
    setReturnOpen(true);
  }

  async function submitPartialOrFullReturn(id: number, fullRefund = false) {
    const order = detail();
    if (!order || refundSaving()) return;
    setFeedback(null);
    setRefundSaving(true);
    try {
      const selectedItems = fullRefund
        ? []
        : Object.entries(returnQtyByItem())
            .filter(([, qty]) => qty > 0)
            .map(([orderItemId, quantity]) => ({
              order_item_id: Number(orderItemId),
              quantity,
              restock: returnRestock(),
            }));

      if (!fullRefund && selectedItems.length === 0) {
        setFeedback("Informe ao menos 1 unidade para devolução parcial.");
        setRefundSaving(false);
        return;
      }

      const reason = returnReason().trim() || "Reembolso administrativo";
      const idempotencyKey = `admin-ui:${id}:${Date.now()}`;
      const detailBefore = detail();
      await api(`/admin/orders/${id}/refund`, {
        method: "POST",
        body: {
          reason,
          restock_items: returnRestock(),
          manual_confirmation: true,
          idempotency_key: idempotencyKey,
          ...(selectedItems.length > 0 ? { items: selectedItems } : {}),
        },
      });
      if (detailBefore?.order_number) {
        trackRefund({
          transaction_id: detailBefore.order_number,
          value: (detailBefore.total_cents || 0) / 100,
          currency: "BRL",
          items: detailBefore.items.map((it) => ({
            item_id: it.sku_snapshot,
            item_name: it.product_name_snapshot,
            price: (it.unit_price_cents ?? 0) / 100,
            quantity: it.quantity,
          })),
        });
      }
      setReturnOpen(false);
      await Promise.all([refetch(), refetchDetail()]);
      setFeedback(
        selectedItems.length > 0
          ? "Devolução parcial registrada e lucro bruto recalculado."
          : "Reembolso registrado e estoque estornado quando aplicável.",
      );
    } catch (err) {
      setFeedback(
        err instanceof ApiError ? err.message : "Não foi possível reembolsar.",
      );
    } finally {
      setRefundSaving(false);
    }
  }

  async function submitBackfillCost(e: Event) {
    e.preventDefault();
    const target = backfillTarget();
    if (!target || backfillSaving()) return;
    const parsed = parseBrlNullableCost(backfillCostInput());
    if (!parsed.valid || parsed.cents === null) {
      setFeedback("Informe um custo histórico válido (ex.: 12,00 ou 0,00).");
      return;
    }
    setBackfillSaving(true);
    setFeedback(null);
    try {
      await api(`/admin/orders/items/${target.itemId}/backfill-cost`, {
        method: "POST",
        body: {
          unit_cost_cents: parsed.cents,
          reason: backfillReason().trim(),
        },
      });
      setBackfillTarget(null);
      setBackfillCostInput("");
      await Promise.all([refetch(), refetchDetail()]);
      setFeedback("Custo histórico registrado e lucro do pedido atualizado.");
    } catch (err) {
      setFeedback(
        err instanceof ApiError
          ? err.message
          : "Não foi possível registrar custo histórico.",
      );
    } finally {
      setBackfillSaving(false);
    }
  }

  return (
    <AdminLayout
      title="Pedidos e Expedição"
      subtitle="Acompanhe pagamentos, imprima romaneios e informe códigos de rastreio"
      permission="orders.view"
      headerActions={
        <button
          type="button"
          onClick={() => setAssistedOpen((v) => !v)}
          class="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#93509e] px-3.5 text-xs font-bold text-white shadow-xs hover:bg-[#7c3f87] transition-all"
        >
          <Plus class="size-3.5" />
          <span>
            {assistedOpen()
              ? "Fechar Pedido Assistido"
              : "Criar pedido assistido (WhatsApp)"}
          </span>
        </button>
      }
    >
      {/* Filter Tabs, Operational Queues, Assisted Orders & Search */}
      <div class="mb-5 space-y-3">
        <div class="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-zinc-200/80 bg-white p-1.5 shadow-2xs scrollbar-none">
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
                class={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                  !opFilter() && statusFilter() === tab.id
                    ? "bg-[#93509e] text-white shadow-xs"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                }`}
              >
                {tab.label}
              </button>
            )}
          </For>

          <span class="mx-1 h-4 w-px shrink-0 bg-zinc-200" aria-hidden="true" />

          <button
            type="button"
            onClick={() =>
              setOpFilter((prev) =>
                prev === "ship_today" ? "" : "ship_today",
              )
            }
            class={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all ${
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
            class={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all ${
              opFilter() === "issues"
                ? "bg-red-700 text-white shadow-xs"
                : "bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            <AlertTriangle class="size-3.5" />
            <span>Com problemas</span>
          </button>
          <button
            type="button"
            onClick={() =>
              setOpFilter((prev) => (prev === "wholesale" ? "" : "wholesale"))
            }
            class={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-all ${
              opFilter() === "wholesale"
                ? "bg-purple-800 text-white shadow-xs"
                : "bg-purple-50 text-purple-800 hover:bg-purple-100"
            }`}
          >
            <span>Atacado</span>
          </button>
        </div>

        <Show when={assistedOpen()}>
          <AdminAssistedOrderBuilder
            onClose={() => setAssistedOpen(false)}
            onConverted={() => void refetch()}
          />
        </Show>

        <div class="relative">
          <Search class="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            placeholder="Buscar por número do pedido, nome do cliente ou e-mail..."
            value={searchTerm()}
            onInput={(e) => setSearchTerm(e.currentTarget.value)}
            class="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-4 text-sm placeholder-zinc-400 shadow-2xs focus:border-[#93509e] focus:outline-none focus:ring-2 focus:ring-[#93509e]/20"
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
                <For
                  each={orders() ?? []}
                  fallback={
                    <tr>
                      <td colspan="4" class="p-8 text-center text-sm text-zinc-500">
                        Nenhum pedido encontrado para os filtros selecionados.
                      </td>
                    </tr>
                  }
                >
                  {(ord) => (
                    <tr
                      onClick={() => setSelectedId(ord.id)}
                      class={`cursor-pointer transition-colors ${
                        selectedId() === ord.id
                          ? "bg-[#faf4fb] border-l-4 border-l-[#93509e]"
                          : "hover:bg-zinc-50 border-l-4 border-l-transparent"
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
                <div class="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between border-b border-zinc-200 pb-3">
                  <div>
                    <h2 class="text-lg font-bold text-zinc-900">
                      {d().order_number}
                    </h2>
                    <p class="text-xs text-zinc-500">
                      {d().customer_name} · {d().customer_email} ·{" "}
                      {d().customer_phone}
                    </p>
                  </div>
                  <div class="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openAddressLabel(d().id)}
                      class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 hover:text-zinc-900 transition"
                      title="Imprimir etiqueta de endereço (100 × 150 mm) para embalagem"
                    >
                      <Tag class="h-3.5 w-3.5 text-[#93509e]" />
                      <span>Imprimir etiqueta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openPackingList(d().id)}
                      class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-700 shadow-2xs hover:bg-zinc-50 hover:text-zinc-900 transition"
                      title="Imprimir romaneio de separação de itens"
                    >
                      <Printer class="h-3.5 w-3.5 text-zinc-600" />
                      <span>Imprimir romaneio</span>
                    </button>
                    <Show when={d().shipment?.label_url}>
                      <a
                        href={d().shipment?.label_url!}
                        target="_blank"
                        rel="noreferrer"
                        class="inline-flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1.5 text-xs font-semibold text-[#93509e] hover:bg-purple-100 transition"
                        title="Imprimir etiqueta oficial de postagem da transportadora"
                      >
                        <ExternalLink class="h-3.5 w-3.5" />
                        <span>Etiqueta oficial</span>
                      </a>
                    </Show>
                  </div>
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

                <Show when={canViewProfit() && d().financial_summary}>
                  {(summary) => (
                    <div class="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <span class="font-bold text-zinc-900">
                          Apuração de lucro bruto (pedido)
                        </span>
                        <span
                          class={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                            summary().is_partial
                              ? "bg-amber-100 text-amber-900"
                              : summary().is_recognized_sale
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-zinc-200 text-zinc-700"
                          }`}
                        >
                          {summary().is_recognized_sale
                            ? summary().coverage_label
                            : "Pedido pendente — fora dos totais do painel"}
                        </span>
                      </div>
                      <dl class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div>
                          <dt class="text-[11px] text-zinc-500">Receita produtos</dt>
                          <dd class="font-semibold text-zinc-900">
                            {formatCents(summary().products_revenue_cents)}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-[11px] text-zinc-500">CMV histórico</dt>
                          <dd class="font-semibold text-zinc-900">
                            {formatCents(summary().cmv_cents)}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-[11px] text-zinc-500">Lucro bruto</dt>
                          <dd
                            class={`font-bold ${
                              summary().gross_profit_cents < 0
                                ? "text-red-700"
                                : "text-emerald-700"
                            }`}
                          >
                            {formatBrlSigned(summary().gross_profit_cents)}
                          </dd>
                        </div>
                        <div>
                          <dt class="text-[11px] text-zinc-500">Margem bruta</dt>
                          <dd class="font-semibold text-zinc-900">
                            {formatMarginPercentage(summary().gross_margin_pct)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </Show>

                <div>
                  <h3 class="mb-2 text-xs font-bold uppercase text-zinc-500">
                    Itens
                  </h3>
                  <ul class="space-y-2 text-xs">
                    <For each={d().items}>
                      {(item) => (
                        <li class="rounded-md border border-zinc-100 bg-zinc-50/70 px-2.5 py-2">
                          <div class="flex items-start justify-between gap-2.5">
                            <div class="flex min-w-0 flex-1 items-start gap-2.5">
                              <OrderItemThumb
                                src={item.image_path}
                                alt={item.product_name_snapshot}
                              />
                              <div class="min-w-0 flex-1 pt-0.5">
                                <span class="font-medium text-zinc-900">
                                  {item.quantity}x {item.product_name_snapshot}{" "}
                                  ({item.variant_name_snapshot})
                                </span>
                                <span class="ml-1.5 font-mono text-[10px] text-zinc-500">
                                  {item.sku_snapshot}
                                </span>
                                <Show when={item.wholesale_rule_name}>
                                  <span class="ml-2 inline-flex items-center rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-[#7C2784]">
                                    Atacado ({item.wholesale_tier_min_qty}+ un.)
                                  </span>
                                </Show>
                                <Show when={(item.returned_qty ?? 0) > 0}>
                                  <span class="ml-2 inline-flex items-center rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                    Devolvido: {item.returned_qty} un.
                                    (Estocado: {item.restocked_qty ?? 0})
                                  </span>
                                </Show>
                              </div>
                            </div>
                            <span class="shrink-0 pt-0.5 font-semibold text-zinc-900 tabular-nums">
                              {formatCents(
                                item.net_revenue_cents ?? item.total_cents,
                              )}
                            </span>
                          </div>

                          <Show when={canViewProfit()}>
                            <div class="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200/70 pt-1 text-[11px]">
                              <Show
                                when={
                                  item.has_cost &&
                                  item.unit_cost_cents_snapshot !== null &&
                                  item.unit_cost_cents_snapshot !== undefined
                                }
                                fallback={
                                  <span class="font-medium text-amber-700">
                                    Custo histórico: Custo não informado
                                  </span>
                                }
                              >
                                <span class="text-zinc-600">
                                  Custo unit. histórico:{" "}
                                  <strong class="text-zinc-800">
                                    {formatCents(
                                      item.unit_cost_cents_snapshot ?? 0,
                                    )}
                                  </strong>{" "}
                                  • Lucro:{" "}
                                  <strong
                                    class={
                                      (item.gross_profit_cents ?? 0) < 0
                                        ? "text-red-700"
                                        : "text-emerald-700"
                                    }
                                  >
                                    {formatBrlSigned(
                                      item.gross_profit_cents ?? 0,
                                    )}
                                  </strong>{" "}
                                  ({formatMarginPercentage(item.gross_margin_pct)})
                                  <Show when={item.cost_backfilled_at}>
                                    <span class="ml-1 text-zinc-500">
                                      · preenchido manualmente
                                    </span>
                                  </Show>
                                </span>
                              </Show>

                              <Show
                                when={!item.has_cost && canBackfillCost()}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setBackfillTarget({
                                      itemId: item.id,
                                      label: `${item.product_name_snapshot} (${item.sku_snapshot})`,
                                    });
                                    setBackfillCostInput("");
                                  }}
                                  class="rounded border border-[#93509e]/40 px-2 py-0.5 text-[11px] font-semibold text-[#7C2784] hover:bg-purple-50"
                                >
                                  Preencher custo histórico
                                </button>
                              </Show>
                            </div>
                          </Show>
                        </li>
                      )}
                    </For>
                  </ul>
                </div>

                <Show when={backfillTarget()}>
                  {(target) => (
                    <form
                      onSubmit={(e) => void submitBackfillCost(e)}
                      class="space-y-2 rounded-lg border border-[#93509e]/30 bg-purple-50/40 p-3 text-xs"
                    >
                      <div class="flex items-center justify-between">
                        <strong class="text-zinc-900">
                          Preenchimento histórico — {target().label}
                        </strong>
                        <button
                          type="button"
                          onClick={() => setBackfillTarget(null)}
                          class="text-zinc-500 hover:text-zinc-900"
                        >
                          Fechar
                        </button>
                      </div>
                      <p class="text-[11px] text-zinc-600">
                        Grava exclusivamente no histórico deste item do pedido
                        sem alterar o cadastro atual do produto.
                      </p>
                      <div class="grid gap-2 sm:grid-cols-3">
                        <input
                          type="text"
                          required
                          placeholder="Custo unit. (R$) ex: 12,00"
                          value={backfillCostInput()}
                          onInput={(e) =>
                            setBackfillCostInput(e.currentTarget.value)
                          }
                          class="h-8 rounded border border-zinc-300 bg-white px-2 text-xs"
                        />
                        <input
                          type="text"
                          required
                          placeholder="Motivo auditado"
                          value={backfillReason()}
                          onInput={(e) =>
                            setBackfillReason(e.currentTarget.value)
                          }
                          class="h-8 rounded border border-zinc-300 bg-white px-2 text-xs sm:col-span-2"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={backfillSaving()}
                        class="rounded bg-[#93509e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#7c3f87] disabled:opacity-50"
                      >
                        {backfillSaving()
                          ? "Salvando..."
                          : "Registrar custo histórico auditado"}
                      </button>
                    </form>
                  )}
                </Show>

                <Show when={d().payments?.[0]}>
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

                <Show when={(d().returns?.length ?? 0) > 0}>
                  <div class="border-t border-zinc-200 pt-3">
                    <h4 class="mb-1.5 text-[11px] font-bold uppercase text-zinc-500">
                      Histórico de devoluções e estornos
                    </h4>
                    <ul class="space-y-1.5 text-[11px]">
                      <For each={d().returns ?? []}>
                        {(ret) => (
                          <li class="rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1.5">
                            <div class="flex flex-wrap justify-between gap-2 font-medium text-zinc-800">
                              <span>
                                {ret.reason} • Estorno financeiro:{" "}
                                {formatCents(ret.financial_refund_cents)}
                              </span>
                              <span class="text-zinc-500">
                                {ret.restock_items
                                  ? "Com retorno ao estoque físico"
                                  : "Somente financeiro (sem retorno ao estoque)"}
                              </span>
                            </div>
                          </li>
                        )}
                      </For>
                    </ul>
                  </div>
                </Show>

                <div class="border-t border-zinc-200 pt-4 space-y-3">
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openReturnPanel(d())}
                      class="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                    >
                      Devolução parcial / Estorno
                    </button>
                  </div>

                  <Show when={returnOpen()}>
                    <div class="space-y-2.5 rounded-lg border border-red-200 bg-red-50/40 p-3 text-xs">
                      <div class="flex items-center justify-between">
                        <strong class="text-zinc-900">
                          Registrar devolução ou reembolso
                        </strong>
                        <button
                          type="button"
                          onClick={() => setReturnOpen(false)}
                          class="text-zinc-500 hover:text-zinc-900"
                        >
                          Cancelar
                        </button>
                      </div>
                      <div class="space-y-1.5">
                        <For each={d().items}>
                          {(item) => {
                            const maxQty = Math.max(
                              0,
                              item.remaining_qty ??
                                item.quantity - (item.returned_qty ?? 0),
                            );
                            return (
                              <div class="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5">
                                <div class="flex min-w-0 items-center gap-2">
                                  <OrderItemThumb
                                    src={item.image_path}
                                    alt={item.product_name_snapshot}
                                    size="sm"
                                  />
                                  <span class="min-w-0 truncate text-zinc-800">
                                    {item.product_name_snapshot} (
                                    {item.variant_name_snapshot}) · disp.:{" "}
                                    {maxQty}
                                  </span>
                                </div>
                                <input
                                  type="number"
                                  min={0}
                                  max={maxQty}
                                  value={returnQtyByItem()[item.id] ?? 0}
                                  onInput={(e) => {
                                    const next = Math.min(
                                      maxQty,
                                      Math.max(
                                        0,
                                        Number(e.currentTarget.value || 0),
                                      ),
                                    );
                                    setReturnQtyByItem((prev) => ({
                                      ...prev,
                                      [item.id]: next,
                                    }));
                                  }}
                                  class="h-7 w-16 rounded border border-zinc-300 px-1.5 text-center"
                                />
                              </div>
                            );
                          }}
                        </For>
                      </div>
                      <label class="flex items-center gap-2 text-zinc-700">
                        <input
                          type="checkbox"
                          checked={returnRestock()}
                          onChange={(e) =>
                            setReturnRestock(e.currentTarget.checked)
                          }
                        />
                        Devolver fisicamente ao estoque (desmarque para perda /
                        reembolso apenas financeiro)
                      </label>
                      <input
                        type="text"
                        placeholder="Motivo da devolução/estorno"
                        value={returnReason()}
                        onInput={(e) => setReturnReason(e.currentTarget.value)}
                        class="h-8 w-full rounded border border-zinc-300 bg-white px-2 text-xs"
                      />
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={refundSaving()}
                          onClick={() =>
                            void submitPartialOrFullReturn(d().id, false)
                          }
                          class="rounded-md bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                        >
                          {refundSaving()
                            ? "Processando..."
                            : "Confirmar devolução selecionada"}
                        </button>
                        <button
                          type="button"
                          disabled={refundSaving()}
                          onClick={() =>
                            void submitPartialOrFullReturn(d().id, true)
                          }
                          class="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Estornar pedido integralmente
                        </button>
                      </div>
                    </div>
                  </Show>
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

      <Show when={printModalState()}>
        {(state) => (
          <OrderPrintModal
            orderId={state().orderId}
            initialMode={state().mode}
            onClose={() => setPrintModalState(null)}
          />
        )}
      </Show>
    </AdminLayout>
  );
}

function OrderItemThumb(props: {
  src?: string | null;
  alt: string;
  size?: "sm" | "md";
}) {
  const [failed, setFailed] = createSignal(false);
  const resolved = () => {
    const raw = (props.src ?? "").trim();
    if (!raw || raw.toLowerCase().includes("placeholder-product.svg")) {
      return "";
    }
    return assetUrl(raw);
  };

  createEffect(() => {
    // Reset failed flag whenever src changes across selected orders
    if (props.src !== undefined) setFailed(false);
  });

  const boxCls = () =>
    props.size === "sm"
      ? "h-8 w-8 rounded-md"
      : "h-11 w-11 rounded-lg";

  return (
    <Show
      when={resolved() && !failed()}
      fallback={
        <div
          aria-hidden="true"
          title="Produto sem imagem cadastrada"
          class={`grid shrink-0 place-items-center border border-zinc-200 bg-zinc-100 text-zinc-400 ${boxCls()}`}
        >
          <Package class={props.size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        </div>
      }
    >
      <img
        src={resolved()}
        alt={props.alt}
        loading="lazy"
        onError={() => setFailed(true)}
        class={`shrink-0 border border-zinc-200 bg-white object-contain p-0.5 ${boxCls()}`}
      />
    </Show>
  );
}
