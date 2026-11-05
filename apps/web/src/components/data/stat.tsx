import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatLocal, formatMoney } from "@/lib/format";
import { Card, type CardProps } from "@/components/ui/card";
import { Label } from "@/components/ui/text";

/* ------------------------------------------------------------------- Stat */

const statSizes = {
  lg: "text-[28px] leading-[1.1] tracking-[-0.03em] md:text-figure",
  xl: "text-[40px] leading-none tracking-[-0.04em] md:text-[44px]",
  hero: "text-[44px] leading-[0.98] tracking-[-0.045em] md:text-[56px]",
} as const;

export type StatProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  size?: keyof typeof statSizes;
  tone?: "default" | "up" | "down";
  onInk?: boolean;
};

export function Stat({ label, value, sub, size = "lg", tone = "default", onInk, className, ...props }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...props}>
      <Label onInk={onInk}>{label}</Label>
      <div
        className={cn(
          "font-semibold tabular-nums",
          statSizes[size],
          tone === "up" ? (onInk ? "text-accent" : "text-accent-text") : tone === "down" ? "text-down" : onInk ? "text-on-ink" : "text-ink",
        )}
      >
        {value}
      </div>
      {sub ? <div className={cn("text-small", onInk ? "text-on-ink/70" : "text-muted")}>{sub}</div> : null}
    </div>
  );
}

/* --------------------------------------------------------------- StatGrid */

export function StatGrid({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("grid grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))] gap-4", className)} {...props} />;
}

export type StatCardProps = StatProps & { cardTone?: CardProps["tone"] };

/** Shorthand for <Card><Stat/></Card>. */
export function StatCard({ cardTone = "default", className, ...stat }: StatCardProps) {
  return (
    <Card tone={cardTone} padding="md" className={className}>
      <Stat onInk={cardTone === "ink"} {...stat} />
    </Card>
  );
}

/* ----------------------------------------------------------- KeyValueList */

export type KeyValueItem = { k: ReactNode; v: ReactNode; href?: string };

export type KeyValueListProps = Omit<ComponentPropsWithoutRef<"dl">, "children"> & {
  items: KeyValueItem[];
  size?: "sm" | "md";
  divider?: "solid" | "none";
  onInk?: boolean;
  /** Emphasize one row (e.g. current tier): ink row. */
  highlightIndex?: number;
};

export function KeyValueList({
  items,
  size = "md",
  divider = "solid",
  onInk,
  highlightIndex,
  className,
  ...props
}: KeyValueListProps) {
  const row = cn(
    "flex items-baseline justify-between gap-4",
    size === "sm" ? "py-2.5 text-small" : "py-3 text-body",
    divider === "solid" && (onInk ? "border-t border-on-ink/15" : "border-t border-line"),
  );
  return (
    <dl className={cn("flex flex-col", className)} {...props}>
      {items.map((it, i) => {
        const hi = i === highlightIndex;
        const keyCls = cn("min-w-0", hi ? "text-on-ink" : onInk ? "text-on-ink/70" : "text-ink-soft");
        const valCls = cn("text-right font-semibold tabular-nums", hi || onInk ? "text-on-ink" : "text-ink");
        const hiCls = hi && "-mx-3 rounded-md border-t-transparent bg-ink px-3";
        if (it.href) {
          return (
            /* Stretched-link pattern: the <a> lives in <dt> (valid <dl>), its ::after covers the row. */
            <div key={i} className={cn(row, "relative min-h-11 items-center hover:bg-subtle")}>
              <dt className={keyCls}>
                <Link href={it.href} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-ink">
                  {it.k}
                </Link>
              </dt>
              <dd className={cn(valCls, "flex items-center gap-2")}>
                {it.v}
                <span aria-hidden className="text-muted">
                  ›
                </span>
              </dd>
            </div>
          );
        }
        return (
          <div key={i} className={cn(row, hiCls)}>
            <dt className={keyCls}>{it.k}</dt>
            <dd className={valCls}>{it.v}</dd>
          </div>
        );
      })}
    </dl>
  );
}

/* ------------------------------------------------------------------ Money */

export type MoneyProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  amount: number;
  currency?: string;
  local?: { amount: number; currency: string };
  size?: keyof typeof statSizes;
  onInk?: boolean;
  /** Use accent (on ink) / accent-text color for the figure. */
  accent?: boolean;
};

export function Money({ amount, currency = "USD", local, size = "lg", onInk, accent, className, ...props }: MoneyProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)} {...props}>
      <span
        className={cn(
          "font-semibold tabular-nums",
          statSizes[size],
          accent ? (onInk ? "text-accent" : "text-accent-text") : onInk ? "text-on-ink" : "text-ink",
        )}
      >
        {formatMoney(amount, currency)}
      </span>
      {local ? (
        <span className={cn("font-mono text-mono", onInk ? "text-on-ink/70" : "text-muted")}>
          {formatLocal(local.amount, local.currency)}
        </span>
      ) : null}
    </div>
  );
}
