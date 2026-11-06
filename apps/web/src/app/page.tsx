import type { Metadata } from "next";
import { Hero } from "@/landing/Hero";

/* Marketing landing page (what the company does). The web app starts at /home. */

export const metadata: Metadata = {
  title: { absolute: "DripMoni: dollar advances for small shops, repaid as you sell" },
};

export default function LandingPage() {
  return (
    <main className="min-w-0 bg-canvas text-charcoal">
      <Hero />
      <div className="h-12" />
    </main>
  );
}
