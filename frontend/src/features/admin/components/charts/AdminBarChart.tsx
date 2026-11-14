import { For, Show } from "solid-js";
import { formatCents } from "../../../../lib/format";

export interface TopProductItem {
  name: string;
  total_qty: number;
  total_cents: number;
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

  return (
    <div class="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
      <div>
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-zinc-900">{props.title}</h3>
          <span class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            Mais vendidos
          </span>
        </div>
        <Show when={props.subtitle}>
          <p class="mt-0.5 text-xs text-zinc-500">{props.subtitle}</p>
        </Show>
      </div>

      <div class="my-3 space-y-3">
        <For each={props.items}>
          {(item, idx) => {
            const pct = Math.max(
              12,
              Math.round((item.total_cents / maxCents()) * 100),
            );
            return (
              <div class="group">
                <div class="mb-1 flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2 min-w-0 pr-2">
                    <span class="size-4.5 rounded-full bg-purple-100 text-[10px] font-bold text-[#93509e] flex items-center justify-center shrink-0">
                      {idx() + 1}
                    </span>
                    <span class="truncate font-medium text-zinc-800">
                      {item.name}
                    </span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="text-[11px] text-zinc-400">
                      {item.total_qty} un
                    </span>
                    <span class="font-bold text-zinc-900">
                      {formatCents(item.total_cents)}
                    </span>
                  </div>
                </div>

                <div class="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-[#93509e] to-[#c262d0] transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          }}
        </For>
      </div>

      <div class="border-t border-zinc-100 pt-3 text-right">
        <span class="text-xs text-zinc-400">Ranking baseado em 30 dias</span>
      </div>
    </div>
  );
}
