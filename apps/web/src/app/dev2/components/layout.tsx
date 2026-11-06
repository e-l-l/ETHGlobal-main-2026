import "@/jar/jar.css";
import type { Viewport } from "next";
import { jarFonts } from "@/jar/fonts";

/* Dark-first app: the status bar matches Charcoal. The gallery updates it when you switch to light. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#262e24",
};

export default function Dev2Layout({ children }: { children: React.ReactNode }) {
  return <div className={jarFonts}>{children}</div>;
}
