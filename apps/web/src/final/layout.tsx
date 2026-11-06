import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * Landing layout laws, promoted from src/app/page.tsx. Tokens only (packages/tailwind-config/final.css).
 * The landing page keeps its own copies for now; these are the reference values.
 */

/* ----------------------------------------------------------------- Wrap */

/** Content width and gutters for every section. Full-bleed bands sit outside it. */
export const WRAP = "mx-auto w-full max-w-300 px-4 md:px-8";

export function Wrap({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn(WRAP, className)} {...props} />;
}

/* -------------------------------------------------------------- Section */

/** Section background, in the order the landing alternates them. Text colour is set by the content. */
export type SectionTone = "canvas" | "well" | "deep" | "hunter" | "charcoal";

const TONE: Record<SectionTone, string> = {
  canvas: "bg-canvas",
  well: "bg-well",
  deep: "bg-deep",
  hunter: "bg-hunter",
  charcoal: "bg-charcoal",
};

/** Vertical rhythm. `top` or `bottom` drop one side when the neighbouring section of the same tone carries the gap. */
export type SectionPad = "both" | "top" | "bottom" | "none";

const PAD: Record<SectionPad, string> = {
  both: "py-28 md:py-40",
  top: "pt-28 md:pt-40",
  bottom: "pb-28 md:pb-40",
  none: "",
};

export type SectionProps = Omit<ComponentPropsWithoutRef<"section">, "color"> & {
  tone?: SectionTone;
  pad?: SectionPad;
  /** Id of the heading that names the section (aria-labelledby). */
  labelledBy?: string;
};

/** A landing band. Anchored sections get scroll-mt-16 so the sticky 4rem header never covers the heading. */
export function Section({ tone = "canvas", pad = "both", labelledBy, className, ...props }: SectionProps) {
  return <section aria-labelledby={labelledBy} className={cn("scroll-mt-16", TONE[tone], PAD[pad], className)} {...props} />;
}

/* -------------------------------------------------------------- Eyebrow */

/** Mono 11 uppercase label with a 6px square marker. Hunter on light grounds, Lime on dark. */
export function Eyebrow({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  const dark = tone === "dark";
  return (
    <span className={cn("inline-flex w-fit items-center gap-2 font-ledger text-tag font-medium uppercase", dark ? "text-lime" : "text-hunter")}>
      <i aria-hidden className={cn("size-1.5 rounded-[1px]", dark ? "bg-lime" : "bg-hunter")} />
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- H2 */

/**
 * Landing section heading: 40px, 56px from md, leading 1.04, tracking -0.035em.
 * Two peak headings go to 64px at md (the split and the close): add `md:text-[64px]` there.
 */
export const H2 = "m-0 font-display text-hero-sm/[1.04] font-bold tracking-[-0.035em] text-balance md:text-hero/[1.04]";

/* ------------------------------------------------------ SectionHeading */

/**
 * Eyebrow, H2 and lede, in one of three arrangements:
 *   split   lede to the right of the heading from md (the default for content-heavy sections)
 *   stack   left-aligned column, 680px max
 *   center  centred column, 720px max
 */
export function SectionHeading({
  id,
  eyebrow,
  title,
  lede,
  tone = "light",
  layout = "split",
  className,
}: {
  id?: string;
  eyebrow: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  tone?: "light" | "dark";
  layout?: "split" | "stack" | "center";
  className?: string;
}) {
  const dark = tone === "dark";
  const heading = (
    <>
      <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
      <h2 id={id} className={cn(H2, dark ? "text-canvas" : "text-charcoal")}>
        {title}
      </h2>
    </>
  );
  const ledeClass = cn("m-0 font-body text-read", dark ? "text-honeydew/80" : "text-charcoal-soft");

  if (layout === "split") {
    return (
      <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
        <div className="flex flex-col gap-4">{heading}</div>
        {lede ? <p className={cn(ledeClass, "max-w-[40ch]")}>{lede}</p> : null}
      </div>
    );
  }
  if (layout === "center") {
    return (
      <div className={cn("mx-auto flex max-w-180 flex-col items-center gap-5 text-center", className)}>
        {heading}
        {lede ? <p className={cn(ledeClass, "max-w-[52ch]")}>{lede}</p> : null}
      </div>
    );
  }
  return (
    <div className={cn("flex max-w-170 flex-col gap-5", className)}>
      {heading}
      {lede ? <p className={cn(ledeClass, "max-w-[52ch]")}>{lede}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------ Pixel notch */

/** Stepped corners, two 4px notches deep: the pixel-art edge for a box. Apply as `style`. */
export const PIXEL_NOTCH: CSSProperties = {
  clipPath:
    "polygon(0 8px,4px 8px,4px 4px,8px 4px,8px 0,calc(100% - 8px) 0,calc(100% - 8px) 4px,calc(100% - 4px) 4px,calc(100% - 4px) 8px,100% 8px,100% calc(100% - 8px),calc(100% - 4px) calc(100% - 8px),calc(100% - 4px) calc(100% - 4px),calc(100% - 8px) calc(100% - 4px),calc(100% - 8px) 100%,8px 100%,8px calc(100% - 4px),4px calc(100% - 4px),4px calc(100% - 8px),0 calc(100% - 8px))",
};

/* ------------------------------------------------------ Motion classes */

/** Hover underline that draws left to right: a 1px gradient background grows from 0 to 100% in 200ms. */
export const DRAW_LINE =
  "bg-linear-to-r from-current to-current bg-size-[0%_1px] bg-position-[0_100%] bg-no-repeat transition-[background-size,color] duration-200 ease-snappy hover:bg-size-[100%_1px]";

/** Hero copy enters once on load (700ms). Stagger the supporting lines with an inline animation-delay of 90ms steps. */
export const ENTER = "motion-safe:animate-[page-in_700ms_var(--ease-snappy)_both]";
