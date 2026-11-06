import Link from "next/link";
import type { ReactNode } from "react";
import { BlockBand, BlockPanel } from "@/blocks";
import { Card, CheckIcon, ChevronLeftIcon, ExclaimIcon, Heading, JarBandStrip, Label, Text } from "@/final";
import { cn } from "@/lib/cn";

/*
 * Merchant screen blocks, built from the kit and tokens only. Kept here (not in final/) because they are the
 * merchant canvas's own compositions: the Hunter hero, the Charcoal money card, plain-words tints, check lists.
 */

/**
 * Hunter hero on the block pattern: the tiles run behind, a Hunter overlay (dim) keeps every line of text on dark
 * green, and a lime-to-Hunter rule closes it. Pick a different `seed` per screen so each reads as its own wall.
 * Keep text left-aligned inside it. Tighter on desktop (lg:p-5) so the screen fits one view.
 */
export function HeroBlock({
  className,
  children,
  rule = true,
  seed = 1,
  dim = 78,
  lit,
}: {
  className?: string;
  children: ReactNode;
  rule?: boolean;
  seed?: number;
  dim?: number;
  /** Tile indexes to light lime (a tier, a milestone). */
  lit?: number[];
}) {
  return (
    <section className={cn("relative flex flex-col overflow-hidden rounded-lg bg-hunter text-canvas", className)}>
      <BlockPanel
        seed={seed}
        dim={dim}
        lit={lit}
        cols={8}
        rows={6}
        grain={false}
        className="flex-1 rounded-none"
        bodyClassName="flex-1 gap-4 p-5 md:gap-5 md:p-7 lg:gap-3 lg:p-5"
      >
        {children}
      </BlockPanel>
      {rule ? <JarBandStrip className="h-1 shrink-0 rounded-none" /> : null}
    </section>
  );
}

/** A thin strip of tiles (about 20px): a card edge or divider. Phones show half the strip. */
export function BlockRule({ seed = 1, className }: { seed?: number; className?: string }) {
  return <BlockBand cols={24} rows={1} seed={seed} grain={false} className={cn("h-5 shrink-0", className)} />;
}

/**
 * Screen header. Phones: the standard stacked head (back link, label, h1, note). Desktop (lg+): one compact row,
 * so the screen below it gets the height: back link and label inline, a 20px title, the note beside it.
 */
export function ScreenHead({
  back,
  backLabel = "Back",
  label,
  title,
  children,
  actions,
}: {
  back?: string;
  backLabel?: string;
  label?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
      <div className="flex min-w-0 flex-col gap-2 lg:gap-0.5">
        {back || label ? (
          <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-3">
            {back ? (
              <Link
                href={back}
                className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md pr-3 pl-1 font-body text-note font-semibold text-charcoal-soft hover:bg-well hover:text-charcoal lg:-ml-1 lg:min-h-7 lg:pr-2"
              >
                <ChevronLeftIcon size={16} />
                {backLabel}
              </Link>
            ) : null}
            {label ? <Label>{label}</Label> : null}
          </div>
        ) : null}
        <Heading level={1} size="h1" className="lg:text-h1-sm">
          {title}
        </Heading>
        {children ? <Text className="max-w-[60ch] lg:text-note">{children}</Text> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
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
  return <Tag className={cn("m-0 font-display text-hero-sm tabular-nums md:text-hero lg:text-hero-sm", className)}>{children}</Tag>;
}

/** The back link PageHead draws, for screens whose title lives in the hero. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2 -mb-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-md pr-3 pl-1 lg:min-h-8 lg:-mb-3 font-body text-note font-semibold text-charcoal-soft hover:bg-well hover:text-charcoal"
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
