import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/brand";

/* Lets "Add to Home Screen" open the app full screen, without browser chrome. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "QR payments for small shops. Advances paid back by every sale.",
    start_url: "/home",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6faf5",
    theme_color: "#f6faf5",
    icons: [
      { src: "/apple-icon.png", sizes: "any", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
