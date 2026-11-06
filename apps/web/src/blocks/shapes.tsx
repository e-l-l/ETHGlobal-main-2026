/*
 * The shape vocabulary. Every shape is drawn in a 100×100 box in currentColor,
 * so a tile sets its colour with a text-* class and turns it with a CSS rotate.
 */

export const SHAPES = [
  "none",
  "circle",
  "ring",
  "tri",
  "half",
  "quarter",
  "arch",
  "arc",
  "stripes",
  "dots",
  "check",
  "pixels",
  "steps",
  "diamond",
  "plus",
  "wave",
  "drop",
] as const;
export type Shape = (typeof SHAPES)[number];

/** Shapes that look different when turned. Only these follow a grid's `step`. */
export const TURNABLE: ReadonlySet<Shape> = new Set<Shape>(["tri", "half", "quarter", "arch", "arc", "stripes", "dots", "steps", "pixels", "wave"]);

/** Shapes the generator picks from by default. `drop` is the brand mark: place it by hand, once. */
export const GENERATED: Shape[] = SHAPES.filter((s) => s !== "drop");

export const SHAPE_NOTES: Record<Shape, string> = {
  none: "Flat colour. The rest every busy grid needs.",
  circle: "Coin, customer, a sale.",
  ring: "Progress, the repay ring.",
  tri: "Play, forward, next step.",
  half: "Diagonal split: the 90 / 10.",
  quarter: "Corner sweep. Turns with steps.",
  arch: "Shopfront, doorway.",
  arc: "Motion, the swap.",
  stripes: "Ledger lines, receipts.",
  dots: "Steps, a sequence.",
  check: "Checker. Two tones, one tile.",
  pixels: "Stacking up, the dune.",
  steps: "Staircase: growth, credit.",
  diamond: "A token.",
  plus: "Add, top up.",
  wave: "Flow of money.",
  drop: "The brand mark. Once per grid.",
};

export function ShapeArt({ shape }: { shape: Shape }) {
  switch (shape) {
    case "circle":
      return <circle cx="50" cy="50" r="30" fill="currentColor" />;
    case "ring":
      return <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="14" />;
    case "tri":
      return <polygon points="50,22 80,74 20,74" fill="currentColor" />;
    case "half":
      return <polygon points="0,0 100,100 0,100" fill="currentColor" />;
    case "quarter":
      return <path d="M0 100V0a100 100 0 0 1 100 100Z" fill="currentColor" />;
    case "arch":
      return <path d="M14 100V50a36 36 0 0 1 72 0V100Z" fill="currentColor" />;
    case "arc":
      return <path d="M14 100A86 86 0 0 1 100 14" fill="none" stroke="currentColor" strokeWidth="22" />;
    case "stripes":
      return (
        <g fill="currentColor">
          {[18, 32, 46, 60, 74].map((y) => (
            <rect key={y} x="10" y={y} width="80" height="7" />
          ))}
        </g>
      );
    case "dots":
      return (
        <g fill="currentColor">
          {[20, 40, 60, 80].map((y) => (
            <circle key={y} cx="50" cy={y} r="8" />
          ))}
        </g>
      );
    case "check":
      return (
        <g fill="currentColor">
          <rect width="50" height="50" />
          <rect x="50" y="50" width="50" height="50" />
        </g>
      );
    case "pixels":
      return (
        <g fill="currentColor">
          {Array.from({ length: 36 }, (_, i) => {
            const x = i % 6;
            const y = Math.floor(i / 6);
            return x + y >= 5 && (x * 7 + y * 3) % 4 !== 0 ? <rect key={i} x={12 + x * 13} y={12 + y * 13} width="10" height="10" /> : null;
          })}
        </g>
      );
    case "steps":
      return <path d="M0 100V75H25V50H50V25H75V0H100V100Z" fill="currentColor" />;
    case "diamond":
      return <polygon points="50,16 84,50 50,84 16,50" fill="currentColor" />;
    case "plus":
      return (
        <g fill="currentColor">
          <rect x="40" y="16" width="20" height="68" />
          <rect x="16" y="40" width="68" height="20" />
        </g>
      );
    case "wave":
      return (
        <g fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round">
          {[30, 52, 74].map((y) => (
            <path key={y} d={`M10 ${y}q10 -12 20 0t20 0t20 0t20 0`} />
          ))}
        </g>
      );
    default:
      return null;
  }
}
