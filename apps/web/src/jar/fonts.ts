import { Figtree, JetBrains_Mono, Urbanist } from "next/font/google";

/* anay-design.md section 4. Loaded once; the kit and every app screen share these instances. */
const urbanist = Urbanist({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-urbanist", display: "swap" });
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-figtree", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-jetbrains", display: "swap" });

export const jarFonts = `${urbanist.variable} ${figtree.variable} ${jetbrains.variable}`;
