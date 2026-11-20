import { For, Show, createSignal, onMount } from "solid-js";
import Boxes from "lucide-solid/icons/boxes";
import Check from "lucide-solid/icons/check";
import DollarSign from "lucide-solid/icons/dollar-sign";
import FileSpreadsheet from "lucide-solid/icons/file-spreadsheet";
import Play from "lucide-solid/icons/play";
import ShoppingBag from "lucide-solid/icons/shopping-bag";
import Users from "lucide-solid/icons/users";
import X from "lucide-solid/icons/x";
import { api } from "../../../lib/api";
import { formatCents } from "../../../lib/format";

export interface WholesaleOverviewData {
  kpis: {
    total_wholesale_revenue_cents: number;
    total_wholesale_discounts_cents: number;
    total_wholesale_units: number;
    distinct_wholesale_orders_count: number;
    average_wholesale_ticket_cents: number;
    active_rules_count: number;
    approved_resellers_count: number;
    pending_resellers_count: number;
  };
  recent_rules: Array<{
    id: number;
    name: string;
    status: string;
    access_mode: string;
    quantity_scope: string;
  }>;
  pending_resellers: Array<{
    id: number;
    company_name: string | null;
    phone: string | null;
    requested_at: string | null;
    user?: { name: string; email: string };
  }>;
}

export function AdminWholesaleOverview(props: {
  onNavigateTab: (tab: string) => void;
}) {
  const [data, setData] = createSignal<WholesaleOverviewData | null>(null);
  const [_loading, setLoading] = createSignal(true);
  const [actionMsg, setActionMsg] = createSignal<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: WholesaleOverviewData }>(
        "/admin/wholesale/overview",
      );
      setData(res.data);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  onMount(() => {
    void loadData();
  });

  const handleQuickApprove = async (memberId: number) => {
    try {
      await api.post(`/admin/wholesale/resellers/${memberId}/approve`, {});
      setActionMsg("Revendedor aprovado com sucesso!");
      void loadData();
    } catch {
      setActionMsg("Erro ao aprovar revendedor.");
    }
  };

  const handleQuickReject = async (memberId: number) => {
    try {
      await api.post(`/admin/wholesale/resellers/${memberId}/reject`, {
        reason: "Critérios de revenda não atendidos.",
      });
      setActionMsg("Solicitação rejeitada.");
      void loadData();
    } catch {
      setActionMsg("Erro ao rejeitar solicitação.");
    }
  };

  return (
    <div class="space-y-6">
      <Show when={actionMsg()}>
        <div class="rounded-lg border border-purple-200 bg-purple-50 p-3 text-xs font-semibold text-purple-900">
          {actionMsg()}
        </div>
      </Show>

      {/* KPI Cards */}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div class="flex items-center justify-between text-[#5B486B]">
            <span class="text-xs font-bold uppercase tracking-wider">
              Faturamento Atacado
            </span>
            <DollarSign class="size-4 text-[#93509e]" />
          </div>
          <p class="mt-2 text-2xl font-black text-[#2E0C49]">
            {formatCents(data()?.kpis.total_wholesale_revenue_cents ?? 0)}
          </p>
          <p class="mt-1 text-xs text-zinc-500">
            Ticket médio:{" "}
            {formatCents(data()?.kpis.average_wholesale_ticket_cents ?? 0)}
          </p>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div class="flex items-center justify-between text-[#5B486B]">
            <span class="text-xs font-bold uppercase tracking-wider">
              Descontos Concedidos
            </span>
            <Boxes class="size-4 text-emerald-600" />
          </div>
          <p class="mt-2 text-2xl font-black text-emerald-700">
            {formatCents(data()?.kpis.total_wholesale_discounts_cents ?? 0)}
          </p>
          <p class="mt-1 text-xs text-zinc-500">
            Em {data()?.kpis.distinct_wholesale_orders_count ?? 0} pedidos com
            atacado
          </p>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div class="flex items-center justify-between text-[#5B486B]">
            <span class="text-xs font-bold uppercase tracking-wider">
              Unidades Vendidas
            </span>
            <ShoppingBag class="size-4 text-[#93509e]" />
          </div>
          <p class="mt-2 text-2xl font-black text-[#2E0C49]">
            {data()?.kpis.total_wholesale_units ?? 0} un.
          </p>
          <p class="mt-1 text-xs text-zinc-500">
            Em {data()?.kpis.active_rules_count ?? 0} regras ativas
          </p>
        </div>

        <div class="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div class="flex items-center justify-between text-[#5B486B]">
            <span class="text-xs font-bold uppercase tracking-wider">
              Revendedores
            </span>
            <Users class="size-4 text-amber-600" />
          </div>
          <p class="mt-2 text-2xl font-black text-[#2E0C49]">
            {data()?.kpis.approved_resellers_count ?? 0}
          </p>
          <p class="mt-1 text-xs font-semibold text-amber-700">
            {data()?.kpis.pending_resellers_count ?? 0} solicitações pendentes
          </p>
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => props.onNavigateTab("rules")}
          class="inline-flex items-center gap-2 rounded-lg bg-[#93509e] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#7c3f87]"
        >
          <Boxes class="size-4" />
          <span>Gerenciar Regras de Venda</span>
        </button>
        <button
          type="button"
          onClick={() => props.onNavigateTab("bulk")}
          class="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
        >
          <FileSpreadsheet class="size-4 text-emerald-600" />
          <span>Edição em Massa (Excel)</span>
        </button>
        <button
          type="button"
          onClick={() => props.onNavigateTab("simulator")}
          class="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50"
        >
          <Play class="size-4 text-purple-600" />
          <span>Simulador de Preços</span>
        </button>
      </div>

      {/* Two Columns: Pending Approvals & Active Rules */}
      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pending Reseller Approvals */}
        <div class="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h3 class="text-sm font-bold text-[#2E0C49]">
              Revendedores Aguardando Aprovação
            </h3>
            <button
              type="button"
              onClick={() => props.onNavigateTab("resellers")}
              class="text-xs font-semibold text-[#93509e] hover:underline"
            >
              Ver todos
            </button>
          </div>

          <div class="mt-3 divide-y divide-zinc-100">
            <Show
              when={(data()?.pending_resellers.length ?? 0) > 0}
              fallback={
                <p class="py-6 text-center text-xs text-zinc-500">
                  Nenhuma solicitação de revendedor pendente no momento.
                </p>
              }
            >
              <For each={data()?.pending_resellers}>
                {(reseller) => (
                  <div class="flex items-center justify-between py-3">
                    <div>
                      <p class="text-xs font-bold text-[#2E0C49]">
                        {reseller.company_name || reseller.user?.name}
                      </p>
                      <p class="text-[11px] text-zinc-500">
                        {reseller.user?.email} • {reseller.phone}
                      </p>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleQuickApprove(reseller.id)}
                        class="inline-flex items-center gap-1 rounded bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100"
                      >
                        <Check class="size-3" />
                        <span>Aprovar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleQuickReject(reseller.id)}
                        class="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 hover:bg-red-100"
                      >
                        <X class="size-3" />
                        <span>Rejeitar</span>
                      </button>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>

        {/* Recent Rules */}
        <div class="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
          <div class="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h3 class="text-sm font-bold text-[#2E0C49]">Regras Comerciais</h3>
            <button
              type="button"
              onClick={() => props.onNavigateTab("rules")}
              class="text-xs font-semibold text-[#93509e] hover:underline"
            >
              Nova Regra
            </button>
          </div>

          <div class="mt-3 divide-y divide-zinc-100">
            <Show
              when={(data()?.recent_rules.length ?? 0) > 0}
              fallback={
                <p class="py-6 text-center text-xs text-zinc-500">
                  Nenhuma regra de atacado cadastrada.
                </p>
              }
            >
              <For each={data()?.recent_rules}>
                {(rule) => (
                  <div class="flex items-center justify-between py-3">
                    <div>
                      <p class="text-xs font-bold text-[#2E0C49]">
                        {rule.name}
                      </p>
                      <p class="text-[11px] text-zinc-500">
                        Escopo: {rule.quantity_scope} • Acesso:{" "}
                        {rule.access_mode}
                      </p>
                    </div>
                    <span
                      class={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        rule.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {rule.status === "active" ? "Ativa" : rule.status}
                    </span>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </div>
  );
}
