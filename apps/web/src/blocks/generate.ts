import { GENERATED, TURNABLE, type Shape } from "./shapes";
import { ON, THEMES, type Theme, type Tone } from "./tones";

/** One tile: background tone, shape, shape tone, base rotation in degrees. */
export type TileSpec = { bg: Tone; shape: Shape; fg: Tone; rot?: number };

/** Short form for hand-set grids: [bg, shape, fg, rot]. */
export type TileTuple = [Tone, Shape, Tone, number?];
export const fromTuples = (t: TileTuple[]): TileSpec[] => t.map(([bg, shape, fg, rot]) => ({ bg, shape, fg, rot: rot ?? 0 }));

export type GenerateOptions = {
  /** Same seed, same tiles, on the server and the client. */
  seed?: number;
  /** Columns of the grid the tiles flow into. Used to keep vertical neighbours apart. */
  cols?: number;
  theme?: Theme;
  /** Allowed shapes. Defaults to everything but the brand mark. */
  shapes?: Shape[];
  /** 0 to 1. Share of tiles that carry a shape; the rest are flat colour. */
  density?: number;
};

/** mulberry32: tiny, fast, deterministic. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T extends string>(rand: () => number, weights: Partial<Record<T, number>>, avoid: ReadonlySet<T>): T {
  const entries = (Object.entries(weights) as [T, number][]).filter(([k, w]) => w > 0 && !avoid.has(k));
  const pool = entries.length ? entries : (Object.entries(weights) as [T, number][]);
  const total = pool.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [k, w] of pool) {
    r -= w;
    if (r <= 0) return k;
  }
  return pool[pool.length - 1]![0];
}

/**
 * A grid of tiles that obeys the rules: no tile shares a background with the tile to its
 * left or above, no shape repeats side by side, and every shape colour reads on its tile.
 */
export function generateTiles(count: number, opts: GenerateOptions = {}): TileSpec[] {
  const { seed = 1, cols = 8, theme = "brand", shapes = GENERATED, density = 0.8 } = opts;
  const rand = rng(seed);
  const pick = <T>(a: readonly T[]) => a[Math.floor(rand() * a.length)]!;
  const out: TileSpec[] = [];

  for (let i = 0; i < count; i++) {
    const left = i % cols ? out[i - 1] : undefined;
    const up = out[i - cols];
    const bg = weighted<Tone>(rand, THEMES[theme], new Set([left?.bg, up?.bg].filter(Boolean) as Tone[]));

    let shape: Shape = "none";
    if (rand() < density) {
      const options = shapes.filter((s) => s !== "none" && s !== left?.shape && s !== up?.shape);
      shape = options.length ? pick(options) : "none";
    }

    const fgOptions = ON[bg].filter((t) => t !== bg);
    const fg = pick(fgOptions);
    const rot = TURNABLE.has(shape) ? pick([0, 90, 180, 270]) : 0;
    out.push({ bg, shape, fg, rot });
  }
  return out;
}

/** A random square cluster of `size`×`size` tile indexes inside a grid, for lighting up. */
export function cluster(seed: number, cols: number, rows: number, size = 2): number[] {
  const rand = rng(seed);
  const c = Math.floor(rand() * Math.max(1, cols - size + 1));
  const r = Math.floor(rand() * Math.max(1, rows - size + 1));
  const out: number[] = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out.push((r + y) * cols + c + x);
  return out;
}
