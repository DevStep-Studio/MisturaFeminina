import { For, Show, createMemo } from "solid-js";

export interface FunnelStep {
  id: string;
  label: string;
  count: number;
  color?: string;
}

interface FunnelChartProps {
  title: string;
  subtitle?: string;
  steps: FunnelStep[];
}

export function AdminFunnelChart(props: FunnelChartProps) {
  const maxVal = createMemo(() => {
    const counts = props.steps.map((s) => s.count);
    return Math.max(...counts, 1);
  });

  const stepsWithMetrics = createMemo(() => {
    const max = maxVal();
    const list = props.steps;

    return list.map((step, idx) => {
      const pctOfMax = Math.max(8, Math.round((step.count / max) * 100));
      const prev = idx > 0 ? list[idx - 1] : null;
      const conversionFromPrev =
        prev && prev.count > 0
          ? Math.min(100, Math.round((step.count / prev.count) * 100))
          : 100;

      return {
        ...step,
        pctOfMax,
        conversionFromPrev,
      };
    });
  });

  return (
    <div class="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs">
      <div>
        <div class="flex items-center justify-between">
          <h3 class="text-base font-bold text-zinc-900">{props.title}</h3>
          <span class="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-semibold text-[#93509e]">
            30 dias
          </span>
        </div>
        <Show when={props.subtitle}>
          <p class="mt-0.5 text-xs text-zinc-500">{props.subtitle}</p>
        </Show>
      </div>

      <div class="my-3 space-y-3">
        <For each={stepsWithMetrics()}>
          {(step, idx) => (
            <div class="group relative">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-medium text-zinc-700">{step.label}</span>
                <div class="flex items-center gap-2">
                  <span class="font-extrabold text-zinc-900">
                    {step.count.toLocaleString("pt-BR")}
                  </span>
                  <Show when={idx() > 0}>
                    <span class="rounded bg-zinc-100 px-1 text-[10px] font-semibold text-zinc-500">
                      {step.conversionFromPrev}% do anterior
                    </span>
                  </Show>
                </div>
              </div>

              {/* Bar track */}
              <div class="h-3.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  class="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${step.pctOfMax}%`,
                    "background-color":
                      step.color || (idx() === 3 ? "#10b981" : "#93509e"),
                    opacity: 1 - idx() * 0.12,
                  }}
                />
              </div>
            </div>
          )}
        </For>
      </div>

      <div class="border-t border-zinc-100 pt-3 flex items-center justify-between text-xs">
        <span class="text-zinc-500">Taxa de Conversão Global:</span>
        <span class="font-bold text-emerald-700">
          {(
            ((stepsWithMetrics()[3]?.count || 0) /
              (stepsWithMetrics()[0]?.count || 1)) *
            100
          ).toFixed(1)}
          % dos visitantes compram
        </span>
      </div>
    </div>
  );
}
