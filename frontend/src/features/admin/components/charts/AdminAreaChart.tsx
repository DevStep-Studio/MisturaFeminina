import { For, Show, createMemo, createSignal } from "solid-js";
import { formatCents } from "../../../../lib/format";

export interface DailySalesPoint {
  date: string;
  label: string;
  sales_cents: number;
  orders_count: number;
}

interface AreaChartProps {
  data: DailySalesPoint[];
  title?: string;
  subtitle?: string;
}

export function AdminAreaChart(props: AreaChartProps) {
  const [period, setPeriod] = createSignal<7 | 14 | 30>(30);
  const [hoverIndex, setHoverIndex] = createSignal<number | null>(null);

  const filteredData = createMemo(() => {
    const list = props.data || [];
    const count = period();
    if (list.length <= count) return list;
    return list.slice(list.length - count);
  });

  const width = 800;
  const height = 240;
  const padTop = 20;
  const padBottom = 30;
  const padLeft = 45;
  const padRight = 20;
  const effW = width - padLeft - padRight;
  const effH = height - padTop - padBottom;

  const maxVal = createMemo(() => {
    const vals = filteredData().map((d) => d.sales_cents);
    const max = Math.max(...vals, 10000);
    // Round up to nice number
    return Math.ceil(max / 50000) * 50000 || 50000;
  });

  const points = createMemo(() => {
    const data = filteredData();
    const len = data.length;
    const max = maxVal();

    return data.map((d, i) => {
      const x = padLeft + (i / (len - 1 || 1)) * effW;
      const y = padTop + effH - (d.sales_cents / max) * effH;
      return { x, y, data: d, index: i };
    });
  });

  const linePath = createMemo(() => {
    const pts = points();
    if (pts.length === 0) return "";
    return pts.reduce((acc, pt, idx, arr) => {
      if (idx === 0) return `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      const prev = arr[idx - 1];
      const cx = (prev.x + pt.x) / 2;
      return `${acc} C ${cx.toFixed(1)} ${prev.y.toFixed(1)}, ${cx.toFixed(1)} ${pt.y.toFixed(1)}, ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, "");
  });

  const areaPath = createMemo(() => {
    const line = linePath();
    if (!line) return "";
    const pts = points();
    if (pts.length === 0) return "";
    const lastX = pts[pts.length - 1].x;
    const firstX = pts[0].x;
    const bottomY = padTop + effH;
    return `${line} L ${lastX.toFixed(1)} ${bottomY} L ${firstX.toFixed(1)} ${bottomY} Z`;
  });

  const totalPeriodSales = createMemo(() => {
    return filteredData().reduce((acc, curr) => acc + curr.sales_cents, 0);
  });

  const totalPeriodOrders = createMemo(() => {
    return filteredData().reduce((acc, curr) => acc + curr.orders_count, 0);
  });

  // Handle pointer hover
  const handlePointerMove = (e: MouseEvent) => {
    const target = e.currentTarget as SVGSVGElement;
    const rect = target.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const normX = (mouseX / rect.width) * width;

    const pts = points();
    if (pts.length === 0) return;

    let closestIdx = 0;
    let minDiff = Infinity;
    pts.forEach((pt, idx) => {
      const diff = Math.abs(pt.x - normX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });

    setHoverIndex(closestIdx);
  };

  const handlePointerLeave = () => {
    setHoverIndex(null);
  };

  const hoveredPoint = createMemo(() => {
    const idx = hoverIndex();
    if (idx === null) return null;
    return points()[idx] || null;
  });

  return (
    <div class="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs transition-all">
      {/* Chart Header */}
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <h3 class="text-base font-bold text-zinc-900">
              {props.title || "Evolução de Vendas e Faturamento"}
            </h3>
            <span class="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              {formatCents(totalPeriodSales())} • {totalPeriodOrders()} pedidos
            </span>
          </div>
          <p class="mt-0.5 text-xs text-zinc-500">
            {props.subtitle ||
              "Acompanhamento diário da receita líquida aprovada"}
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div class="inline-flex rounded-lg border border-zinc-200 bg-zinc-50/80 p-0.5">
          <button
            type="button"
            onClick={() => setPeriod(7)}
            class={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              period() === 7
                ? "bg-white text-[#93509e] shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            7 dias
          </button>
          <button
            type="button"
            onClick={() => setPeriod(14)}
            class={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              period() === 14
                ? "bg-white text-[#93509e] shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            14 dias
          </button>
          <button
            type="button"
            onClick={() => setPeriod(30)}
            class={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
              period() === 30
                ? "bg-white text-[#93509e] shadow-xs"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            30 dias
          </button>
        </div>
      </div>

      {/* SVG Chart Area */}
      <div class="relative mt-4 w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          class="h-auto w-full select-none"
          onMouseMove={handlePointerMove}
          onMouseLeave={handlePointerLeave}
        >
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#93509e" stop-opacity="0.28" />
              <stop offset="50%" stop-color="#93509e" stop-opacity="0.10" />
              <stop offset="100%" stop-color="#93509e" stop-opacity="0.0" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#93509e" />
              <stop offset="100%" stop-color="#b164be" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow
                dx="0"
                dy="4"
                stdDeviation="4"
                flood-color="#93509e"
                flood-opacity="0.25"
              />
            </filter>
          </defs>

          {/* Grid lines (Y-axis) */}
          <For each={[0, 0.25, 0.5, 0.75, 1]}>
            {(ratio) => {
              const y = padTop + effH * (1 - ratio);
              const val = maxVal() * ratio;
              return (
                <g class="text-zinc-400">
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="#f4f4f5"
                    stroke-dasharray={ratio === 0 ? "none" : "3 3"}
                    stroke-width="1"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3}
                    text-anchor="end"
                    class="text-[9.5px] fill-zinc-400 font-medium"
                  >
                    {val >= 100000
                      ? `R$ ${(val / 100000).toFixed(0)}k`
                      : `R$ ${(val / 100).toFixed(0)}`}
                  </text>
                </g>
              );
            }}
          </For>

          {/* Fill Area */}
          <path d={areaPath()} fill="url(#areaGrad)" />

          {/* Stroke Line */}
          <path
            d={linePath()}
            fill="none"
            stroke="url(#lineGrad)"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            filter="url(#glow)"
          />

          {/* X Axis Labels */}
          <For
            each={points().filter((_, i) => {
              const total = points().length;
              if (total <= 7) return true;
              if (total <= 14) return i % 2 === 0 || i === total - 1;
              return i % 4 === 0 || i === total - 1;
            })}
          >
            {(pt) => (
              <text
                x={pt.x}
                y={height - 8}
                text-anchor="middle"
                class="text-[10px] fill-zinc-500 font-medium"
              >
                {pt.data.label}
              </text>
            )}
          </For>

          {/* Hover Crosshair & Dot */}
          <Show when={hoveredPoint()}>
            {(pt) => (
              <g class="transition-all duration-150">
                <line
                  x1={pt().x}
                  y1={padTop}
                  x2={pt().x}
                  y2={padTop + effH}
                  stroke="#93509e"
                  stroke-width="1.5"
                  stroke-dasharray="3 3"
                  opacity="0.75"
                />
                <circle
                  cx={pt().x}
                  cy={pt().y}
                  r="6"
                  fill="#93509e"
                  stroke="#ffffff"
                  stroke-width="2.5"
                  filter="url(#glow)"
                />
              </g>
            )}
          </Show>
        </svg>

        {/* Floating Tooltip Pill */}
        <Show when={hoveredPoint()}>
          {(pt) => {
            const leftPct = (pt().x / width) * 100;
            return (
              <div
                class="pointer-events-none absolute -top-3 z-20 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white/95 px-3 py-2 text-center shadow-lg backdrop-blur-xs transition-all duration-100"
                style={{
                  left: `${Math.max(12, Math.min(88, leftPct))}%`,
                }}
              >
                <p class="text-[10.5px] font-semibold text-zinc-500">
                  {pt().data.label} ({pt().data.date})
                </p>
                <p class="text-sm font-extrabold text-[#93509e]">
                  {formatCents(pt().data.sales_cents)}
                </p>
                <p class="text-[10.5px] font-medium text-zinc-600">
                  {pt().data.orders_count}{" "}
                  {pt().data.orders_count === 1 ? "pedido" : "pedidos"}
                </p>
              </div>
            );
          }}
        </Show>
      </div>
    </div>
  );
}
