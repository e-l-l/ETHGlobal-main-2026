import type { Metadata } from "next";
import { BadWeek } from "@/landing/BadWeek";
import { FinalCta } from "@/landing/FinalCta";
import { Footer } from "@/landing/Footer";
import { Hero } from "@/landing/Hero";
import { HowItWorks } from "@/landing/HowItWorks";
import { Lenders } from "@/landing/Lenders";
import { Partners } from "@/landing/Partners";
import { Privacy } from "@/landing/Privacy";
import { Split } from "@/landing/Split";
import { UnderTheHood } from "@/landing/UnderTheHood";

/* The first landing page, kept at /old-landing for reference. The current one is at /. */

export const metadata: Metadata = {
  title: {
    absolute: "DripMoni: first landing page",
  },
};

export default function LandingPage() {
  return (
    <>
      <main className="min-w-0 bg-canvas leading-[normal] text-charcoal">
        <Hero />
        <div className="h-12" />
        <Partners />
        <Split />
        <HowItWorks />
        <Privacy />
        <BadWeek />
        <Lenders />
        <UnderTheHood />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
