import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/*
 * Text colors use role tokens (fg, fg-soft, fg-muted, fg-accent), so every component
 * here adapts automatically inside `surface-ink` / `surface-subtle`. No onInk props.
 */

/* ---------------------------------------------------------------- Heading */

const headingVariants = cva("font-semibold text-fg text-balance", {
  variants: {
    size: {
      display: "text-[40px] leading-[0.98] tracking-[-0.045em] md:text-display",
      xl: "text-[34px] leading-none tracking-[-0.04em] md:text-[52px]",
      lg: "text-figure md:text-[40px] md:leading-none md:tracking-[-0.035em]",
      md: "text-[26px] leading-[1.1] tracking-[-0.03em] md:text-[36px]",
      sm: "text-[20px] leading-[1.2] tracking-[-0.02em] md:text-title",
    },
  },
  defaultVariants: { size: "md" },
});

export type HeadingProps = ComponentPropsWithoutRef<"h1"> &
  VariantProps<typeof headingVariants> & {
    level?: 1 | 2 | 3;
  };

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(function Heading(
  { level = 2, size, className, ...props },
  ref,
) {
  const Tag = `h${level}` as const;
  return <Tag ref={ref} className={cn(headingVariants({ size }), className)} {...props} />;
});

/* ----------------------------------------------------------------- Accent */

export type AccentProps = ComponentPropsWithoutRef<"em"> & {
  tone?: "accent" | "down";
};

/** The brand's serif italic word. At most one per heading. */
export function Accent({ tone = "accent", className, ...props }: AccentProps) {
  return (
    <em
      className={cn(
        "font-serif text-[1.12em] font-normal tracking-normal italic",
        tone === "accent" ? "text-fg-accent" : "text-down",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ tones */

/** Shared text tone map for Eyebrow, Mono and Text. */
const tones = {
  ink: "text-fg",
  soft: "text-fg-soft",
  muted: "text-fg-muted",
  accent: "text-fg-accent",
  down: "text-down",
} as const;

type Tone = keyof typeof tones;

/* ---------------------------------------------------------------- Eyebrow */

export type EyebrowProps = ComponentPropsWithoutRef<"p"> & {
  tone?: Exclude<Tone, "soft">;
};

export function Eyebrow({ tone = "accent", className, ...props }: EyebrowProps) {
  return (
    <p
      className={cn("font-mono text-[12px] tracking-[0.06em] uppercase md:text-eyebrow", tones[tone], className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ Label */

export type LabelProps = ComponentPropsWithoutRef<"label">;

/** Mono 11px uppercase. Renders <label> when htmlFor is given, otherwise <span>. */
export function Label({ htmlFor, className, ...props }: LabelProps) {
  const Tag = htmlFor ? "label" : "span";
  return <Tag htmlFor={htmlFor} className={cn("font-mono text-label text-fg-muted uppercase", className)} {...props} />;
}

/* ------------------------------------------------------------------- Mono */

export type MonoProps = ComponentPropsWithoutRef<"span"> & {
  tone?: Exclude<Tone, "soft">;
};

export function Mono({ tone = "muted", className, ...props }: MonoProps) {
  return <span className={cn("font-mono text-mono", tones[tone], className)} {...props} />;
}

/* ------------------------------------------------------------------- Text */

const textSizes = {
  body: "text-body",
  small: "text-small",
  lead: "text-lead md:text-[18px]",
} as const;

export type TextProps = ComponentPropsWithoutRef<"p"> & {
  as?: "p" | "span" | "div";
  size?: keyof typeof textSizes;
  tone?: Exclude<Tone, "accent">;
  children?: ReactNode;
};

export function Text({ as: Tag = "p", size = "body", tone = "soft", className, ...props }: TextProps) {
  return <Tag className={cn(textSizes[size], tones[tone], className)} {...props} />;
}
