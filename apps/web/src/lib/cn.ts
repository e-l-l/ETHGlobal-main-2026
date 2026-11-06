import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know our custom theme tokens (packages/tailwind-config/final.css),
 * otherwise e.g. `text-read` (font size) and `text-charcoal` (color) are treated as the same
 * group and one gets dropped. Keep these lists in sync with the @theme block.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "charcoal", "charcoal-soft", "charcoal-muted", "deep", "hunter", "forest", "fern", "sage", "leaf", "lime",
        "honeydew", "honeydew-line", "canvas", "surface", "well", "hairline", "control", "track", "unlit",
        "caution", "caution-tint", "risk", "risk-tint",
      ],
      text: ["hero", "hero-sm", "amount", "h1", "h1-sm", "h2", "read", "note", "ledger", "tag"],
      radius: ["md", "lg", "xl", "chip", "sheet"],
      font: ["display", "body", "ledger"],
      shadow: ["lift"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
