import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Spinner } from "./status";

/*
 * Primary is Hunter, not lime: lime on white is 1.2:1, so a lime button has no edge.
 * The lime variant exists for Hunter and Charcoal panels only (the drip card, wave band).
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md border font-body font-semibold",
    "whitespace-nowrap select-none touch-manipulation cursor-pointer",
    "transition-[transform,background-color,border-color,color,box-shadow] duration-200 ease-snappy",
    "hover:-translate-y-px hover:shadow-[0_6px_16px_-8px_rgb(0_0_0/0.35)] active:translate-y-0 active:scale-[0.96] active:shadow-none",
    "motion-reduce:transform-none motion-reduce:transition-colors",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal",
    "disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100",
  ],
  {
    variants: {
      variant: {
        primary: "border-transparent bg-hunter text-canvas hover:bg-forest",
        secondary: "border-control bg-surface text-charcoal hover:bg-well",
        tonal: "border-honeydew-line bg-honeydew text-hunter hover:border-hunter/40",
        ghost: "border-transparent bg-transparent text-hunter hover:bg-well",
        danger: "border-risk bg-surface text-risk hover:bg-risk-tint",
        lime: "border-transparent bg-lime text-charcoal hover:bg-lime/85 focus-visible:outline-lime",
      },
      size: {
        md: "min-h-13 px-5 py-3.5 text-read",
        sm: "min-h-11 px-4 text-note",
      },
      width: {
        responsive: "w-full md:w-auto",
        full: "w-full",
        auto: "w-auto",
      },
    },
    defaultVariants: { variant: "primary", size: "md", width: "responsive" },
  },
);

type Own = VariantProps<typeof buttonVariants> & {
  loading?: boolean;
  iconStart?: ReactNode;
  iconEnd?: ReactNode;
  href?: string;
};

export type ButtonProps = Omit<ComponentPropsWithoutRef<"button">, keyof Own> & Own;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, width, loading, iconStart, iconEnd, href, className, children, disabled, type, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size, width }), className);
  /* Label blurs out while the spinner fades in, so the swap reads as one change. */
  const content = (
    <>
      <span className={cn("inline-flex items-center gap-2 transition-[opacity,filter] duration-200", loading && "opacity-0 blur-[2px]")}>
        {iconStart}
        {children}
        {iconEnd}
      </span>
      <span className={cn("absolute inset-0 grid place-items-center transition-opacity duration-200", loading ? "opacity-100" : "opacity-0")}>
        {loading ? <Spinner size={18} label="Working" /> : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes} aria-busy={loading || undefined}>
        {content}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type ?? "button"} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {content}
    </button>
  );
});

/** 44×44 icon control (back, close, copy). */
export function IconButton({ className, label, children, ...props }: ComponentPropsWithoutRef<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-charcoal-soft",
        "transition-colors duration-150 hover:bg-well hover:text-charcoal active:scale-[0.97] motion-reduce:active:scale-100",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/** Inline link in Hunter with a quiet underline. */
export function TextLink({ className, arrow, children, ...props }: ComponentPropsWithoutRef<typeof Link> & { arrow?: boolean }) {
  return (
    <Link
      className={cn(
        "inline-flex min-h-11 items-center font-body text-note font-semibold text-hunter underline decoration-hunter/30 decoration-1 underline-offset-[3px] hover:decoration-hunter",
        className,
      )}
      {...props}
    >
      {children}
      {arrow ? <span aria-hidden>&nbsp;→</span> : null}
    </Link>
  );
}
