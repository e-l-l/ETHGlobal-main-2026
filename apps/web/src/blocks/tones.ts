/*
 * Block tones. A subset of the brand greens (packages/tailwind-config/final.css) that tiles may use.
 * Class strings are spelled out in full so Tailwind sees them.
 */

export const TONES = ["lime", "honeydew", "leaf", "sage", "fern", "hunter", "forest", "deep"] as const;
export type Tone = (typeof TONES)[number];

export const TONE_BG: Record<Tone, string> = {
  lime: "bg-lime",
  honeydew: "bg-honeydew",
  leaf: "bg-leaf",
  sage: "bg-sage",
  fern: "bg-fern",
  hunter: "bg-hunter",
  forest: "bg-forest",
  deep: "bg-deep",
};

export const TONE_FG: Record<Tone, string> = {
  lime: "text-lime",
  honeydew: "text-honeydew",
  leaf: "text-leaf",
  sage: "text-sage",
  fern: "text-fern",
  hunter: "text-hunter",
  forest: "text-forest",
  deep: "text-deep",
};

/** Light tones. A tile is "light" when its background is one of these. */
export const LIGHT: ReadonlySet<Tone> = new Set<Tone>(["lime", "honeydew"]);

/**
 * Which shape colours read on which background. The generator only picks from here,
 * and hand-set tiles should too. Lime stays on dark or mid greens, never next to white.
 */
export const ON: Record<Tone, Tone[]> = {
  lime: ["hunter", "forest", "fern", "leaf"],
  honeydew: ["leaf", "fern", "hunter", "sage"],
  leaf: ["lime", "forest", "hunter", "honeydew"],
  sage: ["lime", "honeydew", "forest", "leaf"],
  fern: ["lime", "leaf", "hunter", "forest"],
  hunter: ["lime", "leaf", "fern"],
  forest: ["lime", "leaf", "fern"],
  deep: ["fern", "leaf", "lime"],
};

/** Background weights per theme. Higher means more tiles of that tone. */
export type Theme = "brand" | "night" | "day";

export const THEMES: Record<Theme, Partial<Record<Tone, number>>> = {
  /* The landing mosaic: lime and leaf carry it, hunter anchors, a pinch of the rest. */
  brand: { lime: 3, leaf: 3, hunter: 3, fern: 2, forest: 2, honeydew: 0.5, sage: 0.5, deep: 0.5 },
  /* For dark sections: mostly deep greens, lime only as the accent. */
  night: { deep: 2, forest: 3, hunter: 3, fern: 2, sage: 1, lime: 0.8 },
  /* For light sections: lime and honeydew, hunter as the ink. */
  day: { lime: 3, honeydew: 3, leaf: 2, fern: 1, hunter: 1.2 },
};
