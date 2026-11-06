import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Label } from "@/final";

/*
 * Landing-only layout pieces. The landing type is fluid (clamp) where the app scale is fixed,
 * so these sit beside the kit's Heading rather than inside it.
 */

/** 1200px column with the export's fluid gutter. Every section below the hero uses it. */
export function Section({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section
      className={cn(
        "mx-auto box-content max-w-300 px-[clamp(16px,4vw,40px)] pb-24",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

/** Mono 11 uppercase section opener. */
export function Eyebrow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Label as="p" className={cn("m-0", className)}>
      {children}
    </Label>
  );
}

/** Section headline: Urbanist, 28 → 40px. */
export function SectionTitle({
  className,
  ...props
}: ComponentPropsWithoutRef<"h2">) {
  return (
    <h2
      className={cn(
        "m-0 font-display text-[clamp(28px,3.4vw,40px)] leading-[1.1] font-bold tracking-[-0.025em] text-charcoal",
        className,
      )}
      {...props}
    />
  );
}

/** Frosted glass for things that float over the watercolour: nav bar and hero cards. */
export const FROST = cn(
  "border border-surface/85 bg-linear-160/srgb from-surface/90 to-[rgb(250_253_249/0.78)] backdrop-blur-[20px]",
  "shadow-[inset_0_1px_0_rgb(255_255_255/0.9),inset_0_-1px_0_rgb(255_255_255/0.25),0_12px_32px_-14px_rgb(38_46_36/0.35)]",
);

/** Focus ring that stays visible on Hunter panels (the global ring is Charcoal). */
export const RING_ON_HUNTER =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime";
