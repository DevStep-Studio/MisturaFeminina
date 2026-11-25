import { Link } from "@tanstack/solid-router";
import Clock from "lucide-solid/icons/clock";
import Package from "lucide-solid/icons/package";
import TrendingUp from "lucide-solid/icons/trending-up";
import { For, Show } from "solid-js";
import { assetUrl, formatCents } from "../../../../lib/format";

export interface TopProductItem {
  name: string;
  total_qty: number;
  total_cents: number;
  image_url?: string | null;
  product_id?: number | string | null;
  sku?: string | null;
}

interface BarChartProps {
  title: string;
  subtitle?: string;
  items: TopProductItem[];
}

export function AdminBarChart(props: BarChartProps) {
  const maxCents = () => {
    const list = props.items || [];
    return Math.max(...list.map((i) => i.total_cents), 1);
  };

  const getRankBadgeClass = (rank: number) => {
    switch (rank) {
      case 1:
        return "bg-amber-500/15 text-amber-800 border-amber-500/30";
      case 2:
        return "bg-slate-500/15 text-slate-800 border-slate-400/30";
      case 3:
        return "bg-orange-600/15 text-orange-900 border-orange-600/30";
      default:
        return "bg-zinc-100 text-zinc-500 border-zinc-200";
    }
  };

  return (
    <div class="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
      <div>
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-zinc-900">{props.title}</h3>
          <span class="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
            <TrendingUp class="size-3" aria-hidden="true" />
            <span>Mais vendidos</span>
          </span>
        </div>
        <Show when={props.subtitle}>
          <p class="mt-0.5 text-xs text-zinc-500">{props.subtitle}</p>
        </Show>
      </div>

      <div class="my-3 space-y-2.5">
        <For each={props.items}>
          {(item, idx) => {
            const pct = Math.max(
              10,
              Math.round((item.total_cents / maxCents()) * 100),
            );
            const rank = idx() + 1;

            return (
              <div class="group relative rounded-xl border border-zinc-100 bg-white p-2.5 transition-all duration-200 hover:border-[#93509e]/30 hover:bg-[#FAF5FB]/40 hover:shadow-2xs">
                <div class="flex items-center justify-between gap-3 text-xs">
                  {/* Left: Rank + Product Icon/Image + Name */}
                  <div class="flex min-w-0 items-center gap-2.5 pr-2">
                    <span
                      class={`size-5 shrink-0 rounded-md border text-[10px] font-black flex items-center justify-center shadow-2xs ${getRankBadgeClass(
                        rank,
                      )}`}
                    >
                      {rank}
                    </span>

                    {/* Product Icon / Thumbnail */}
                    <div class="relative size-10 shrink-0 overflow-hidden rounded-lg border border-zinc-200/80 bg-white p-0.5 shadow-2xs transition-colors group-hover:border-[#93509e]/40">
                      <Show
                        when={item.image_url}
                        fallback={
                          <div class="flex size-full items-center justify-center rounded bg-[#FAF5FB] text-[#93509e]">
                            <Package class="size-5 stroke-[1.8]" aria-hidden="true" />
                          </div>
                        }
                      >
                        <img
                          src={assetUrl(item.image_url)}
                          alt={item.name}
                          class="size-full rounded object-contain"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            const fallback = e.currentTarget.nextElementSibling;
                            if (fallback) fallback.classList.remove("hidden");
                          }}
                        />
                        <div class="hidden flex size-full items-center justify-center rounded bg-[#FAF5FB] text-[#93509e]">
                          <Package class="size-5 stroke-[1.8]" aria-hidden="true" />
                        </div>
                      </Show>
                    </div>

                    {/* Product Name & Quantity Sold */}
                    <div class="min-w-0 flex-1">
                      <Show
                        when={item.product_id}
                        fallback={
                          <p
                            class="truncate font-semibold text-zinc-900"
                            title={item.name}
                          >
                            {item.name}
                          </p>
                        }
                      >
                        <Link
                          to="/admin/produtos"
                          search={{ edit: String(item.product_id) }}
                          class="truncate block font-semibold text-zinc-900 transition-colors group-hover:text-[#93509e]"
                          title={item.name}
                        >
                          {item.name}
                        </Link>
                      </Show>
                      <p class="text-[11px] font-medium text-zinc-400">
                        {item.total_qty}{" "}
                        {item.total_qty === 1 ? "unidade vendida" : "unidades vendidas"}
                      </p>
                    </div>
                  </div>

                  {/* Right: Revenue */}
                  <div class="flex shrink-0 items-center text-right">
                    <span class="text-xs font-bold tabular-nums text-zinc-900 sm:text-sm">
                      {formatCents(item.total_cents)}
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    class="h-full rounded-full bg-[#93509e] transition-all duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          }}
        </For>
      </div>

      <div class="border-t border-zinc-100 pt-3 flex items-center justify-between text-xs text-zinc-400">
        <span class="inline-flex items-center gap-1.5">
          <Clock class="size-3.5 text-zinc-400" aria-hidden="true" />
          <span>Ranking baseado em 30 dias</span>
        </span>
        <Link
          to="/admin/relatorios"
          class="font-semibold text-[#93509e] hover:underline"
        >
          Ver relatório completo →
        </Link>
      </div>
    </div>
  );
}
