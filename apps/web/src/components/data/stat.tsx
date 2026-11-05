import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatLocal, formatMoney } from "@/lib/format";
import { Card, type CardProps } from "@/components/ui/card";
import { Label, Mono } from "@/components/ui/text";

/*
 * Colors use role tokens (fg, fg-muted, fg-accent, rule): inside a Card tone="ink"
 * everything flips to on-ink / accent automatically.
 */

/* ---------------------------------------------------------------- figures */

/** Big-number sizes shared by Stat, Money and domain cards. */
export const figureSizes = {
  lg: "text-[28px] leading-[1.1] tracking-[-0.03em] md:text-figure",
  xl: "text-[40px] leading-none tracking-[-0.04em] md:text-[44px]",
  hero: "text-[44px] leading-[0.98] tracking-[-0.045em] md:text-[56px]",
} as const;

export type FigureSize = keyof typeof figureSizes;

const figureTones = {
  default: "text-fg",
  up: "text-fg-accent",
  down: "text-down",
} as const;

export function figureClass(size: FigureSize = "lg", tone: keyof typeof figureTones = "default") {
  return cn("font-semibold tabular-nums", figureSizes[size], figureTones[tone]);
}

/* ------------------------------------------------------------------- Stat */

export type StatProps = Omit<ComponentPropsWithoutRef<"div">, "children"> & {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  size?: FigureSize;
  tone?: keyof typeof figureTones;
};

export function Stat({ label, value, sub, size = "lg", tone = "default", className, ...props }: StatProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...props}>
      <Label>{label}</Label>
      <div className={figureClass(size, tone)}>{value}</div>
      {sub ? <div className="text-small text-fg-muted">{sub}</div> : null}
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
      <Stat {...stat} />
    </Card>
  );
}

/* ----------------------------------------------------------- KeyValueList */

export type KeyValueItem = { k: ReactNode; v: ReactNode; href?: string };

export type KeyValueListProps = Omit<ComponentPropsWithoutRef<"dl">, "children"> & {
  items: KeyValueItem[];
  size?: "sm" | "md";
  divider?: "solid" | "none";
  /** Emphasize one row (e.g. current tier): ink row. */
  highlightIndex?: number;
};

export function KeyValueList({ items, size = "md", divider = "solid", highlightIndex, className, ...props }: KeyValueListProps) {
  const row = cn(
    "flex items-baseline justify-between gap-4",
    size === "sm" ? "py-2.5 text-small" : "py-3 text-body",
    divider === "solid" && "border-t border-rule",
  );
  const keyCls = "min-w-0 text-fg-soft";
  const valCls = "text-right font-semibold text-fg tabular-nums";
  return (
    <dl className={cn("flex flex-col", className)} {...props}>
      {items.map((it, i) => {
        if (it.href) {
          return (
            /* Stretched-link pattern: the <a> lives in <dt> (valid <dl>), its ::after covers the row. */
            <div key={i} className={cn(row, "relative min-h-11 items-center hover:bg-fg/5")}>
              <dt className={keyCls}>
                <Link
                  href={it.href}
                  className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-fg"
                >
                  {it.k}
                </Link>
              </dt>
              <dd className={cn(valCls, "flex items-center gap-2")}>
                {it.v}
                <span aria-hidden className="text-fg-muted">
                  ›
                </span>
              </dd>
            </div>
          );
        }
        return (
          <div key={i} className={cn(row, i === highlightIndex && "surface-ink -mx-3 rounded-md border-t-transparent px-3")}>
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
  size?: FigureSize;
  /** Accent figure: accent-text on light, lime on ink surfaces. */
  accent?: boolean;
};

export function Money({ amount, currency = "USD", local, size = "lg", accent, className, ...props }: MoneyProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)} {...props}>
      <span className={figureClass(size, accent ? "up" : "default")}>{formatMoney(amount, currency)}</span>
      {local ? <Mono>{formatLocal(local.amount, local.currency)}</Mono> : null}
    </div>
  );
}
