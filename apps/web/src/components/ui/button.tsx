import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Link from "next/link";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { ChevronLeftIcon } from "@/components/icons";
import { Spinner } from "./status";

/* ----------------------------------------------------------------- Button */

export const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border font-semibold whitespace-nowrap select-none",
    "transition-colors duration-150",
    "disabled:pointer-events-none disabled:border-line disabled:bg-subtle disabled:text-muted",
    "aria-disabled:pointer-events-none aria-disabled:border-line aria-disabled:bg-subtle aria-disabled:text-muted",
  ],
  {
    variants: {
      variant: {
        primary: "border-transparent bg-accent text-ink hover:bg-accent/80",
        ink: "surface-ink border-transparent hover:bg-ink/90",
        outline: "border-line-strong bg-card text-ink hover:border-ink",
        danger: "border-down bg-card text-down hover:bg-down-tint",
        ghost: "border-transparent bg-transparent text-ink hover:bg-subtle",
      },
      size: {
        md: "h-[50px] px-5 text-body",
        /* 40px visual, 44px hit area. */
        sm: "hit-target h-10 px-4 text-small",
      },
      fullWidth: {
        /* Default: full width on mobile, auto from md up. */
        responsive: "w-full md:w-auto",
        true: "w-full",
        false: "w-auto",
      },
    },
    defaultVariants: { variant: "primary", size: "md", fullWidth: "responsive" },
  },
);

type ButtonOwnProps = Omit<VariantProps<typeof buttonVariants>, "fullWidth"> & {
  /** Omit for the default (full under md, auto from md). */
  fullWidth?: boolean;
  loading?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  /** Render the single child as the button (Radix Slot). */
  asChild?: boolean;
  /** Render a next/link. */
  href?: string;
  /** Screen-reader label for the spinner while loading. */
  loadingLabel?: string;
};

export type ButtonProps = Omit<ComponentPropsWithoutRef<"button">, keyof ButtonOwnProps> & ButtonOwnProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant,
    size,
    fullWidth,
    loading,
    iconStart,
    iconEnd,
    asChild,
    href,
    loadingLabel = "Loading",
    className,
    children,
    disabled,
    type,
    ...props
  },
  ref,
) {
  const classes = cn(
    buttonVariants({ variant, size, fullWidth: fullWidth === undefined ? "responsive" : fullWidth }),
    className,
  );
  const content = (
    <>
      {loading ? <Spinner size={18} label={loadingLabel} /> : iconStart}
      {children}
      {!loading ? iconEnd : null}
    </>
  );

  if (asChild) {
    return (
      <Slot ref={ref} className={classes} aria-busy={loading || undefined} {...props}>
        {children}
      </Slot>
    );
  }

  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        aria-busy={loading || undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
        {...(props as Omit<ComponentPropsWithoutRef<"a">, "href">)}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {content}
    </button>
  );
});

/* -------------------------------------------------------------- ButtonRow */

export type ButtonRowProps = ComponentPropsWithoutRef<"div"> & {
  /** Trailing hint, usually a <Mono>. */
  hint?: ReactNode;
};

/** Stacked full width on mobile, inline from md. */
export function ButtonRow({ hint, className, children, ...props }: ButtonRowProps) {
  return (
    <div className={cn("flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center", className)} {...props}>
      {children}
      {hint ? <div className="text-center md:text-left">{hint}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------ icon button */

/** 44×44 square icon control (back, close, copy). Colors follow the surface. */
export const iconButtonClass =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-md text-fg-muted hover:bg-fg/5 hover:text-fg";

/* --------------------------------------------------------------- BackLink */

export type BackLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, "children"> & {
  label?: string;
};

export function BackLink({ label = "Back", className, ...props }: BackLinkProps) {
  return (
    <Link
      aria-label={label}
      className={cn(iconButtonClass, "-ml-2.5 text-fg", className)}
      {...props}
    >
      <ChevronLeftIcon size={24} />
    </Link>
  );
}

/* --------------------------------------------------------------- TextLink */

export type TextLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  /** Append " →". */
  arrow?: boolean;
};

export function TextLink({ arrow, className, children, ...props }: TextLinkProps) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-11 items-center text-small underline decoration-1 underline-offset-[3px]",
        "text-fg decoration-rule-strong hover:decoration-fg",
        className,
      )}
      {...props}
    >
      {children}
      {arrow ? <span aria-hidden>&nbsp;→</span> : null}
    </Link>
  );
}
