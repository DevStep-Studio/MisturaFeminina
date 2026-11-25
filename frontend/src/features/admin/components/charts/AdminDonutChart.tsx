import { For, Show, createMemo, createSignal } from "solid-js";
import CreditCard from "lucide-solid/icons/credit-card";
import { formatCents } from "../../../../lib/format";

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  cents?: number;
  feeCents?: number;
  netCents?: number;
  color: string;
  pct?: number;
}

interface DonutChartProps {
  title: string;
  subtitle?: string;
  segments: DonutSegment[];
  centerLabel?: string;
}

export function AdminDonutChart(props: DonutChartProps) {
  const [activeSegment, setActiveSegment] = createSignal<DonutSegment | null>(
    null,
  );

  const total = createMemo(() => {
    return props.segments.reduce((acc, curr) => acc + curr.value, 0);
  });

  const totalCents = createMemo(() => {
    return props.segments.reduce((acc, curr) => acc + (curr.cents || 0), 0);
  });

  const totalFeeCents = createMemo(() => {
    return props.segments.reduce((acc, curr) => acc + (curr.feeCents || 0), 0);
  });

  const totalNetCents = createMemo(() => {
    return props.segments.reduce(
      (acc, curr) => acc + (curr.netCents ?? Math.max(0, (curr.cents || 0) - (curr.feeCents || 0))),
      0,
    );
  });

  const size = 160;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const computedSegments = createMemo(() => {
    const tot = total() || 1;
    let accumulatedAngle = 0;

    return props.segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const ratio = s.value / tot;
        const strokeDasharray = `${ratio * circumference} ${circumference}`;
        const strokeDashoffset = -accumulatedAngle * circumference;
        const pct = Math.round(ratio * 100);
        accumulatedAngle += ratio;

        return {
          ...s,
          ratio,
          pct,
          strokeDasharray,
          strokeDashoffset,
        };
      });
  });

  return (
    <div class="flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
      {/* Header */}
      <div class="flex items-start justify-between gap-2 border-b border-zinc-100 pb-3">
        <div>
          <h3 class="text-base font-bold text-zinc-900">{props.title}</h3>
          <Show when={props.subtitle}>
            <p class="mt-0.5 text-xs text-zinc-500">{props.subtitle}</p>
          </Show>
        </div>
        <Show when={total() > 0}>
          <span class="adm-tabular shrink-0 rounded-full border border-zinc-200/90 bg-zinc-50 px-2.5 py-1 text-xs font-semibold text-zinc-700">
            {total()} {total() === 1 ? "transação" : "transações"}
          </span>
        </Show>
      </div>

      {/* Chart Body or Empty State */}
      <Show
        when={computedSegments().length > 0}
        fallback={
          <div class="my-auto flex flex-1 flex-col items-center justify-center py-12 text-center">
            <div class="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
              <CreditCard class="h-6 w-6" />
            </div>
            <p class="text-sm font-semibold text-zinc-800">
              Nenhuma transação no período
            </p>
            <p class="mt-1 max-w-xs text-xs text-zinc-500">
              Assim que houver pedidos confirmados, a distribuição por método de
              pagamento será apresentada aqui.
            </p>
          </div>
        }
      >
        <div class="space-y-4 py-3">
          {/* Top section: Donut + Segment Cards */}
          <div class="flex flex-col items-center justify-around gap-6 sm:flex-row">
            {/* SVG Circle */}
            <div class="relative flex shrink-0 items-center justify-center">
              <svg
                viewBox={`0 0 ${size} ${size}`}
                style={{ width: `${size}px`, height: `${size}px` }}
                class="-rotate-90 select-none overflow-visible"
              >
                {/* Background track circle */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="#f4f4f5"
                  stroke-width={strokeWidth}
                />

                {/* Segments */}
                <For each={computedSegments()}>
                  {(seg) => (
                    <circle
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="none"
                      stroke={seg.color}
                      stroke-width={
                        activeSegment()?.id === seg.id
                          ? strokeWidth + 4
                          : strokeWidth
                      }
                      stroke-dasharray={seg.strokeDasharray}
                      stroke-dashoffset={seg.strokeDashoffset}
                      stroke-linecap="round"
                      class="cursor-pointer transition-all duration-200 hover:opacity-90"
                      onMouseEnter={() => setActiveSegment(seg)}
                      onMouseLeave={() => setActiveSegment(null)}
                    />
                  )}
                </For>
              </svg>

              {/* Centered Total / Active Info */}
              <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <Show
                  when={activeSegment()}
                  fallback={
                    <>
                      <span class="adm-tabular text-2xl font-extrabold text-zinc-900">
                        {total()}
                      </span>
                      <span class="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        {props.centerLabel || "Pedidos"}
                      </span>
                    </>
                  }
                >
                  {(act) => (
                    <>
                      <span
                        class="adm-tabular text-xl font-extrabold"
                        style={{ color: act().color }}
                      >
                        {act().value}
                      </span>
                      <span class="max-w-[100px] truncate text-[10px] font-bold text-zinc-600">
                        {act().label} ({act().pct}%)
                      </span>
                    </>
                  )}
                </Show>
              </div>
            </div>

            {/* Quick legend pills */}
            <div class="flex w-full flex-1 flex-col justify-center space-y-2 sm:max-w-xs">
              <For each={computedSegments()}>
                {(seg) => (
                  <div
                    class={`group rounded-xl border p-2 text-xs transition-all duration-150 ${
                      activeSegment()?.id === seg.id
                        ? "border-zinc-300 bg-zinc-50 shadow-2xs"
                        : "border-zinc-100 bg-white hover:border-zinc-200 hover:bg-zinc-50/50"
                    }`}
                    onMouseEnter={() => setActiveSegment(seg)}
                    onMouseLeave={() => setActiveSegment(null)}
                  >
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex min-w-0 items-center gap-2">
                        <span
                          class="size-2.5 shrink-0 rounded-full"
                          style={{ "background-color": seg.color }}
                        />
                        <span class="truncate font-semibold text-zinc-800">
                          {seg.label}
                        </span>
                      </div>
                      <span class="adm-tabular shrink-0 font-bold text-zinc-900">
                        {formatCents(seg.cents || 0)}
                      </span>
                    </div>

                    <div class="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
                      <span>
                        {seg.value} {seg.value === 1 ? "pedido" : "pedidos"}
                      </span>
                      <span class="adm-tabular font-bold text-zinc-700">
                        {seg.pct}%
                      </span>
                    </div>

                    <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        class="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${seg.pct}%`,
                          "background-color": seg.color,
                        }}
                      />
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>

          {/* Financial Breakdown Table */}
          <div class="overflow-x-auto rounded-xl border border-zinc-100">
            <table class="w-full text-left text-xs">
              <thead class="bg-zinc-50/80 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
                <tr>
                  <th class="px-2.5 py-2">Método</th>
                  <th class="px-2 py-2 text-center">Pedidos</th>
                  <th class="px-2.5 py-2 text-right">Bruto</th>
                  <th class="px-2 py-2 text-right">Taxas</th>
                  <th class="px-2.5 py-2 text-right">Líquido</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 bg-white text-[11.5px]">
                <For each={computedSegments()}>
                  {(seg) => (
                    <tr
                      class={`transition-colors ${
                        activeSegment()?.id === seg.id ? "bg-zinc-50" : "hover:bg-zinc-50/50"
                      }`}
                      onMouseEnter={() => setActiveSegment(seg)}
                      onMouseLeave={() => setActiveSegment(null)}
                    >
                      <td class="whitespace-nowrap px-2.5 py-2 font-medium text-zinc-800">
                        <div class="flex items-center gap-1.5">
                          <span
                            class="size-2 shrink-0 rounded-full"
                            style={{ "background-color": seg.color }}
                          />
                          <span>{seg.label}</span>
                        </div>
                      </td>
                      <td class="adm-tabular whitespace-nowrap px-2 py-2 text-center text-zinc-600">
                        {seg.value} ({seg.pct}%)
                      </td>
                      <td class="adm-tabular whitespace-nowrap px-2.5 py-2 text-right font-semibold text-zinc-900">
                        {formatCents(seg.cents || 0)}
                      </td>
                      <td class="adm-tabular whitespace-nowrap px-2 py-2 text-right text-zinc-500">
                        {formatCents(seg.feeCents || 0)}
                      </td>
                      <td class="adm-tabular whitespace-nowrap px-2.5 py-2 text-right font-bold text-zinc-900">
                        {formatCents(
                          seg.netCents ??
                            Math.max(0, (seg.cents || 0) - (seg.feeCents || 0)),
                        )}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>

      {/* Footer Totals */}
      <Show when={totalCents() > 0}>
        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3 text-xs">
          <div class="flex items-center gap-3 text-zinc-500">
            <span>
              Total Bruto:{" "}
              <strong class="adm-tabular font-bold text-zinc-800">
                {formatCents(totalCents())}
              </strong>
            </span>
            <Show when={totalFeeCents() > 0}>
              <span class="text-zinc-400">|</span>
              <span>
                Taxas:{" "}
                <strong class="adm-tabular font-medium text-zinc-600">
                  {formatCents(totalFeeCents())}
                </strong>
              </span>
            </Show>
          </div>
          <div class="text-right">
            <span class="text-zinc-500">Líquido Estimado: </span>
            <span class="adm-tabular text-sm font-bold text-[#62298d]">
              {formatCents(totalNetCents())}
            </span>
          </div>
        </div>
      </Show>
    </div>
  );
}
