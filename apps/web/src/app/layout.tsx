import "./globals.css";
import type { Metadata, Viewport } from "next";
import { APP_NAME } from "@/lib/brand";
import { jarFonts } from "@/final/fonts";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "QR payments for small shops. Advances paid back by every sale. Lenders fund the advances and earn the fee.",
};

/* Light only. Status bar matches the canvas token in packages/tailwind-config/final.css. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f6faf5",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jarFonts}>
      <body className="min-h-dvh bg-canvas font-body text-read text-charcoal tabular-nums antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-charcoal"
        >
          Skip to content
        </a>
        <div className="flex min-h-dvh flex-col">{children}</div>
      </body>
    </html>
  );
}
