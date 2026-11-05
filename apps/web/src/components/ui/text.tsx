import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/* ---------------------------------------------------------------- Heading */

const headingVariants = cva("font-semibold text-ink text-balance", {
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
        tone === "accent" ? "text-accent-text" : "text-down",
        className,
      )}
      {...props}
    />
  );
}

/* ---------------------------------------------------------------- Eyebrow */

const eyebrowTones = {
  accent: "text-accent-text",
  muted: "text-muted",
  ink: "text-ink",
  down: "text-down",
  "on-ink": "text-on-ink/70",
} as const;

export type EyebrowProps = ComponentPropsWithoutRef<"p"> & {
  tone?: keyof typeof eyebrowTones;
};

export function Eyebrow({ tone = "accent", className, ...props }: EyebrowProps) {
  return (
    <p
      className={cn("font-mono text-[12px] tracking-[0.06em] uppercase md:text-eyebrow", eyebrowTones[tone], className)}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ Label */

export type LabelProps = Omit<ComponentPropsWithoutRef<"label">, "htmlFor"> & {
  htmlFor?: string;
  /** On ink surfaces. */
  onInk?: boolean;
};

/** Mono 11px uppercase. Renders <label> when htmlFor is given, otherwise <span>. */
export function Label({ htmlFor, onInk, className, ...props }: LabelProps) {
  const classes = cn("font-mono text-label uppercase", onInk ? "text-on-ink/70" : "text-muted", className);
  if (htmlFor) return <label htmlFor={htmlFor} className={classes} {...props} />;
  return <span className={classes} {...(props as ComponentPropsWithoutRef<"span">)} />;
}

/* ------------------------------------------------------------------- Mono */

const monoTones = {
  ink: "text-ink",
  muted: "text-muted",
  accent: "text-accent-text",
  "on-ink": "text-on-ink/70",
  down: "text-down",
} as const;

export type MonoProps = ComponentPropsWithoutRef<"span"> & {
  tone?: keyof typeof monoTones;
};

export function Mono({ tone = "muted", className, ...props }: MonoProps) {
  return <span className={cn("font-mono text-mono", monoTones[tone], className)} {...props} />;
}

/* ------------------------------------------------------------------- Text */

const textVariants = cva("", {
  variants: {
    size: {
      body: "text-body",
      small: "text-small",
      lead: "text-lead md:text-[18px]",
    },
    tone: {
      ink: "text-ink",
      soft: "text-ink-soft",
      muted: "text-muted",
      down: "text-down",
      "on-ink": "text-on-ink/80",
    },
  },
  defaultVariants: { size: "body", tone: "soft" },
});

export type TextProps = ComponentPropsWithoutRef<"p"> &
  VariantProps<typeof textVariants> & {
    as?: "p" | "span" | "div";
    children?: ReactNode;
  };

export function Text({ as: Tag = "p", size, tone, className, ...props }: TextProps) {
  return <Tag className={cn(textVariants({ size, tone }), className)} {...props} />;
}
