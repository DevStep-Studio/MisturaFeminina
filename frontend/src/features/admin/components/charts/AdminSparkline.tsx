import { createMemo } from "solid-js";

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
}

export function AdminSparkline(props: SparklineProps) {
  const color = () => props.color || "#93509e";
  const height = () => props.height || 36;
  const width = () => props.width || 100;

  const points = createMemo(() => {
    const raw = props.data && props.data.length > 0 ? props.data : [0, 0, 0];
    const min = Math.min(...raw);
    const max = Math.max(...raw);
    const range = max - min || 1;
    const w = width();
    const h = height();
    const padding = 3;
    const effH = h - padding * 2;

    return raw.map((val, idx) => {
      const x = (idx / (raw.length - 1 || 1)) * w;
      const y = h - padding - ((val - min) / range) * effH;
      return { x, y };
    });
  });

  const pathD = createMemo(() => {
    const pts = points();
    if (pts.length === 0) return "";
    return pts.reduce((acc, pt, idx, arr) => {
      if (idx === 0) return `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      const prev = arr[idx - 1];
      const cx = (prev.x + pt.x) / 2;
      return `${acc} C ${cx.toFixed(1)} ${prev.y.toFixed(1)}, ${cx.toFixed(1)} ${pt.y.toFixed(1)}, ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, "");
  });

  const areaD = createMemo(() => {
    const line = pathD();
    if (!line) return "";
    const w = width();
    const h = height();
    return `${line} L ${w} ${h} L 0 ${h} Z`;
  });

  return (
    <svg
      viewBox={`0 0 ${width()} ${height()}`}
      class="overflow-visible"
      style={{ width: `${width()}px`, height: `${height()}px` }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={`spark-${color().replace("#", "")}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stop-color={color()} stop-opacity="0.25" />
          <stop offset="100%" stop-color={color()} stop-opacity="0.0" />
        </linearGradient>
      </defs>
      <path
        d={areaD()}
        fill={`url(#spark-${color().replace("#", "")})`}
        stroke="none"
      />
      <path
        d={pathD()}
        fill="none"
        stroke={color()}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
