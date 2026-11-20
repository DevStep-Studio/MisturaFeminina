import { For, Show } from "solid-js";
import BellRing from "lucide-solid/icons/bell-ring";
import ClipboardList from "lucide-solid/icons/clipboard-list";
import Layers from "lucide-solid/icons/layers";
import Share2 from "lucide-solid/icons/share-2";

export interface DashboardB2bProps {
  kpis: {
    replenishment_lists_count?: number;
    multi_shade_add_count?: number;
    shared_carts_created_count?: number;
    shared_carts_imported_count?: number;
  };
  topDemandedVariants?: Array<{
    product_id: number;
    product_variant_id: number | null;
    product_name: string;
    variant_name: string;
    shade_code: string | null;
    sku: string;
    available_stock: number;
    waiting_count: number;
  }>;
  topReplenishmentVariants?: Array<{
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

export function AdminB2bMetricsSection(props: DashboardB2bProps) {
  return (
    <div class="space-y-5">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs">
          <div>
            <p class="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Compras Multi-Cor
            </p>
            <p class="mt-1 text-2xl font-black text-[#93509e]">
              {props.kpis.multi_shade_add_count ?? 0}
            </p>
          </div>
          <span class="rounded-full bg-[#F3E2F6] p-2.5 text-[#93509e]">
            <Layers class="h-4 w-4" />
          </span>
        </div>

        <div class="flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs">
          <div>
            <p class="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Listas de Reposição
            </p>
            <p class="mt-1 text-2xl font-black text-zinc-900">
              {props.kpis.replenishment_lists_count ?? 0}
            </p>
          </div>
          <span class="rounded-full bg-emerald-50 p-2.5 text-emerald-700">
            <ClipboardList class="h-4 w-4" />
          </span>
        </div>

        <div class="flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xs">
          <div>
            <p class="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Carrinhos Compartilhados
            </p>
            <p class="mt-1 text-2xl font-black text-zinc-900">
              {props.kpis.shared_carts_created_count ?? 0}
              <span class="ml-1.5 text-xs font-semibold text-zinc-500">
                ({props.kpis.shared_carts_imported_count ?? 0} import.)
              </span>
            </p>
          </div>
          <span class="rounded-full bg-purple-50 p-2.5 text-[#93509e]">
            <Share2 class="h-4 w-4" />
          </span>
        </div>
      </div>

      <div class="grid gap-5 lg:grid-cols-2">
        <section class="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
          <h3 class="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
            <BellRing class="h-4 w-4 text-[#93509e]" />
            Tonalidades com Maior Demanda de Reposição
          </h3>
          <Show
            when={(props.topDemandedVariants?.length ?? 0) > 0}
            fallback={
              <p class="text-xs text-zinc-500">
                Sem alertas de reposição pendentes no momento.
              </p>
            }
          >
            <ul class="divide-y divide-zinc-100 text-xs">
              <For each={(props.topDemandedVariants ?? []).slice(0, 6)}>
                {(item) => (
                  <li class="flex items-center justify-between gap-2 py-2">
                    <div class="min-w-0">
                      <p class="truncate font-bold text-zinc-900">
                        {item.product_name}
                      </p>
                      <p class="text-[11px] text-zinc-500">
                        {item.variant_name} • {item.sku}
                      </p>
                    </div>
                    <span class="shrink-0 rounded-full bg-[#F3E2F6] px-2.5 py-0.5 font-extrabold text-[#93509e]">
                      {item.waiting_count} esperando
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>

        <section class="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
          <h3 class="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
            <ClipboardList class="h-4 w-4 text-emerald-700" />
            Mais Salvos em Listas de Reposição
          </h3>
          <Show
            when={(props.topReplenishmentVariants?.length ?? 0) > 0}
            fallback={
              <p class="text-xs text-zinc-500">
                Nenhum item salvo em listas de reposição ainda.
              </p>
            }
          >
            <ul class="divide-y divide-zinc-100 text-xs">
              <For each={(props.topReplenishmentVariants ?? []).slice(0, 6)}>
                {(item) => (
                  <li class="flex items-center justify-between gap-2 py-2">
                    <div class="min-w-0">
                      <p class="truncate font-bold text-zinc-900">
                        {item.product_name}
                      </p>
                      <p class="text-[11px] text-zinc-500">
                        {item.variant_name} • {item.sku}
                      </p>
                    </div>
                    <span class="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 font-extrabold text-emerald-800">
                      {item.lists_count} lista(s)
                    </span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </section>
      </div>
    </div>
  );
}
