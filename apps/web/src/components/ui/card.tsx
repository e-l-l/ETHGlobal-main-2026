import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { AlertIcon, InfoIcon } from "@/components/icons";

/* --------------------------------------------------------------- surfaces */

/**
 * Surface fills shared by Card, Banner and tiles. `surface-ink` / `surface-subtle`
 * (theme.css) also remap role colors, so children need no onInk props.
 */
export const surfaces = {
  default: "border-line bg-card text-fg",
  ink: "surface-ink border-ink",
  tint: "border-accent-line bg-accent-tint text-accent-ink",
  subtle: "surface-subtle border-transparent text-fg",
  warn: "border-transparent bg-warn-tint text-warn",
  down: "border-transparent bg-down-tint text-down",
} as const;

/* ------------------------------------------------------------------- Card */

const cardVariants = cva("flex flex-col rounded-lg border", {
  variants: {
    tone: {
      default: surfaces.default,
      ink: surfaces.ink,
      tint: surfaces.tint,
      subtle: surfaces.subtle,
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

const bannerIcons = {
  tint: <InfoIcon size={18} />,
  warn: <AlertIcon size={18} />,
  down: <AlertIcon size={18} />,
  ink: <InfoIcon size={18} />,
} as const;

export type BannerProps = ComponentPropsWithoutRef<"div"> & {
  tone?: keyof typeof bannerIcons;
  /** Override the default icon; pass null to hide. */
  icon?: ReactNode;
};

export function Banner({ tone = "tint", icon, className, children, ...props }: BannerProps) {
  return (
    <div
      role={tone === "down" ? "alert" : "status"}
      className={cn("flex items-start gap-2.5 rounded-md border px-4 py-3 text-small", surfaces[tone], className)}
      {...props}
    >
      {icon === null ? null : <span className="mt-px shrink-0" aria-hidden>{icon ?? bannerIcons[tone]}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
