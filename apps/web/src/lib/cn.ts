import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge must know our custom theme tokens (packages/tailwind-config/theme.css),
 * otherwise e.g. `text-body` (font size) and `text-ink` (color) are treated as the same
 * group and one gets dropped. Keep these lists in sync with the @theme block.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "paper", "card", "subtle", "line", "line-strong", "faint",
        "ink", "ink-soft", "muted", "on-ink",
        "accent", "accent-text", "accent-tint", "accent-ink", "accent-line",
        "down", "down-tint", "warn", "warn-tint",
      ],
      text: ["display", "heading", "figure", "title", "lead", "body", "small", "mono", "eyebrow", "chip", "label"],
      radius: ["sm", "md", "lg", "xl", "pill"],
      font: ["sans", "mono", "serif"],
      shadow: ["dialog"],
      container: ["app", "column", "dialog"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
