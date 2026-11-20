import { For, Show, createResource, createSignal } from "solid-js";
import BellRing from "lucide-solid/icons/bell-ring";
import ClipboardList from "lucide-solid/icons/clipboard-list";
import RefreshCw from "lucide-solid/icons/refresh-cw";
import { api } from "@/lib/api";

interface RestockSummaryPayload {
  kpis: {
    pending_count: number;
    notified_count: number;
    failed_count: number;
    cancelled_count: number;
    demanded_variants_count: number;
    whatsapp_configured: boolean;
  };
  demand_ranking: Array<{
    product_id: number;
    product_variant_id: number | null;
    product_name: string;
    product_slug: string;
    brand_name: string | null;
    variant_name: string;
    shade_code: string | null;
    sku: string;
    available_stock: number;
    waiting_count: number;
    oldest_request_at: string | null;
  }>;
  requests: {
    data: Array<{
      id: number;
      product: { id: number; name: string; brand: string | null } | null;
      variant: {
        id: number;
        name: string;
        shade_code: string | null;
        sku: string;
        available_stock: number;
      } | null;
      channel: string;
      contact_masked: string;
      status: string;
      notified_at: string | null;
      created_at: string | null;
    }>;
  };
}

interface ReplenishmentInsightsPayload {
  lists_total: number;
  items_total: number;
  top_variants: Array<{
    variant_id: number;
    product_id: number;
    product_name: string;
    variant_name: string;
    shade_code: string | null;
    sku: string;
    available_stock: number;
    lists_count: number;
    total_desired_qty: number;
  }>;
}

export function AdminRestockAnalyticsPanel() {
  const [statusFilter, setStatusFilter] = createSignal("");
  const [searchFilter, setSearchFilter] = createSignal("");

  const [summary, { refetch: refetchSummary }] = createResource(
    () => ({ status: statusFilter(), search: searchFilter() }),
    async (f) => {
      const params = new URLSearchParams();
      if (f.status) params.set("status", f.status);
      if (f.search.trim()) params.set("search", f.search.trim());
      const res = await api<{ data: RestockSummaryPayload }>(
        `/admin/restock-alerts/summary?${params.toString()}`,
      );
      return res.data;
    },
  );

  const [insights, { refetch: refetchInsights }] = createResource(async () => {
    const res = await api<{ data: ReplenishmentInsightsPayload }>(
      "/admin/replenishment/insights",
    );
    return res.data;
  });

  return (
    <div class="space-y-6">
      {/* KPI cards */}
      <Show when={summary()}>
        {(data) => (
          <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div class="rounded-xl border border-zinc-200 bg-white p-4">
              <p class="text-[11px] font-bold uppercase text-zinc-500">
                Aguardando reposição
              </p>
              <p class="mt-1 text-2xl font-black text-[#93509e]">
                {data().kpis.pending_count}
              </p>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-white p-4">
              <p class="text-[11px] font-bold uppercase text-zinc-500">
                Notificadas
              </p>
              <p class="mt-1 text-2xl font-black text-emerald-700">
                {data().kpis.notified_count}
              </p>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-white p-4">
              <p class="text-[11px] font-bold uppercase text-zinc-500">
                Falhas de envio
              </p>
              <p class="mt-1 text-2xl font-black text-red-700">
                {data().kpis.failed_count}
              </p>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-white p-4">
              <p class="text-[11px] font-bold uppercase text-zinc-500">
                Tonalidades em demanda
              </p>
              <p class="mt-1 text-2xl font-black text-zinc-900">
                {data().kpis.demanded_variants_count}
              </p>
            </div>
            <div class="rounded-xl border border-zinc-200 bg-white p-4">
              <p class="text-[11px] font-bold uppercase text-zinc-500">
                Listas de reposição B2B
              </p>
              <p class="mt-1 text-2xl font-black text-zinc-900">
                {insights()?.lists_total ?? 0}
              </p>
            </div>
          </div>
        )}
      </Show>

      {/* Top demanded shades ranking */}
      <div class="grid gap-6 lg:grid-cols-2">
        <section class="rounded-xl border border-zinc-200 bg-white p-5">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h2 class="flex items-center gap-2 text-base font-bold text-zinc-900">
              <BellRing class="h-4 w-4 text-[#93509e]" />
              Produtos/Tonalidades com Demanda de Reposição
            </h2>
            <button
              type="button"
              onClick={() => {
                void refetchSummary();
                void refetchInsights();
              }}
              class="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <RefreshCw class="h-3 w-3" />
              Atualizar
            </button>
          </div>
          <Show
            when={(summary()?.demand_ranking?.length ?? 0) > 0}
            fallback={
              <p class="text-xs text-zinc-500">
                Nenhuma solicitação pendente de reposição no momento.
              </p>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="border-b border-zinc-100 text-zinc-400">
                  <tr>
                    <th class="py-2 pr-3">Produto / Cor</th>
                    <th class="py-2 pr-3">SKU</th>
                    <th class="py-2 pr-3 text-right">Estoque</th>
                    <th class="py-2 text-right">Clientes esperando</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100">
                  <For each={summary()?.demand_ranking ?? []}>
                    {(row) => (
                      <tr>
                        <td class="py-2.5 pr-3">
                          <p class="font-bold text-zinc-900">
                            {row.product_name}
                          </p>
                          <p class="text-[11px] text-zinc-500">
                            {row.variant_name}
                            <Show when={row.shade_code}>
                              {" "}
                              ({row.shade_code})
                            </Show>
                          </p>
                        </td>
                        <td class="py-2.5 pr-3 font-mono text-[11px] text-zinc-600">
                          {row.sku}
                        </td>
                        <td class="py-2.5 pr-3 text-right font-semibold">
                          {row.available_stock}
                        </td>
                        <td class="py-2.5 text-right">
                          <span class="rounded-full bg-[#F3E2F6] px-2.5 py-0.5 font-extrabold text-[#93509e]">
                            {row.waiting_count}
                          </span>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </section>

        {/* Top recurring items in customer replenishment lists */}
        <section class="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 class="mb-3 flex items-center gap-2 text-base font-bold text-zinc-900">
            <ClipboardList class="h-4 w-4 text-[#93509e]" />
            Mais Salvos em Listas de Reposição
          </h2>
          <Show
            when={(insights()?.top_variants?.length ?? 0) > 0}
            fallback={
              <p class="text-xs text-zinc-500">
                Ainda não há itens agregados em listas de reposição de clientes.
              </p>
            }
          >
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead class="border-b border-zinc-100 text-zinc-400">
                  <tr>
                    <th class="py-2 pr-3">Produto / Tonalidade</th>
                    <th class="py-2 pr-3 text-right">Listas</th>
                    <th class="py-2 pr-3 text-right">Qtd desejada</th>
                    <th class="py-2 text-right">Estoque</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-100">
                  <For each={insights()?.top_variants ?? []}>
                    {(item) => (
                      <tr>
                        <td class="py-2.5 pr-3">
                          <p class="font-bold text-zinc-900">
                            {item.product_name}
                          </p>
                          <p class="text-[11px] text-zinc-500">
                            {item.variant_name} • {item.sku}
                          </p>
                        </td>
                        <td class="py-2.5 pr-3 text-right font-bold text-[#93509e]">
                          {item.lists_count}
                        </td>
                        <td class="py-2.5 pr-3 text-right font-semibold">
                          {item.total_desired_qty}
                        </td>
                        <td class="py-2.5 text-right">
                          {item.available_stock}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </section>
      </div>

      {/* Individual filtered requests table */}
      <section class="rounded-xl border border-zinc-200 bg-white p-5">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-base font-bold text-zinc-900">
            Histórico de Solicitações por Tonalidade
          </h2>
          <div class="flex flex-wrap gap-2">
            <input
              type="search"
              placeholder="Buscar produto, cor ou SKU..."
              value={searchFilter()}
              onInput={(e) => setSearchFilter(e.currentTarget.value)}
              class="h-9 rounded-md border border-zinc-300 px-3 text-xs focus:border-[#93509e] focus:outline-none"
            />
            <select
              value={statusFilter()}
              onChange={(e) => setStatusFilter(e.currentTarget.value)}
              class="h-9 rounded-md border border-zinc-300 bg-white px-2.5 text-xs"
            >
              <option value="">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="notified">Notificado</option>
              <option value="failed">Falha</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </div>

        <ul class="divide-y divide-zinc-100 text-xs">
          <For each={summary()?.requests?.data ?? []}>
            {(r) => (
              <li class="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div>
                  <p class="font-bold text-zinc-900">
                    {r.product?.name || "Produto"}{" "}
                    <Show when={r.variant}>
                      — {r.variant!.name} ({r.variant!.sku})
                    </Show>
                  </p>
                  <p class="text-[11px] text-zinc-500">
                    Canal: {r.channel} • Contato: {r.contact_masked}
                  </p>
                </div>
                <span
                  class={`rounded-full px-2.5 py-0.5 font-bold uppercase text-[10px] ${
                    r.status === "notified"
                      ? "bg-emerald-50 text-emerald-700"
                      : r.status === "pending"
                        ? "bg-amber-50 text-amber-800"
                        : r.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  {r.status}
                </span>
              </li>
            )}
          </For>
        </ul>
      </section>
    </div>
  );
}
