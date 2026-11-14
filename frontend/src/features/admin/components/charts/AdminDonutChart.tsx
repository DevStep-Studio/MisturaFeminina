import { For, Show, createMemo, createSignal } from "solid-js";
import { formatCents } from "../../../../lib/format";

export interface DonutSegment {
  id: string;
  label: string;
  value: number;
  cents?: number;
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

  const size = 180;
  const strokeWidth = 24;
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
    <div class="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
      <div>
        <h3 class="text-base font-bold text-zinc-900">{props.title}</h3>
        <Show when={props.subtitle}>
          <p class="mt-0.5 text-xs text-zinc-500">{props.subtitle}</p>
        </Show>
      </div>

      <div class="my-4 flex flex-col items-center justify-center gap-6 sm:flex-row">
        {/* SVG Circle */}
        <div class="relative flex items-center justify-center">
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
                  <span class="text-2xl font-extrabold text-zinc-900">
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
                    class="text-xl font-extrabold"
                    style={{ color: act().color }}
                  >
                    {act().value}
                  </span>
                  <span class="text-[10px] font-bold text-zinc-600">
                    {act().label} ({act().pct}%)
                  </span>
                </>
              )}
            </Show>
          </div>
        </div>

        {/* Legend */}
        <div class="flex flex-1 flex-col justify-center space-y-2">
          <For each={computedSegments()}>
            {(seg) => (
              <div
                class={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                  activeSegment()?.id === seg.id
                    ? "bg-zinc-100 font-bold"
                    : "hover:bg-zinc-50"
                }`}
                onMouseEnter={() => setActiveSegment(seg)}
                onMouseLeave={() => setActiveSegment(null)}
              >
                <div class="flex items-center gap-2">
                  <span
                    class="size-2.5 rounded-full shrink-0"
                    style={{ "background-color": seg.color }}
                  />
                  <span class="font-medium text-zinc-700">{seg.label}</span>
                </div>
                <div class="flex items-center gap-2 font-bold text-zinc-900">
                  <Show when={seg.cents}>
                    <span class="text-[11px] font-medium text-zinc-500">
                      {formatCents(seg.cents!)}
                    </span>
                  </Show>
                  <span class="rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px]">
                    {seg.value} ({seg.pct}%)
                  </span>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      <Show when={totalCents() > 0}>
        <div class="border-t border-zinc-100 pt-3 text-right">
          <span class="text-xs text-zinc-500">Total movimentado: </span>
          <span class="text-xs font-bold text-zinc-900">
            {formatCents(totalCents())}
          </span>
        </div>
      </Show>
    </div>
  );
}
