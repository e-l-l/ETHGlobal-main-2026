import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ChevronRightIcon } from "./icons";
import { Label, Ledger } from "./text";

/* ------------------------------------------------------------------- Stat */

export function Stat({ label, value, sub, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <Label>{label}</Label>
      <strong className="font-display text-h1-sm font-bold text-charcoal tabular-nums">{value}</strong>
      {sub ? <span className="font-body text-note text-charcoal-muted">{sub}</span> : null}
    </div>
  );
}

/** Stats in white tiles: 2 across on phones, up to 4 on desktop. */
export function StatGrid({ items, className }: { items: { label: ReactNode; value: ReactNode; sub?: ReactNode }[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", items.length >= 4 ? "md:grid-cols-4" : items.length === 3 ? "md:grid-cols-3" : "", className)}>
      {items.map((s, i) => (
        <div key={i} className="rounded-lg border border-hairline bg-surface p-4">
          <Stat {...s} />
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- ListRow */

/** Tappable row: lead icon, title + sub, trailing value, chevron. Wrap several in <RowList>. */
export function ListRow({ href, onClick, lead, title, sub, end, className }: { href?: string; onClick?: () => void; lead?: ReactNode; title: ReactNode; sub?: ReactNode; end?: ReactNode; className?: string }) {
  const body = (
    <>
      {lead ? <span className="grid size-10 shrink-0 place-items-center rounded-md bg-well text-hunter">{lead}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-body text-read font-semibold text-charcoal">{title}</span>
        {sub ? <span className="font-body text-note text-charcoal-muted">{sub}</span> : null}
      </span>
      {end ? <span className="shrink-0 text-right font-body text-read font-semibold text-charcoal tabular-nums">{end}</span> : null}
      {href || onClick ? <ChevronRightIcon size={18} className="shrink-0 text-charcoal-muted" /> : null}
    </>
  );
  const cls = cn("flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left", (href || onClick) && "cursor-pointer transition-colors duration-150 hover:bg-well", className);
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

export function RowList({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <ul aria-label={label} className={cn("m-0 list-none divide-y divide-hairline overflow-hidden rounded-lg border border-hairline bg-surface p-0", className)}>
      {Array.isArray(children) ? children.map((c, i) => <li key={i}>{c}</li>) : <li>{children}</li>}
    </ul>
  );
}

/* -------------------------------------------------------------- LineChart */

/** One series, Hunter line over a Honeydew fill. Markers label points (e.g. "Advance drawn"). */
export function LineChart({
  points,
  label,
  height = 180,
  xLabels,
  markers,
  format = (v) => String(v),
  className,
}: {
  points: number[];
  label: string;
  height?: number;
  /** Shown under the chart, first / middle / last are enough. */
  xLabels?: string[];
  markers?: { index: number; label: string }[];
  format?: (v: number) => string;
  className?: string;
}) {
  const W = 600;
  const H = height;
  const pad = 8;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / Math.max(1, points.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
  const line = points.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`;
  const last = points[points.length - 1] ?? 0;
  return (
    <figure className={cn("m-0 flex flex-col gap-2", className)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label}. From ${format(points[0] ?? 0)} to ${format(last)}.`} className="block h-auto w-full" style={{ aspectRatio: `${W} / ${H}` }}>
        <path d={area} className="fill-honeydew" />
        <path d={line} fill="none" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" className="stroke-hunter" />
        {markers?.map((m) => (
          <g key={m.index}>
            <line x1={x(m.index)} x2={x(m.index)} y1={0} y2={H} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" className="stroke-control" />
            <circle cx={x(m.index)} cy={y(points[m.index] ?? 0)} r="5" className="fill-hunter" />
          </g>
        ))}
      </svg>
      {markers?.length ? (
        <figcaption className="flex flex-wrap gap-x-4 font-ledger text-ledger text-charcoal-muted">
          {markers.map((m) => (
            <span key={m.index} className="inline-flex items-center gap-1.5">
              <i aria-hidden className="size-2 rounded-full bg-hunter" />
              {m.label}
            </span>
          ))}
        </figcaption>
      ) : null}
      {xLabels?.length ? (
        <div aria-hidden className="flex justify-between font-ledger text-ledger text-charcoal-muted">
          {xLabels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      ) : null}
    </figure>
  );
}

/* --------------------------------------------------------------- BarChart */

/** Vertical bars, one per label. `highlight` indexes render Hunter, the rest Unlit. */
export function BarChart({ values, labels, label, highlight = [], height = 140, format = (v) => String(v) }: { values: number[]; labels: string[]; label: string; highlight?: number[]; height?: number; format?: (v: number) => string }) {
  const max = Math.max(...values, 1);
  return (
    <figure className="m-0 flex flex-col gap-2" aria-label={label}>
      <div className="flex items-end gap-2" style={{ height }}>
        {values.map((v, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${labels[i]}: ${format(v)}`}>
            <span className={cn("block w-full rounded-t-[4px]", highlight.includes(i) ? "bg-hunter" : "bg-unlit")} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-2 font-ledger text-ledger text-charcoal-muted">
        {labels.map((l, i) => (
          <span key={i} className="flex-1 text-center">{l}</span>
        ))}
      </div>
      <figcaption className="sr-only">{values.map((v, i) => `${labels[i]} ${format(v)}`).join(", ")}</figcaption>
    </figure>
  );
}

/* -------------------------------------------------------------- DataTable */

export type Column<R> = { key: string; label: string; align?: "left" | "right"; render: (row: R) => ReactNode };

/** Table on desktop, stacked cards on phones (no horizontal scroll at 390px). */
export function DataTable<R>({ columns, rows, caption, rowKey }: { columns: Column<R>[]; rows: R[]; caption: string; rowKey: (row: R, i: number) => string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface">
      <table className="hidden w-full border-collapse font-body text-note md:table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-hairline">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-4 py-3 font-ledger text-tag font-medium uppercase text-charcoal-muted", c.align === "right" ? "text-right" : "text-left")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)} className="border-b border-hairline last:border-0">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3 text-charcoal tabular-nums", c.align === "right" && "text-right")}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <ul aria-label={caption} className="m-0 list-none divide-y divide-hairline p-0 md:hidden">
        {rows.map((r, i) => (
          <li key={rowKey(r, i)} className="flex flex-col gap-1.5 px-4 py-3">
            {columns.map((c) => (
              <div key={c.key} className="flex justify-between gap-4 font-body text-note">
                <span className="text-charcoal-muted">{c.label}</span>
                <span className="min-w-0 text-right font-semibold text-charcoal tabular-nums [overflow-wrap:anywhere]">{c.render(r)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------- ActivityList */

export type Activity = { id: string; title: ReactNode; when: string; detail?: ReactNode; tag?: ReactNode };

/** A timeline of events, newest first (agent decisions, risk log, sales). */
export function ActivityList({ items, label }: { items: Activity[]; label: string }) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-col p-0">
      {items.map((a) => (
        <li key={a.id} className="relative flex gap-3 pb-5 pl-5 last:pb-0 before:absolute before:top-2 before:bottom-0 before:left-[4px] before:w-px before:bg-hairline last:before:hidden">
          <span aria-hidden className="absolute top-1.5 left-0 size-2.5 rounded-full bg-hunter ring-4 ring-honeydew" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-body text-read font-semibold text-charcoal">{a.title}</span>
              <Ledger className="text-charcoal-muted">{a.when}</Ledger>
            </div>
            {a.tag}
            {a.detail ? <div className="font-body text-note text-charcoal-soft">{a.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
