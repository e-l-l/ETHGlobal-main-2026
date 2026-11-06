import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/*
 * Typography: dev2 only. Urbanist for display and money, Figtree for reading,
 * JetBrains Mono for the ledger (labels, IDs, timestamps, local amounts).
 */

/* ---------------------------------------------------------------- Heading */

const headingVariants = cva("font-display text-balance text-charcoal", {
  variants: {
    size: {
      hero: "text-hero-sm md:text-hero",
      h1: "text-h1-sm md:text-h1",
      h2: "text-h2",
    },
  },
  defaultVariants: { size: "h1" },
});

export type HeadingProps = ComponentPropsWithoutRef<"h2"> &
  VariantProps<typeof headingVariants> & { level?: 1 | 2 | 3 | 4 };

export function Heading({ level = 2, size, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as ElementType;
  return <Tag className={cn(headingVariants({ size }), className)} {...props} />;
}

/* ------------------------------------------------------------------- Text */

const textVariants = cva("font-body", {
  variants: {
    size: { read: "text-read", note: "text-note" },
    tone: { soft: "text-charcoal-soft", strong: "text-charcoal", muted: "text-charcoal-muted" },
  },
  defaultVariants: { size: "read", tone: "soft" },
});

export type TextProps = ComponentPropsWithoutRef<"p"> & VariantProps<typeof textVariants>;

export function Text({ size, tone, className, ...props }: TextProps) {
  return <p className={cn(textVariants({ size, tone }), className)} {...props} />;
}

/* ------------------------------------------------------------------ Label */

/** Mono 11, uppercase, +0.1em. Section labels, field labels, table heads. */
export function Label({ className, as: Tag = "span", ...props }: ComponentPropsWithoutRef<"span"> & { as?: ElementType }) {
  return <Tag className={cn("font-ledger text-tag font-medium uppercase text-charcoal-muted", className)} {...props} />;
}

/* ----------------------------------------------------------------- Ledger */

/** Mono 13 for IDs, hashes, timestamps and amounts in lists. */
export function Ledger({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={cn("font-ledger text-ledger text-charcoal-soft tabular-nums", className)} {...props} />;
}

/* ------------------------------------------------------------------ Money */

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const ars = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export type MoneyProps = {
  usd: number;
  /** Local amount under the dollars, prefixed ≈. Pass the rate; omit to hide. */
  rate?: number;
  size?: "amount" | "h1" | "h2";
  className?: string;
  /** Override the figure colour (e.g. lime inside the jar card). */
  figureClassName?: string;
  localClassName?: string;
};

/** Say the number once: dollars first in Urbanist, local currency underneath in mono. */
export function Money({ usd: amount, rate, size = "amount", className, figureClassName, localClassName }: MoneyProps) {
  return (
    <span className={cn("flex flex-col gap-1", className)}>
      <span className={cn("font-display tabular-nums text-charcoal", { amount: "text-amount", h1: "text-h1", h2: "text-h2" }[size], figureClassName)}>
        {usd.format(amount)}
      </span>
      {rate ? (
        <span className={cn("font-ledger text-ledger text-charcoal-muted tabular-nums", localClassName)}>
          ≈ ARS {ars.format(Math.round(amount * rate))}
        </span>
      ) : null}
    </span>
  );
}

/* ---------------------------------------------------------------- Eyebrow */

/** Heading with a mono label above it: the standard section opener. */
export function SectionHead({ label, title, children }: { label: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Heading level={2} size="h1">{title}</Heading>
      {children ? <Text className="max-w-[60ch]">{children}</Text> : null}
    </div>
  );
}
