import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { AlertIcon, InfoIcon } from "@/components/icons";

/* ------------------------------------------------------------------- Card */

const cardVariants = cva("flex flex-col rounded-lg border", {
  variants: {
    tone: {
      default: "border-line bg-card text-ink",
      ink: "border-ink bg-ink text-on-ink",
      tint: "border-accent-line bg-accent-tint text-accent-ink",
      /* muted fails AA on subtle; remap the token inside this surface. */
      subtle: "border-transparent bg-subtle text-ink [--color-muted:var(--color-ink-soft)]",
    },
    padding: {
      sm: "p-4",
      md: "p-5",
      lg: "p-5 md:p-6",
    },
    gap: {
      none: "gap-0",
      sm: "gap-4",
      md: "gap-5",
      lg: "gap-5 md:gap-6",
    },
  },
  defaultVariants: { tone: "default", padding: "lg", gap: "sm" },
});

export type CardProps = ComponentPropsWithoutRef<"div"> &
  VariantProps<typeof cardVariants> & {
    as?: "div" | "section" | "article" | "aside";
  };

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { as: Tag = "div", tone, padding, gap, className, ...props },
  ref,
) {
  return <Tag ref={ref} className={cn(cardVariants({ tone, padding, gap }), className)} {...props} />;
});

export type CardHeaderProps = ComponentPropsWithoutRef<"div"> & {
  /** Right-side slot: a TextLink or Pill. */
  aside?: ReactNode;
};

export function CardHeader({ aside, className, children, ...props }: CardHeaderProps) {
  return (
    <div className={cn("flex min-h-6 items-center justify-between gap-3", className)} {...props}>
      <div className="min-w-0">{children}</div>
      {aside ? <div className="-my-2.5 shrink-0">{aside}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Banner */

const bannerTones = {
  tint: { cls: "border-accent-line bg-accent-tint text-accent-ink", icon: <InfoIcon size={18} /> },
  warn: { cls: "border-transparent bg-warn-tint text-warn", icon: <AlertIcon size={18} /> },
  down: { cls: "border-transparent bg-down-tint text-down", icon: <AlertIcon size={18} /> },
  ink: { cls: "border-ink bg-ink text-on-ink", icon: <InfoIcon size={18} /> },
} as const;

export type BannerProps = ComponentPropsWithoutRef<"div"> & {
  tone?: keyof typeof bannerTones;
  /** Override the default icon; pass null to hide. */
  icon?: ReactNode;
};

export function Banner({ tone = "tint", icon, className, children, ...props }: BannerProps) {
  const t = bannerTones[tone];
  return (
    <div
      role={tone === "down" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-md border px-4 py-3 text-small", t.cls, className)}
      {...props}
    >
      {icon === null ? null : <span className="mt-px shrink-0" aria-hidden>{icon ?? t.icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
