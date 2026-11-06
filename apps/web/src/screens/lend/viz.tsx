"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Label } from "@/final";

/*
 * Compact, animated pieces for the public dashboards (/protocol, /risk): more numbers in less height.
 * Bars grow from their base once on load, staggered; reduced motion shows them at full size.
 */

/** "$1.2M" → 1200000, "$300" → 300, "—" → 0. */
export function num(s: string | number | undefined): number {
  if (typeof s === "number") return s;
  const m = /(-?[\d,.]+)\s*([kKmMbB])?/.exec(s ?? "");
  if (!m) return 0;
  const n = parseFloat(m[1]!.replace(/,/g, "")) || 0;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  return n * mult;
}

const IN = "motion-safe:animate-[page-in_420ms_var(--ease-snappy)_both]";

/** Four-up tiles: label, one figure, a one-line note. Replaces the tall StatGrid. */
export function MiniStats({ items, className }: { items: { label: ReactNode; value: ReactNode; sub?: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 md:grid-cols-4", className)}>
      {items.map((s, i) => (
        <div key={i} className={cn("flex min-w-0 flex-col gap-0.5 rounded-lg border border-hairline bg-surface px-3.5 py-2.5", IN)} style={{ animationDelay: `${i * 40}ms` }}>
          <span className="truncate font-ledger text-tag text-charcoal-muted uppercase">{s.label}</span>
          <span className="truncate font-display text-h2 text-charcoal tabular-nums">{s.value}</span>
          {s.sub ? <span className="truncate font-body text-[12px] text-charcoal-muted">{s.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

/** A tight card with a small label. */
export function Panel({ title, aside, children, className, tone = "surface" }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; tone?: "surface" | "tint" | "caution" }) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border p-4",
        tone === "surface" && "border-hairline bg-surface",
        tone === "tint" && "border-honeydew-line bg-honeydew",
        tone === "caution" && "border-transparent bg-caution-tint",
        IN,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <Label className={tone === "tint" ? "text-hunter" : tone === "caution" ? "text-caution" : undefined}>{title}</Label>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Horizontal bars that grow left to right, scaled to the largest. */
export function GrowBars({ rows }: { rows: { label: string; value: number; text: string; className?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3">
          <span className="font-body text-note text-charcoal-soft">{r.label}</span>
          <span className="h-5 overflow-hidden rounded-xs bg-well">
            <span
              className={cn("block h-full origin-left rounded-xs bg-hunter motion-safe:animate-[bar-grow_800ms_var(--ease-snappy)_both]", r.className)}
              style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, animationDelay: `${120 + i * 110}ms` }}
            />
          </span>
          <span className="font-ledger text-ledger text-charcoal tabular-nums">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Advance limits as steps rising left to right. A lowered limit shows the old height as an outline behind it. */
export function Stairs({ steps }: { steps: { label: string; cap: string; was?: string | undefined }[] }) {
  const max = Math.max(...steps.map((s) => Math.max(num(s.cap), num(s.was))), 1);
  return (
    <div className="flex h-36 items-end gap-2" role="list">
      {steps.map((s, i) => {
        const h = (num(s.cap) / max) * 100;
        const wasH = s.was && s.was !== s.cap ? (num(s.was) / max) * 100 : 0;
        return (
          <div key={s.label} role="listitem" className="relative flex h-full min-w-0 flex-1 flex-col justify-end gap-1 text-center">
            <span className="font-display text-note font-bold text-charcoal tabular-nums">{s.cap}</span>
            <div className="relative flex flex-1 items-end">
              {wasH ? <span aria-hidden className="absolute inset-x-0 bottom-0 rounded-t-xs border-2 border-dashed border-caution/60" style={{ height: `${wasH}%` }} /> : null}
              <span
                className="relative block w-full origin-bottom rounded-t-xs bg-hunter motion-safe:animate-[rise_650ms_var(--ease-snappy)_both]"
                style={{ height: `${h}%`, animationDelay: `${150 + i * 110}ms` }}
              />
            </div>
            <span className="truncate font-body text-[11px] text-charcoal-muted">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
