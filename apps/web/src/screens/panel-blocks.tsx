"use client";

import { BlockBand } from "@/blocks";

/**
 * The block pattern on a BrandPanel: one dimmed strip of tiles flush with the panel's top edge, fading into the
 * Hunter ground so the headline below always sits on solid colour. Pass it as `top` (BrandPanel owns the padding,
 * so the strip bleeds out with negative margins). Decorative only; `lit` marks progress (Verifying, Business Pass).
 *   - seed: which arrangement; give each screen its own so the flow doesn't repeat one strip.
 *   - lit: tile indexes to light. Keep them in the first six: phones show the left half.
 *   - calm: darker and unlit-looking, for screens that should feel quiet (verification failed).
 */
export function PanelBlocks({ seed, lit, calm }: { seed: number; lit?: number[]; calm?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none relative -mx-4 -mt-5 overflow-hidden md:-mx-12 md:-mt-12 lg:-mx-14">
      <BlockBand cols={12} rows={1} seed={seed} theme={calm ? "night" : "brand"} {...(lit ? { lit } : {})} />
      <div
        className={
          calm
            ? "absolute inset-0 bg-linear-to-b from-hunter/85 to-hunter"
            : "absolute inset-0 bg-linear-to-b from-hunter/62 via-hunter/78 to-hunter"
        }
      />
    </div>
  );
}

/** First `n` tiles, for a progress strip. */
export const litTiles = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i);
