"use client";

import { useId } from "react";
import { JarMark } from "@/final";
import { cn } from "@/lib/cn";
import type { TileSpec } from "./generate";
import { ShapeArt, TURNABLE } from "./shapes";
import { ON, TONE_BG, TONE_FG } from "./tones";

export type TileProps = {
  spec: TileSpec;
  /** Lit tiles go lime, and the shape takes a colour that reads on lime. */
  lit?: boolean;
  /** Quarter turns shared by the whole grid. Only turnable shapes follow it. */
  step?: number;
  /** Extra quarter turns for this tile alone (from a tap). Applies to every shape. */
  turns?: number;
  /** Renders a button that calls this on tap. Decorative: hidden from assistive tech, not in tab order. */
  onTurn?: () => void;
  className?: string;
};

/** One square of the pattern. Fills its grid cell; size it with the grid, not here. */
export function Tile({ spec, lit, step = 0, turns = 0, onTurn, className }: TileProps) {
  const { bg, shape, fg, rot = 0 } = spec;
  const spin = (TURNABLE.has(shape) ? rot + step * 90 : rot) + turns * 90;
  const fgClass = lit ? (bg === "lime" || !ON.lime.includes(fg) ? TONE_FG.hunter : TONE_FG[fg]) : TONE_FG[fg];

  const art =
    shape === "drop" ? (
      <span className="grid size-full place-items-center">
        <JarMark size={56} lit={lit ? 4 : 1} className="max-md:scale-75" />
      </span>
    ) : shape === "none" ? null : (
      <svg
        viewBox="0 0 100 100"
        className={cn("absolute inset-0 size-full transition-[transform,color] duration-500 ease-swap", onTurn && "group-hover:scale-[1.06]", fgClass)}
        style={{ transform: `rotate(${spin}deg)` }}
      >
        <ShapeArt shape={shape} />
      </svg>
    );

  const base = cn("group relative aspect-square overflow-hidden transition-colors duration-500 ease-swap", lit ? "bg-lime" : TONE_BG[bg], className);

  if (onTurn) {
    return (
      <button type="button" tabIndex={-1} aria-hidden onClick={onTurn} className={cn(base, "cursor-pointer")}>
        {art}
      </button>
    );
  }
  return (
    <div aria-hidden className={base}>
      {art}
    </div>
  );
}

/** Film grain from SVG noise. Put it last inside a `relative` box. No image, no colour value. */
export function Grain({ opacity = 0.22 }: { opacity?: number }) {
  const id = `grain${useId().replace(/[:«»]/g, "")}`;
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 size-full mix-blend-overlay" style={{ opacity }}>
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}
