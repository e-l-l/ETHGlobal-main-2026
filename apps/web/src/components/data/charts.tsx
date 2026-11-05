import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";

/* -------------------------------------------------------------- LineChart */

export type ChartMarker = {
  /** Index into `points`. */
  x: number;
  label: ReactNode;
  tone?: "down" | "muted" | "accent-text";
};

export type LineChartProps = Omit<ComponentPropsWithoutRef<"figure">, "children"> & {
  points: number[];
  height?: number;
  tone?: "ink" | "accent-text";
  ariaLabel: string;
  markers?: ChartMarker[];
  /** Fill the area under the line with a faint tint. */
  area?: boolean;
};

const markerTone = { down: "stroke-down text-down", muted: "stroke-faint text-muted", "accent-text": "stroke-accent-text text-accent-text" } as const;

/** Hand-rolled SVG sparkline/area chart. Stretches to container width. */
export function LineChart({
  points,
  height = 160,
  tone = "ink",
  ariaLabel,
  markers = [],
  area = true,
  className,
  ...props
}: LineChartProps) {
  const W = 100;
  const pad = 4;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const n = Math.max(points.length - 1, 1);
  const xy = points.map((p, i) => [(i / n) * W, pad + (1 - (p - min) / span) * (height - pad * 2)] as const);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const fill = `${line} L${W},${height} L0,${height} Z`;
  return (
    <figure className={cn("relative w-full", className)} style={{ height }} {...props}>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${W} ${height}`}
        preserveAspectRatio="none"
        className="block size-full overflow-visible"
      >
        {area ? <path d={fill} className={tone === "ink" ? "fill-ink/5" : "fill-accent-text/10"} /> : null}
        {markers.map((m, i) => {
          const x = (m.x / n) * W;
          return (
            <line
              key={i}
              x1={x}
              x2={x}
              y1={0}
              y2={height}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
              className={markerTone[m.tone ?? "down"]}
            />
          );
        })}
        <path
          d={line}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className={tone === "ink" ? "stroke-ink" : "stroke-accent-text"}
        />
      </svg>
      {markers.map((m, i) => (
        <figcaption
          key={i}
          className={cn("absolute top-0 ml-1.5 font-mono text-label whitespace-nowrap uppercase", markerTone[m.tone ?? "down"])}
          style={{ left: `${(m.x / n) * 100}%` }}
        >
          {m.label}
        </figcaption>
      ))}
    </figure>
  );
}

/* ---------------------------------------------------------- WeekSplitBars */

export type WeekSplitBarsProps = Omit<ComponentPropsWithoutRef<"figure">, "children"> & {
  days: { you: number; repay: number }[];
  /** Axis labels, e.g. ["M","T","W","T","F","S","S"]. */
  dayLabels: ReactNode[];
  youLabel: ReactNode;
  repayLabel: ReactNode;
  ariaLabel: string;
  height?: number;
};

/** 7 stacked bars: ink = "to you", accent = "to repayment". */
export function WeekSplitBars({
  days,
  dayLabels,
  youLabel,
  repayLabel,
  ariaLabel,
  height = 140,
  className,
  ...props
}: WeekSplitBarsProps) {
  const max = Math.max(...days.map((d) => d.you + d.repay), 1);
  return (
    <figure className={cn("flex flex-col gap-3", className)} {...props}>
      <div role="img" aria-label={ariaLabel} className="grid grid-cols-7 items-end gap-2" style={{ height }}>
        {days.map((d, i) => {
          const total = d.you + d.repay;
          return (
            <div key={i} className="flex h-full flex-col justify-end">
              <div className="flex flex-col" style={{ height: `${(total / max) * 100}%` }}>
                <div className="bg-accent" style={{ flexGrow: d.repay }} />
                <div className="bg-ink" style={{ flexGrow: d.you }} />
              </div>
              {total === 0 ? <div className="h-0.5 bg-line" /> : null}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 gap-2" aria-hidden>
        {dayLabels.map((l, i) => (
          <span key={i} className="text-center font-mono text-label text-muted uppercase">
            {l}
          </span>
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-chip text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 bg-ink" aria-hidden />
          {youLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 bg-accent" aria-hidden />
          {repayLabel}
        </span>
      </figcaption>
    </figure>
  );
}
