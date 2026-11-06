"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { TileSpec } from "./generate";
import { Grain, Tile } from "./tile";

export type BlockGridProps = {
  tiles: TileSpec[];
  /** Tailwind grid-cols classes, responsive if needed. Default "grid-cols-4 md:grid-cols-8". */
  cols?: string;
  /** Indexes of tiles to light up. */
  lit?: number[];
  /** Quarter turns for every turnable shape. Bump it to remix the grid. */
  step?: number;
  /** Tap a tile to turn it. */
  interactive?: boolean;
  grain?: boolean | number;
  /** Per-tile classes, e.g. hide the second half on phones: (i) => i >= 12 && "max-md:hidden". */
  tileClassName?: (i: number) => string | false | undefined;
  /** Panels (content) placed into the grid before the tiles, so tiles flow around them. Give them grid placement classes. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * The base of every block pattern: a square-tile grid with optional content panels.
 * Rounded corners, background and fades belong to the caller.
 */
export function BlockGrid({ tiles, cols = "grid-cols-4 md:grid-cols-8", lit, step = 0, interactive, grain, tileClassName, children, className, style }: BlockGridProps) {
  const [turns, setTurns] = useState<Record<number, number>>({});
  return (
    <div className={cn("relative overflow-hidden", className)} style={style}>
      <div className={cn("grid", cols)}>
        {children}
        {tiles.map((spec, i) => (
          <Tile
            key={i}
            spec={spec}
            lit={lit?.includes(i)}
            step={step}
            turns={turns[i] ?? 0}
            onTurn={interactive ? () => setTurns((t) => ({ ...t, [i]: (t[i] ?? 0) + 1 })) : undefined}
            className={tileClassName?.(i) || undefined}
          />
        ))}
      </div>
      {grain ? <Grain opacity={typeof grain === "number" ? grain : undefined} /> : null}
    </div>
  );
}
