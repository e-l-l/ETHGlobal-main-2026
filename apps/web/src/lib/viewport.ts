import type { Viewport } from "next";

/*
 * Status bar matches the ground at the very top of each screen (mobile-native §10).
 * Values mirror the --bg token for each mode in jar/jar.css.
 */
const ground = { dark: "#262e24", light: "#d6f0a8", portal: "#f2f3f4" } as const;

export function jarViewport(mode: keyof typeof ground = "dark"): Viewport {
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    interactiveWidget: "resizes-content",
    themeColor: ground[mode],
    colorScheme: mode === "dark" ? "dark" : "light",
  };
}
