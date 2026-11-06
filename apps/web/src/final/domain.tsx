import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { ChevronRightIcon } from "./icons";
import { Label, Ledger, Money } from "./text";
import { Pill } from "./status";
import { SplitBar } from "./patterns";

/* ---------------------------------------------------------------- JarCard */

/** Repaid so far: Hunter ground, lime figure. The one place lime carries a number. */
export function JarCard({ usd, rate, goal, children }: { usd: number; rate?: number; goal?: number; children?: ReactNode }) {
  const v = goal ? Math.min(1, usd / goal) : 0;
  return (
    <div className="relative flex min-w-0 flex-col gap-3.5 rounded-lg bg-hunter p-5 text-canvas">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-honeydew/80">Repaid so far</Label>
        <Pill tone="saving" className="bg-lime text-charcoal">Repaying</Pill>
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
        <Ledger className="text-hunter">+${(amount * 0.08).toFixed(2)} to your advance</Ledger>
      </div>
      <SplitBar legend={false} />
    </li>
  );
}

/* -------------------------------------------------------------- Waterfall */

/**
 * Layer keys as the SDK's `lender.waterfall()` sends them (contract names: the first-loss tranche is "junior",
 * the vault is "senior"). Screens can pass `you="dripcoin"` / `you="vault"` instead. The SDK's "jar" layer (the
 * shops' fee holdback, an estimate) is accepted and not drawn: losses run DripCoin, then the reserve, then the vault.
 */
export type LossLayerKey = "jar" | "junior" | "reserve" | "senior";
export type LossViewer = LossLayerKey | "dripcoin" | "vault";

/** Live numbers for one layer (from the SDK's `lender.waterfall()`). Title / description override the defaults. */
export type LossLayerAmount = { key: LossLayerKey; amount: string; title?: string; description?: string; estimated?: boolean; yours?: string };

const viewerKey = (v: LossViewer): LossLayerKey => (v === "dripcoin" ? "junior" : v === "vault" ? "senior" : v);

/**
 * Who absorbs a loss, top first: DripCoin, the reserve, the vault. The viewer's layer fills Hunter. Pass `layers`
 * to show live amounts per layer (an estimated one is tagged "est.").
 */
export function LossWaterfall({ you, layers }: { you: LossViewer; layers?: readonly LossLayerAmount[] }) {
  const tiers = [
    { k: "junior", t: "DripCoin (DRIP)", d: "First loss, for 30% of every fee" },
    { k: "reserve", t: "Reserve", d: "Fees and hook fees held back" },
    { k: "senior", t: "Vault", d: "Lenders, last to lose" },
  ] as const;
  const live = new Map(layers?.map((l) => [l.key, l]));
  const mineKey = viewerKey(you);
  return (
    <ol className="m-0 flex list-none flex-col p-0">
      {tiers.map((t, i) => {
        const l = live.get(t.k);
        const mine = t.k === mineKey;
        return (
          <li key={t.k} className="flex flex-col">
            {i > 0 ? <span aria-hidden className="grid h-5.5 place-items-center text-charcoal-muted"><ChevronRightIcon size={16} className="rotate-90" /></span> : null}
            <div
              className={cn(
                "flex items-center gap-3 rounded-xl border px-4 py-3.5",
                mine ? "border-hunter bg-hunter text-canvas" : "border-hairline bg-surface text-charcoal",
              )}
            >
              <span className={cn("font-ledger text-tag font-semibold", l && "self-start pt-0.5", mine ? "text-lime" : "text-charcoal-muted")}>0{i + 1}</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-body text-read font-semibold">{l?.title ?? t.t}{mine ? " · you" : ""}</span>
                <span className={cn("font-body text-note", mine ? "text-honeydew/85" : "text-charcoal-muted")}>{l?.description ?? t.d}</span>
              </div>
              {l ? (
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                  <span className={cn("font-display text-h2 tabular-nums", mine ? "text-lime" : "text-charcoal")}>{l.amount}</span>
                  {l.estimated ? <span className={cn("font-ledger text-tag font-semibold uppercase", mine ? "text-honeydew/80" : "text-charcoal-muted")}>est.</span> : null}
                  {l.yours ? <span className={cn("font-ledger text-ledger", mine ? "text-honeydew/85" : "text-charcoal-soft")}>{l.yours}</span> : null}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
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
