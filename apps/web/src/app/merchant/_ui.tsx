import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CheckIcon, ChevronLeftIcon, ExclaimIcon, Heading, Label } from "@/final";
import { cn } from "@/lib/cn";

/*
 * Merchant screen blocks, built from the kit and tokens only. Kept here (not in final/) because they are the
 * merchant canvas's own compositions: the Hunter hero, the Charcoal money card, plain-words tints, check lists.
 */

/**
 * Hunter hero with the brand fade (Hunter → Fern → Leaf) toward the lower right and a lime rule under it.
 * The fade starts late so every line of text sits on Hunter or Fern; keep text left-aligned inside it.
 */
export function HeroBlock({ className, children, rule = true }: { className?: string; children: ReactNode; rule?: boolean }) {
  return (
    <section className={cn("relative flex flex-col overflow-hidden rounded-lg bg-hunter text-canvas", className)}>
      <div className="flex flex-1 flex-col gap-4 bg-linear-115 from-hunter from-60% via-fern via-85% to-leaf p-5 md:gap-5 md:p-7">{children}</div>
      {rule ? <div aria-hidden className="h-1 shrink-0 bg-lime" /> : null}
    </section>
  );
}

/** Charcoal card: money that is ready to move. Lime label and lime action only. */
export function DarkBlock({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("flex flex-col gap-3 rounded-lg bg-charcoal p-5 text-canvas md:p-6", className)}>{children}</section>;
}

/** Mono label in lime: for Hunter and Charcoal grounds only. */
export function HeroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <Label className={cn("text-lime", className)}>{children}</Label>;
}

/** The screen's one big number. `as="h1"` when the figure is the page title. */
export function BigFigure({ children, className, as: Tag = "span" }: { children: ReactNode; className?: string; as?: "span" | "h1" }) {
  return <Tag className={cn("m-0 font-display text-hero-sm tabular-nums md:text-hero", className)}>{children}</Tag>;
}

/** The back link PageHead draws, for screens whose title lives in the hero. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2 -mb-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md pr-3 pl-1 font-body text-note font-semibold text-charcoal-soft hover:bg-well hover:text-charcoal"
    >
      <ChevronLeftIcon size={18} />
      {children}
    </Link>
  );
}

/** Progress on a dark ground: Honeydew track, lime fill. */
export function DarkMeter({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      className={cn("h-2.5 overflow-hidden rounded-chip bg-honeydew/20", className)}
    >
      <span className="block h-full w-full origin-left rounded-chip bg-lime transition-transform duration-300 ease-snappy" style={{ transform: `scaleX(${v})` }} />
    </div>
  );
}

/** Card section title (h2, 20px). */
export function CardTitle({ children, end }: { children: ReactNode; end?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Heading level={2} size="h2">
        {children}
      </Heading>
      {end}
    </div>
  );
}

/** "In plain words" tint: the terms said simply. */
export function PlainWords({ label = "In plain words", children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <Card tone="tint" gap="sm" className={className}>
      <Label className="text-hunter">{label}</Label>
      <div className="font-body text-read text-forest">{children}</div>
    </Card>
  );
}

/** Checked lines (reasons, how-to). `caution` marks the one line that needs care. */
export function CheckList({ items, label }: { items: { text: ReactNode; caution?: boolean }[]; label?: string }) {
  return (
    <ul aria-label={label} className="m-0 flex list-none flex-col p-0">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3 border-t border-hairline py-3 font-body text-read text-charcoal first:border-t-0 first:pt-0 last:pb-0">
          <span
            aria-hidden
            className={cn(
              "mt-0.5 grid size-5.5 shrink-0 place-items-center rounded-full",
              it.caution ? "bg-caution-tint text-caution" : "bg-honeydew text-fern",
            )}
          >
            {it.caution ? <ExclaimIcon size={13} /> : <CheckIcon size={13} strokeWidth={3} />}
          </span>
          <span className="min-w-0">{it.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Numbered steps (how customers pay). */
export function NumberedList({ items, label }: { items: ReactNode[]; label?: string }) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-col p-0">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-3 border-t border-hairline py-3 font-body text-read text-charcoal first:border-t-0 first:pt-0 last:pb-0">
          <span aria-hidden className="grid size-6.5 shrink-0 place-items-center rounded-full bg-honeydew font-display text-[13px] font-bold text-hunter">
            {i + 1}
          </span>
          <span className="min-w-0 pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  );
}

/** A small stat tile; `accent` is the Honeydew one (the advance's share). */
export function Tile({ label, value, sub, accent, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; accent?: boolean; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-md px-4 py-3.5", accent ? "border border-honeydew-line bg-honeydew text-hunter" : "bg-well text-charcoal", className)}>
      <span className={cn("font-body text-note", accent ? "text-hunter" : "text-charcoal-muted")}>{label}</span>
      <span className="font-display text-h1-sm tabular-nums">{value}</span>
      {sub ? <span className={cn("font-body text-note", accent ? "text-hunter" : "text-charcoal-muted")}>{sub}</span> : null}
    </div>
  );
}
