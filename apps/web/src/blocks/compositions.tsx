"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { generateTiles, type GenerateOptions, type TileSpec } from "./generate";
import { BlockGrid } from "./grid";

/* Literal class maps so Tailwind can see every grid we build. */
type Cols = 2 | 3 | 4 | 6 | 8 | 12;
const COLS: Record<Cols, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 6: "grid-cols-6", 8: "grid-cols-8", 12: "grid-cols-12" };
const MD_COLS: Record<Cols, string> = {
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
  6: "md:grid-cols-6",
  8: "md:grid-cols-8",
  12: "md:grid-cols-12",
};

type Shared = Omit<GenerateOptions, "cols"> & {
  /** Hand-set tiles. Overrides the generator. */
  tiles?: TileSpec[];
  step?: number;
  lit?: number[];
  interactive?: boolean;
  grain?: boolean | number;
  className?: string;
};

function useTiles(count: number, cols: number, o: Shared) {
  const { tiles, seed, theme, shapes, density } = o;
  return useMemo(() => tiles ?? generateTiles(count, { seed, cols, theme, shapes, density }), [tiles, count, cols, seed, theme, shapes, density]);
}

/* ------------------------------------------------------------------ Frame */

export type FrameLayout = "center" | "left" | "right";

const FRAME: Record<FrameLayout, { rows: number; tiles: number; panel: string }> = {
  /* 8×5, panel 4×3 in the middle: the How it works mosaic. */
  center: { rows: 5, tiles: 28, panel: "row-start-2 md:col-span-4 md:col-start-3 md:row-span-3 md:row-start-2" },
  /* 8×4, panel on the left half: a split hero. */
  left: { rows: 4, tiles: 16, panel: "row-start-1 md:col-span-4 md:col-start-1 md:row-span-4" },
  right: { rows: 4, tiles: 16, panel: "row-start-1 md:col-span-4 md:col-start-5 md:row-span-4" },
};

export type BlockFrameProps = Shared & {
  layout?: FrameLayout;
  children: ReactNode;
  /** Panel colours and padding. Default: deep panel, light text. */
  panelClassName?: string;
};

/**
 * Tiles framing one content panel. 8 columns on desktop, 4 on phones,
 * where only the first two rows of tiles show so the panel stays near the top.
 */
export function BlockFrame({ layout = "center", children, panelClassName, grain = true, className, ...o }: BlockFrameProps) {
  const f = FRAME[layout];
  const tiles = useTiles(f.tiles, 8, o);
  return (
    <BlockGrid
      tiles={tiles}
      step={o.step}
      lit={o.lit}
      interactive={o.interactive}
      grain={grain}
      cols="grid-cols-4 md:grid-cols-8"
      tileClassName={(i) => i >= 8 && "max-md:hidden"}
      className={cn("rounded-[20px] bg-deep", className)}
    >
      <div className={cn("relative col-span-4 flex flex-col justify-center gap-5 bg-deep p-6 text-canvas md:p-8", f.panel, panelClassName)}>{children}</div>
    </BlockGrid>
  );
}

/* ------------------------------------------------------------------- Band */

export type BlockBandProps = Shared & {
  rows?: 1 | 2;
  /** Columns on desktop. Phones show the left half. */
  cols?: 8 | 12;
};

/** A strip of tiles. Section dividers, card headers, the top of a footer. */
export function BlockBand({ rows = 1, cols = 12, grain, className, ...o }: BlockBandProps) {
  const half = cols / 2;
  const tiles = useTiles(cols * rows, cols, o);
  return (
    <BlockGrid
      tiles={tiles}
      step={o.step}
      lit={o.lit}
      interactive={o.interactive}
      grain={grain}
      cols={cn(COLS[half as Cols], MD_COLS[cols])}
      tileClassName={(i) => i % cols >= half && "max-md:hidden"}
      className={className}
    />
  );
}

/* ---------------------------------------------------------------- Cluster */

export type BlockClusterProps = Shared & {
  cols?: 2 | 3 | 4;
  rows?: number;
};

/** A small fixed block of tiles: card corners, beside a stat, an avatar for a shop. Size it with a width class. */
export function BlockCluster({ cols = 2, rows = 2, className, grain, ...o }: BlockClusterProps) {
  const tiles = useTiles(cols * rows, cols, o);
  return <BlockGrid tiles={tiles} step={o.step} lit={o.lit} interactive={o.interactive} grain={grain} cols={COLS[cols]} className={cn("shrink-0", className)} />;
}

/* ------------------------------------------------------------------- Wall */

export type WallFade = "none" | "bottom" | "top" | "radial" | "sides";

const FADES: Record<WallFade, string | undefined> = {
  none: undefined,
  bottom: "linear-gradient(to bottom, #000 30%, transparent)",
  top: "linear-gradient(to top, #000 30%, transparent)",
  sides: "linear-gradient(to right, transparent, #000 25%, #000 75%, transparent)",
  radial: "radial-gradient(ellipse at center, transparent 25%, #000 75%)",
};

export type BlockWallProps = Shared & {
  cols?: 6 | 8 | 12;
  rows?: number;
  /** Fade the wall into the section so copy can sit on it. Radial leaves a quiet middle. */
  fade?: WallFade;
};

/**
 * A full field of tiles to sit behind a section. Put it in an absolutely positioned box
 * with overflow hidden; it fills the width and runs as tall as its rows.
 */
export function BlockWall({ cols = 12, rows = 4, fade = "bottom", className, grain, ...o }: BlockWallProps) {
  const tiles = useTiles(cols * rows, cols, o);
  const mask = FADES[fade];
  const style: CSSProperties | undefined = mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined;
  return <BlockGrid tiles={tiles} step={o.step} lit={o.lit} interactive={o.interactive} grain={grain} cols={COLS[cols]} className={className} style={style} />;
}
