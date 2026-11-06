import { Figtree, JetBrains_Mono, Urbanist } from "next/font/google";

/* Urbanist (display), Figtree (body), JetBrains Mono (ledger). Loaded once in the root layout. */
const urbanist = Urbanist({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-urbanist", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-figtree", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jetbrains", display: "swap" });

export const jarFonts = `${urbanist.variable} ${figtree.variable} ${jetbrains.variable}`;
