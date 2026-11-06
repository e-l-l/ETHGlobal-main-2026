"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * dev2 patterns, lines and decals (anay-design.md section 6). Each one means something:
 * the wave is money moving, the bands are the drip, the pixels are real days of sales.
 * Decals sit in their own block; text over them always sits on a solid Hunter ground.
 */

/* --------------------------------------------------------------- WaveBand */

/**
 * S-curve tile 32×24, 7px stroke, −18°. Lime on Hunter. Checkout and Get Paid headers.
 * bodyClassName styles the content block, e.g. a solid Hunter panel inset from the wave frame.
 */
export function WaveBand({ children, className, bodyClassName }: { children: ReactNode; className?: string; bodyClassName?: string }) {
  const id = `fw${useId().replace(/[:«»]/g, "")}`;
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-hunter text-canvas", className)}>
      <svg className="absolute inset-0 size-full text-lime opacity-30" aria-hidden>
        <defs>
          <pattern id={id} width="32" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
            <path d="M0 18C8 18 8 6 16 6S24 18 32 18" fill="none" stroke="currentColor" strokeWidth="7" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${id})`} />
      </svg>
      <div className={cn("relative flex flex-col gap-1 p-5", bodyClassName)}>{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------- GradientHero */

/**
 * Light drip gradient: Hunter → Fern → Leaf → Honeydew. One per screen, top block only.
 * Lime stays out of the large field; it appears as the thin band under it.
 */
export function GradientHero({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
      <div className="h-32 bg-linear-to-b from-hunter from-0% via-fern via-45% to-honeydew to-100%" aria-hidden />
      <JarBandStrip className="rounded-none" />
      {children ? <div className="bg-surface p-5">{children}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------- JarBandStrip */

/** The mirrored drip band, Hunter → Leaf → Lime → Leaf → Hunter. A divider decal, 6px. */
export function JarBandStrip({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("h-1.5 rounded-chip bg-linear-to-r from-hunter via-lime to-hunter", className)}
    />
  );
}

/* -------------------------------------------------------------- LedgerGrid */

/** Hairline grid on Hunter with a pixel mosaic in the corner. Hero and lender page. */
export function LedgerGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg bg-hunter text-canvas",
        "bg-[linear-gradient(to_right,rgb(221_247_230/0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgb(221_247_230/0.10)_1px,transparent_1px)]",
        "bg-size-[24px_24px] bg-position-[-1px_-1px]",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 46 46" className="absolute top-3 right-3 size-16 opacity-80">
        {MOSAIC.map(([x, y, on]) => (
          <rect key={`${x}-${y}`} x={x * 6} y={y * 6} width={4} height={4} className={on ? "fill-lime" : "fill-honeydew/25"} />
        ))}
      </svg>
      <div className="relative flex flex-col gap-2 p-5 md:p-6">{children}</div>
    </div>
  );
}
/* A small fixed stair: decoration, not data. */
const MOSAIC: [number, number, boolean][] = Array.from({ length: 8 * 8 }, (_, i) => {
  const x = i % 8;
  const y = Math.floor(i / 8);
  return [x, y, x + y >= 9 && (x * 7 + y * 3) % 5 !== 0] as [number, number, boolean];
});

/* --------------------------------------------------------------- PixelDune */

/** Columns = days of sales. 4px squares on a 6px pitch. Real data only. Today in Hunter. */
export function PixelDune({ days, rows = 10, className }: { days: number[]; rows?: number; className?: string }) {
  const max = Math.max(...days, 1);
  const total = days.reduce((a, b) => a + b, 0);
  return (
    <svg
      viewBox={`0 0 ${days.length * 6 - 2} ${rows * 6 - 2}`}
      role="img"
      aria-label={`Sales for the last ${days.length} days, $${total} in total.`}
      className={cn("block h-auto w-full [shape-rendering:crispEdges]", className)}
    >
      {days.map((d, x) => {
        const on = Math.max(d > 0 ? 1 : 0, Math.round((d / max) * rows));
        return Array.from({ length: rows }, (_, y) => {
          const lit = rows - y <= on;
          const fill = !lit ? "fill-hairline" : x === days.length - 1 ? "fill-hunter" : "fill-leaf";
          return <rect key={`${x}-${y}`} x={x * 6} y={y * 6} width={4} height={4} className={fill} />;
        });
      })}
    </svg>
  );
}

/* ---------------------------------------------------------------- SplitBar */

/** Every sale: the holdback (8% by default) against the rest, 3px gap. The shop's share is quiet so the drip is what you see. */
export function SplitBar({ className, legend = true, holdback = 8 }: { className?: string; legend?: boolean; holdback?: number }) {
  const keep = 100 - holdback;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex h-2 gap-0.75" aria-hidden>
        <span className="rounded-[2px] bg-unlit" style={{ flexGrow: keep, flexBasis: 0 }} />
        <span className="rounded-[2px] bg-hunter" style={{ flexGrow: holdback, flexBasis: 0 }} />
      </div>
      {legend ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-ledger text-[12px] text-charcoal-soft">
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-unlit" />{keep}% to you</span>
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-[2px] bg-hunter" />{holdback}% to your advance</span>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- WorldMark */

/** World view overlay (section 9) in utilities: dashed ONCHAIN outline, or a striped PRIVATE cover. */
export function WorldMark({ kind, show, children, className }: { kind: "pub" | "priv"; show: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      {children}
      <span
        aria-hidden={!show}
        className={cn(
          "pointer-events-none absolute transition-opacity duration-200",
          show ? "opacity-100" : "opacity-0",
          kind === "pub"
            ? "-inset-1 rounded-[10px] border-[1.5px] border-dashed border-hunter"
            : "-inset-0.5 z-1 rounded-[10px] bg-[repeating-linear-gradient(-45deg,var(--color-well)_0_6px,var(--color-surface)_6px_12px)] opacity-[.97]",
          !show && "opacity-0",
        )}
      />
      <span
        className={cn(
          "pointer-events-none absolute z-2 rounded-chip px-1.5 py-0.5 font-ledger text-[10px] font-semibold tracking-[0.1em] whitespace-nowrap transition-opacity duration-200",
          show ? "opacity-100" : "opacity-0",
          kind === "pub" ? "-top-3 right-1.5 bg-hunter text-canvas" : "top-1/2 left-1/2 -translate-1/2 bg-charcoal text-canvas",
        )}
      >
        {kind === "pub" ? "ONCHAIN" : "ON DEVICE · PRIVATE"}
      </span>
    </div>
  );
}
