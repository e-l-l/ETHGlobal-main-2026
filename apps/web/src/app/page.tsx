import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { BlockBand, BlockWall } from "@/blocks";
import { BLOCKY } from "./_landing/blocky";
import { Button, CheckIcon, JarMark, LockIcon, Reveal, ScrollProgress } from "@/final";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { ExampleRate } from "@/lib/currency";
import { shop } from "@/lib/mock/shop";
import { routes } from "@/lib/routes";
import { DayTimeline } from "./_landing/day";
import { Explore } from "./_landing/explore";
import { Fog } from "./_landing/fog";
import { FloatingNav } from "./_landing/floating-nav";
import { PixelScene } from "./_landing/pixel-scene";
import { IconTile, type PixelIconName } from "./_landing/pixel-icons";
import { WeekBreakdown, WeekChart } from "./_landing/week";

/*
 * Marketing landing page. Copy from feat/landing-page (the first landing, now at /old-landing).
 * Three visual languages, all in the brand greens:
 *   pixel    the hero street scene, the drip dune, the staircase, the pixel fog
 *   blocks   block bands, walls and clusters (steps, stripes, checker, triangles: no curves)
 *   icons    12×12 pixel icons for every point (_landing/pixel-icons.tsx)
 *   real     the kiosk, the receipt, the week, the day: real numbers drawn as blocks
 * Tokens only (packages/tailwind-config/final.css). Every loop pauses: button, reduced motion,
 * hidden tab, off screen. Scroll only does two things (final/reveal.tsx): content below the fold fades up once
 * as it arrives, and a hairline under the header fills with progress. Neither replays or parallaxes.
 */

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME}: dollar advances for small shops, repaid as you sell` },
  description:
    "Dollars for stock today, paid back one sale at a time. 8% of each sale goes toward your advance. Fee 0.5% per week while you owe, never more than 3%, and we never ask for your name, phone or contacts.",
};

const PRIMARY = "Get an advance";
const LEND = "Lend to shops";
const WRAP = "mx-auto w-full max-w-300 px-4 md:px-8";
/** How it works runs wider than the rest. */
const WIDE = "mx-auto w-full max-w-360 px-4 md:px-8";
const H2 = "m-0 font-display text-[40px] leading-[1.04] font-bold tracking-[-0.035em] text-balance md:text-[56px]";

/* Hero copy enters once on load: lead first, support overlapping (choreograph). */
const enter = "motion-safe:animate-[page-in_700ms_var(--ease-snappy)_both]";

/* Landing-only type bump: the shared text tokens, one step larger on this page. */
const TYPE_SCALE = {
  "--text-h1": "32px",
  "--text-h2": "23px",
  "--text-read": "19px",
  "--text-note": "16.5px",
  "--text-ledger": "15px",
  "--text-tag": "13px",
} as CSSProperties;

export default function LandingPage() {
  return (
    <div className="landing-zoom bg-canvas" style={TYPE_SCALE}>
      <SiteHeader />
      <main id="main" className="flex flex-col">
        <Hero />
        <div aria-hidden className="bg-canvas">
          <BlockBand rows={1} cols={24} shapes={BLOCKY} seed={7} density={0.7} />
        </div>
        <BadWeek />
        <HowItWorks />
        <ADay />
        <Privacy />
        <Sponsors />
        <Close />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ---------------------------------------------------------------- Chrome */

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#privacy", label: "Privacy" },
] as const;

const drawLine =
  "bg-linear-to-r from-current to-current bg-size-[0%_1px] bg-position-[0_100%] bg-no-repeat transition-[background-size,color] duration-200 ease-snappy hover:bg-size-[100%_1px]";

function SiteHeader() {
  return (
    <FloatingNav>
      <header className="relative overflow-hidden rounded-2xl">
      <div className="flex h-16 items-center gap-5 px-5 md:gap-7 md:px-6">
        <Link href={routes.landing} aria-label={`${APP_NAME} home`} className="inline-flex shrink-0 items-center gap-2 rounded-md">
          <JarMark size={32} />
          <span className="font-display text-[23px] leading-none font-extrabold tracking-[-0.02em] text-charcoal">{APP_NAME}</span>
        </Link>
        <nav aria-label="Sections" className="hidden flex-1 items-center justify-end gap-7 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={cn("py-1 font-body text-[16px] font-semibold text-charcoal-soft hover:text-charcoal", drawLine)}>
              {n.label}
            </a>
          ))}
        </nav>
        <Button href={routes.home} size="sm" width="auto" className="ml-auto px-6 text-[16px] md:ml-0">
          Open the app
        </Button>
      </div>
      <ScrollProgress />
      </header>
    </FloatingNav>
  );
}

function SiteFooter() {
  const columns: [string, [string, string][]][] = [
    [
      "For shops",
      [
        [PRIMARY, routes.welcome],
        ["Demo shop", routes.merchant],
        ["Your agent", routes.agent.log],
      ],
    ],
    [
      "For lenders",
      [
        ["Senior vault", routes.earn],
        ["DripCoin", routes.dripcoin],
        ["Risk", routes.risk],
      ],
    ],
    [
      "Protocol",
      [
        ["How it works", routes.protocol],
        ["Explorer", routes.explorer],
      ],
    ],
  ];
  return (
    <footer className="text-honeydew" style={{ backgroundColor: SAP }}>
      <div className={cn(WRAP, "grid grid-cols-1 gap-12 py-16 md:py-20 lg:grid-cols-[1.1fr_1.6fr] lg:gap-16")}>
        <div className="flex flex-col gap-6">
          <span className="inline-flex items-center gap-4">
            {/* The mark's bands walk the brand greens, a slow wave falling from the tip. */}
            <JarMark size={88} on="dark" cycle />
            <span className="font-display text-[44px] leading-none font-extrabold tracking-[-0.03em] text-canvas md:text-[56px]">{APP_NAME}</span>
          </span>
          <p className="m-0 max-w-[36ch] font-body text-read text-honeydew/85">
            Dollars for stock today, paid back one sale at a time. Built for small shops, funded by lenders who never see who borrowed.
          </p>
          <Button href={routes.welcome} variant="lime" width="auto" className="self-start px-6">
            {PRIMARY}
          </Button>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3">
          {columns.map(([title, links]) => (
            <div key={title} className="flex flex-col gap-3">
              <span className="font-ledger text-tag font-medium text-lime uppercase">{title}</span>
              <ul className="m-0 flex list-none flex-col p-0">
                {links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="inline-flex min-h-10 items-center">
                      <span className={cn("font-body text-read text-honeydew/85 hover:text-canvas", drawLine)}>{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className={cn(WRAP, "flex flex-col gap-1 border-t border-honeydew/25 py-5 font-ledger text-[13px] text-honeydew/60 md:flex-row md:justify-between")}>
        <span>Built at ETHGlobal Mumbai · November 2026 · Open source</span>
        <span>Demo data.<ExampleRate /></span>
      </div>
    </footer>
  );
}

function Eyebrow({ children, tone = "light" }: { children: ReactNode; tone?: "light" | "dark" }) {
  return (
    <span className={cn("inline-flex w-fit items-center gap-2 font-ledger text-tag font-medium uppercase", tone === "dark" ? "text-lime" : "text-hunter")}>
      <i aria-hidden className={cn("size-1.5 rounded-[1px]", tone === "dark" ? "bg-lime" : "bg-hunter")} />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ Hero */


const PROMISES = ["0.5% a week, never more than 3%", "On time? Never more than 3%", "Your agent, your limits"];

const PARTNERS = ["Uniswap v4", "World ID", "Anon-RPC"];

function Hero() {
  return (
    <section aria-labelledby="hero-h" className="relative h-[calc(100svh/var(--lz))] min-h-330 overflow-hidden bg-canvas md:min-h-275">
      <PixelScene />
      {/* Fog: a soft white wash over the left of the scene so the copy reads, fading out to the right. The pixels stay visible through it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-full bg-linear-to-r from-canvas/74 via-canvas/56 to-transparent backdrop-blur-[2px] mask-[linear-gradient(to_right,black_40%,transparent)] md:w-[94%]"
      />
      <div className="pointer-events-none relative z-10 w-full px-4 pt-24 md:px-20 md:pt-44 xl:px-36">
        <div className="pointer-events-auto flex max-w-245 flex-col gap-8">
          <span className={cn("inline-flex w-fit items-center gap-3", enter)}>
            <JarMark size={94} />
            <span className="font-display text-[49px] leading-none font-extrabold tracking-[-0.03em] text-charcoal md:text-[61px]">{APP_NAME}</span>
          </span>
          <h1 id="hero-h" className={cn("m-0 max-w-[14ch] font-display text-[53px] leading-[1.02] font-bold tracking-[-0.035em] text-charcoal [animation-delay:60ms] md:text-[84px]", enter)}>
            Stock up now. <span className="text-hunter">Repay as you sell.</span>
          </h1>
          <p className={cn("m-0 max-w-[44ch] font-body text-[23px] leading-[1.5] text-charcoal-soft [animation-delay:110ms]", enter)}>
            Dollar advances for small shops. Each sale sends 8% back. Pay early, pay less.
          </p>
          <div className={cn("flex flex-col gap-3 sm:flex-row [animation-delay:160ms]", enter)}>
            <Button href={routes.welcome} width="auto" className="w-full px-6 sm:w-auto">
              {PRIMARY}
            </Button>
            <Button href={routes.earn} variant="secondary" width="auto" className="w-full bg-surface/80 px-6 backdrop-blur sm:w-auto">
              {LEND}
            </Button>
          </div>
          <p
            className={cn(
              "m-0 inline-flex w-fit items-center gap-3 rounded-md border border-honeydew-line bg-honeydew py-3 pr-6 pl-4 font-body text-[18px] font-semibold text-hunter [animation-delay:200ms]",
              enter,
            )}
          >
            <LockIcon size={28} className="shrink-0" />
            No name, phone or contacts. Ever.
          </p>
          <ul className={cn("m-0 flex list-none flex-wrap gap-x-8 gap-y-3 p-0 font-body text-[18px] text-charcoal-soft [animation-delay:240ms]", enter)}>
            {PROMISES.map((t) => (
              <li key={t} className="inline-flex items-center gap-2">
                <span aria-hidden className="grid size-7 place-items-center rounded-[4px] bg-hunter text-canvas">
                  <CheckIcon size={16} strokeWidth={3.5} />
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {/* No background: dark green text straight over the scene. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
        <div className={cn(WRAP, "flex flex-wrap items-center justify-center gap-x-10 gap-y-2 py-6 font-ledger text-ledger text-deep")}>
          <span className="text-tag font-medium uppercase">Built at ETHGlobal Mumbai with</span>
          {PARTNERS.map((p) => (
            <span key={p} className="font-bold">
              {p}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Bad week */

const WEEK_PROMISES: [PixelIconName, string, string][] = [
  ["check", "Fee capped at 3%", "0.5% a week while you owe. Pay early, pay less."],
  ["calendar", "Slow day? Pay back less", "A slow day just pays back less. Fall behind the 1% weekly minimum and the fee doubles until you catch up."],
  ["phone", "Nobody calling", "No reminders, no debt collectors, no pressure."],
];

function BadWeek() {
  return (
    <section aria-labelledby="week-h" className="relative overflow-hidden bg-linear-to-br from-hunter via-hunter to-forest py-24 md:py-32">
      <div className={cn(WIDE, "relative z-10 grid grid-cols-1 items-center gap-12 lg:grid-cols-[0.9fr_1.3fr] lg:gap-12")}>
        <Reveal className="flex flex-col gap-6">
          <Eyebrow tone="dark">Built for real weeks</Eyebrow>
          <h2 id="week-h" className={cn(H2, "max-w-[11ch] text-canvas")}>
            A slow week never costs more than <span className="whitespace-nowrap rounded-[14px] bg-lime px-3 text-deep">3%.</span>
          </h2>
          <p className="m-0 max-w-[40ch] font-body text-[19px] text-honeydew/85">
            Fee 0.5% per week while you owe, never more than 3%. When sales slow down, paying back slows with them.
          </p>
          <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
            {WEEK_PROMISES.map(([icon, t, d], i) => (
              <Reveal as="li" key={t} delay={150 + i * 110} className="flex items-center gap-4 rounded-xl bg-honeydew px-5 py-4 hover:-translate-y-0.5 hover:shadow-lift">
                <IconTile name={icon} size={52} />
                <span className="flex flex-col">
                  <span className="font-body text-[19px] font-semibold text-charcoal">{t}</span>
                  <span className="font-body text-[16.5px] text-charcoal-soft">{d}</span>
                </span>
              </Reveal>
            ))}
          </ul>
        </Reveal>
        <Reveal className="flex min-w-0 flex-col gap-6">
          <WeekChart />
          <WeekBreakdown />
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Limits */

/* ---------------------------------------------------------- How it works */

/** Positioning: one line each. */
const DIFFERENT: [PixelIconName, string, string][] = [
  ["lock", "Private", "A ZK pass and World ID, so lenders never see who you are."],
  ["shop", "Built for tiny shops", "Advances from $50 to $300."],
  ["agent", "An agent draws for you", "It restocks inside the limits you set."],
  ["chart", "Risk priced in public", "DripCoin trades on Uniswap, so anyone can see the risk."],
];

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-h" className="scroll-mt-16 bg-canvas py-28 md:py-40">
      <div className={cn(WIDE, "flex flex-col gap-16 md:gap-20")}>
        <Reveal className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-5">
            <Eyebrow>How it works</Eyebrow>
            <h2 id="how-h" className={cn(H2, "max-w-[15ch] text-charcoal")}>
              Three parts that keep a shop stocked.
            </h2>
          </div>
          <p className="m-0 max-w-[42ch] font-body text-read text-charcoal-soft">
            A private check gets you in, every sale drips a little back, and your agent restocks inside your limits.
          </p>
        </Reveal>
        <Reveal>
          <Explore />
        </Reveal>
        <Reveal>
          <ul aria-label="What makes it different" className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {DIFFERENT.map(([icon, t, d], i) => (
              <Reveal as="li" key={t} delay={i * 90} className="flex items-start gap-4 rounded-xl border border-hairline bg-surface px-5 py-4 hover:-translate-y-0.5 hover:shadow-lift">
                <IconTile name={icon} size={52} />
                <span className="flex flex-col">
                  <span className="font-body text-read font-semibold text-charcoal">{t}</span>
                  <span className="font-body text-note text-charcoal-soft">{d}</span>
                </span>
              </Reveal>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- A day */

/** Block-pattern decal for a section corner: tiles dissolve toward the middle so the copy keeps a quiet ground. */
function CornerBlocks({ className, seed, corner }: { className: string; seed: number; corner: "top right" | "bottom left" }) {
  const mask = `radial-gradient(circle at ${corner}, #000 0%, rgb(0 0 0 / 0.55) 38%, transparent 72%)`;
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute -z-10 size-72 opacity-45 md:size-112", className)}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      <BlockWall cols={6} rows={6} fade="none" theme="night" shapes={BLOCKY} seed={seed} density={0.7} grain />
    </div>
  );
}

function ADay() {
  return (
    <section id="day" aria-labelledby="day-h" className="relative isolate scroll-mt-16 overflow-hidden bg-linear-to-br from-hunter via-hunter to-forest py-24 md:py-32">
      <CornerBlocks className="top-0 right-0" seed={13} corner="top right" />
      <CornerBlocks className="bottom-0 left-0" seed={19} corner="bottom left" />
      <div className={cn(WRAP, "relative flex flex-col gap-14 md:gap-16")}>
        <Reveal className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-5">
            <Eyebrow tone="dark">The app</Eyebrow>
            <h2 id="day-h" className={cn(H2, "text-canvas")}>
              A day at {shop.name}.
            </h2>
          </div>
          <p className="m-0 max-w-[40ch] font-body text-read text-honeydew/85">One day of sales, and where every dollar went.</p>
        </Reveal>
        <DayTimeline />
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Privacy */

function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-h" className="scroll-mt-16 bg-canvas py-28 md:py-40">
      <div className={WRAP}>
        <Reveal>
          <Fog />
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Sponsors */

type Sponsor = {
  name: string;
  logo: string;
  w: number;
  h: number;
  dark?: boolean;
  /** Stacked two-line logo: render it a step taller so it matches the wide wordmarks. */
  tall?: boolean;
  title: string;
  points: [PixelIconName, string, string][];
};

const SPONSORS: Sponsor[] = [
  {
    name: "Uniswap Foundation",
    logo: "/sponsors/uniswap.png",
    w: 1352,
    h: 317,
    title: "The market prices default risk.",
    points: [
      ["coin", "DripCoin, first loss, listed", "DripCoin (DRIP) is the first-loss tranche, an ERC-4626 vault. Its shares trade against USDC on a v4 pool."],
      ["swap", "RiskHook fee funds the reserve", "A USDC-only fee on swaps, flushed to the reserve that covers losses after DripCoin."],
      ["chart", "TWAP oracle: price drops, limits drop", "The risk agent compares the 1h and 24h TWAP. A fall of over 10% lowers lending limits."],
    ],
  },
  {
    name: "World",
    logo: "/sponsors/world.png",
    w: 778,
    h: 208,
    title: "Only at the human moments.",
    points: [
      ["agent", "Agent Pass: delegate once", "The approval is bound to one agent key and its limits. After that, nobody taps. Declined: no mandate, no draws."],
      ["eye", "Never sees the shop", "World plays no part in underwriting. It never learns which business or what was borrowed."],
      ["phone", "IDKit: recover on a new phone", "Proof of Human unlocks an encrypted backup of the merchant's credentials. Same human, same backup."],
    ],
  },
  {
    name: "Ethereum Foundation",
    logo: "/sponsors/ethereum.jpg",
    w: 506,
    h: 205,
    tall: true,
    title: "ZK needs network privacy too.",
    points: [
      ["shield", "Proofs hide the leaf", "But asking an RPC for your Merkle path, balance or sales tells it which shop is yours."],
      ["network", "Anon-RPC reads, local path", "The app reads through Anon-RPC, downloads every leaf and builds the proof path on the device."],
      ["lock", "Writes go through a relayer", "Anon-RPC is read-only, so draws and claims go through our relayer. The merchant's wallet never appears."],
    ],
  },
];

function Sponsors() {
  return (
    <section id="sponsors" aria-labelledby="sponsors-h" className="scroll-mt-16 bg-well py-28 md:py-44">
      <div className={cn("mx-auto flex w-full max-w-440 flex-col gap-16 px-4 md:gap-24 md:px-10 xl:w-[92%]")}>
        <Reveal className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-160 flex-col gap-5">
            <Eyebrow>Built with</Eyebrow>
            <h2 id="sponsors-h" className={cn(H2, "text-charcoal")}>
              Tailored to each of our three partners.
            </h2>
          </div>
          <p className="m-0 max-w-[44ch] font-body text-read text-charcoal-soft">
            Each partner solves one real problem in the product: pricing risk, proving a human, and keeping a shop private on the network.
          </p>
        </Reveal>
        <Reveal>
          <ul className="m-0 grid list-none grid-cols-1 gap-6 p-0 lg:grid-cols-3 lg:gap-10">
            {SPONSORS.map((sp, si) => (
              <Reveal
                as="li"
                key={sp.name}
                delay={si * 120}
                className={cn("flex flex-col gap-9 rounded-[24px] border p-8 md:p-12", sp.dark ? "border-charcoal bg-charcoal" : "border-hairline bg-surface")}
              >
                <Image src={sp.logo} alt={sp.name} width={sp.w} height={sp.h} className={cn("w-auto max-w-full self-center object-contain object-center", sp.tall ? "h-20 md:h-24" : "h-16 md:h-20")} />
                <h3 className={cn("m-0 font-display text-h1 font-bold", sp.dark ? "text-canvas" : "text-charcoal")}>{sp.title}</h3>
                <ul className="m-0 flex list-none flex-col gap-7 p-0">
                  {sp.points.map(([icon, t, d]) => (
                    <li key={t} className="flex items-start gap-4">
                      <IconTile name={icon} tone={sp.dark ? "lime" : undefined} size={56} />
                      <span className="flex flex-col gap-1">
                        <span className={cn("font-body text-read font-semibold", sp.dark ? "text-canvas" : "text-charcoal")}>{t}</span>
                        <span className={cn("font-body text-note", sp.dark ? "text-honeydew" : "text-charcoal-soft")}>{d}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Close */

/* Sap green: the footer ground. The last band is the same colour, so the streak runs straight into the footer. */
const SAP = "#0f2418";
/* The spectrum, each step a touch darker than the brand token so the whole streak sits in the footer's family. */
const BANDS = [SAP, "#173a24", "#21512f", "#2f6b42", "#559149", "#9bc76a", "#bfe3c8"] as const;

/** Stepped drip bands above the footer: the whole spectrum, light to deep. */
function Close() {
  return (
    <div aria-hidden className="flex flex-col-reverse bg-canvas">
      {BANDS.map((b, i) => (
        <span key={b} className="block" style={{ height: `${22 + i * 6}px`, backgroundColor: b }} />
      ))}
    </div>
  );
}
