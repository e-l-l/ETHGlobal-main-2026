import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ChevronRightIcon } from "./icons";
import { Label, Ledger, Money } from "./text";
import { Pill } from "./status";
import { SplitBar } from "./patterns";

/* ---------------------------------------------------------------- JarCard */

/** The drip card: Hunter ground, lime figure. The one place lime carries a number. */
export function JarCard({ usd, rate, goal, children }: { usd: number; rate?: number; goal?: number; children?: ReactNode }) {
  const v = goal ? Math.min(1, usd / goal) : 0;
  return (
    <div className="relative flex min-w-0 flex-col gap-3.5 rounded-lg bg-hunter p-5 text-canvas">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-honeydew/80">Your drip balance</Label>
        <Pill tone="saving" className="bg-lime text-charcoal">Saving</Pill>
      </div>
      <Money usd={usd} rate={rate} figureClassName="text-lime" localClassName="text-honeydew/80" />
      {goal ? (
        <div className="flex flex-col gap-2">
          <div className="h-2 overflow-hidden rounded-chip bg-lime/20" aria-hidden>
            <span className="block h-full w-full origin-left rounded-chip bg-lime transition-transform duration-300 ease-snappy" style={{ transform: `scaleX(${v})` }} />
          </div>
          <span className="font-body text-note text-honeydew/85">{Math.round(v * 100)}% of the ${goal} that unlocks your next limit</span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- SaleRow */

export function SaleRow({ amount, time, item }: { amount: number; time: string; item: string }) {
  return (
    <li className="flex flex-col gap-2 border-t border-hairline py-3.5 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-body text-read font-semibold text-charcoal">{item}</span>
        <span className="font-display text-h2 tabular-nums text-charcoal">${amount.toFixed(2)}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Ledger className="text-charcoal-muted">{time}</Ledger>
        <Ledger className="text-hunter">+${(amount / 10).toFixed(2)} dripped back</Ledger>
      </div>
      <SplitBar legend={false} />
    </li>
  );
}

/* -------------------------------------------------------------- Waterfall */

/** Who absorbs a loss, top first. The viewer's layer fills Hunter. */
export function LossWaterfall({ you }: { you: "jar" | "junior" | "reserve" | "senior" }) {
  const tiers = [
    { k: "jar", t: "Shop's drip", d: "First 10% of every sale" },
    { k: "junior", t: "Junior (DRIP-J)", d: "First loss for a 30% fee share" },
    { k: "reserve", t: "Reserve", d: "Protocol buffer" },
    { k: "senior", t: "Senior vault", d: "Lenders, paid last to lose" },
  ] as const;
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {tiers.map((t, i) => (
        <li key={t.k} className="flex flex-col">
          {i > 0 ? <span aria-hidden className="grid h-5.5 place-items-center text-charcoal-muted"><ChevronRightIcon size={16} className="rotate-90" /></span> : null}
          <div
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3.5",
              t.k === you ? "border-hunter bg-hunter text-canvas" : "border-hairline bg-surface text-charcoal",
            )}
          >
            <span className={cn("font-ledger text-tag font-semibold", t.k === you ? "text-lime" : "text-charcoal-muted")}>0{i + 1}</span>
            <div className="flex min-w-0 flex-col">
              <span className="font-body text-read font-semibold">{t.t}{t.k === you ? " · you" : ""}</span>
              <span className={cn("font-body text-note", t.k === you ? "text-honeydew/85" : "text-charcoal-muted")}>{t.d}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------- BottomNav */

export function BottomNav({ items, active, className }: { items: { key: string; label: string; icon: ReactNode }[]; active: string; className?: string }) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        "sticky bottom-0 grid grid-cols-4 border-t border-hairline bg-surface/85 px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] backdrop-blur-xl backdrop-saturate-150 motion-reduce:backdrop-blur-none",
        className,
      )}
    >
      {items.map((it) => {
        const on = it.key === active;
        return (
          <a
            key={it.key}
            href={`#nav-${it.key}`}
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex min-h-13 flex-col items-center justify-center gap-0.5 rounded-[10px] font-body text-[12px] font-semibold select-none",
              on ? "text-charcoal [&_svg]:text-hunter" : "text-charcoal-muted",
            )}
          >
            {it.icon}
            {it.label}
            {on ? <span aria-hidden className="mt-0.5 h-0.75 w-4 rounded-full bg-lime ring-1 ring-hunter/30" /> : null}
          </a>
        );
      })}
    </nav>
  );
}
