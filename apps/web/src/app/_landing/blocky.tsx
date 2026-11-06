import type { Shape } from "@/blocks";
import { cn } from "@/lib/cn";

/*
 * The landing page speaks in blocks and pixels only: no curves.
 * BLOCKY is the angular subset of the block vocabulary (src/blocks/shapes.tsx).
 */

export const BLOCKY: Shape[] = ["none", "tri", "half", "stripes", "check", "pixels", "steps", "diamond", "plus"];

/** A value as a grid of squares, filled row by row from the bottom left. */
export function Waffle({
  value,
  cols = 10,
  rows = 4,
  on = "bg-hunter",
  off = "bg-track",
  label,
  className,
}: {
  value: number;
  cols?: number;
  rows?: number;
  on?: string;
  off?: string;
  label: string;
  className?: string;
}) {
  const total = cols * rows;
  const lit = Math.round(Math.max(0, Math.min(1, value)) * total);
  return (
    <div role="img" aria-label={label} className={cn("grid gap-0.75", className)} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: total }, (_, i) => {
        const row = rows - 1 - Math.floor(i / cols);
        const idx = row * cols + (i % cols);
        return <span key={i} className={cn("aspect-square rounded-[1px]", idx < lit ? on : off)} />;
      })}
    </div>
  );
}

/** One row of blocks, filled from the left. Meters and the 90 / 10 split. */
export function PixelBar({
  value,
  cells = 20,
  on = "bg-hunter",
  off = "bg-track",
  className,
}: {
  value: number;
  cells?: number;
  on?: string;
  off?: string;
  className?: string;
}) {
  const lit = Math.round(Math.max(0, Math.min(1, value)) * cells);
  return (
    <div aria-hidden className={cn("flex gap-0.75", className)}>
      {Array.from({ length: cells }, (_, i) => (
        <span key={i} className={cn("h-full flex-1 rounded-[1px]", i < lit ? on : off)} />
      ))}
    </div>
  );
}
