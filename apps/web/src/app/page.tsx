import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BlockBand, BlockCluster } from "@/blocks";
import { Button, CheckIcon, JarMark, LockIcon, TokenBadge } from "@/final";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { shop } from "@/lib/mock/shop";
import { routes } from "@/lib/routes";
import { Bento } from "./_landing/bento";
import { BLOCKY } from "./_landing/blocky";
import { Explore } from "./_landing/explore";
import { Fog } from "./_landing/fog";
import { LendDune } from "./_landing/lend-dune";
import { Mosaic } from "./_landing/mosaic";
import { PixelScene } from "./_landing/pixel-scene";
import { Staircase } from "./_landing/staircase";

/*
 * Marketing landing page. Copy from feat/landing-page (the first landing, now at /old-landing).
 * Three visual languages, all in the brand greens:
 *   pixel    the hero street scene, the drip dune, the staircase, the pixel fog
 *   blocks   the mosaic, the block bands and walls (steps, stripes, checker, triangles: no curves)
 *   real     the kiosk, the widgets (the actual app)
 * Tokens only (packages/tailwind-config/final.css). Every loop pauses: button, reduced motion,
 * hidden tab, off screen. Nothing animates because the page scrolled.
 */

export const metadata: Metadata = {
  title: { absolute: `${APP_NAME}: dollar advances for small shops, repaid as you sell` },
  description:
    "Dollars for stock today, paid back one sale at a time. 10% of each sale goes toward your advance. Flat fee, no interest, and we never ask for your name, phone or contacts.",
};

const PRIMARY = "Get an advance";
const LEND = "Lend to shops";
const WRAP = "mx-auto w-full max-w-[1200px] px-4 md:px-8";
const H2 = "m-0 font-display text-[40px] leading-[1.04] font-bold tracking-[-0.035em] text-balance md:text-[56px]";

/* Hero copy enters once on load: lead first, support overlapping (choreograph). */
const enter = "motion-safe:animate-[page-in_700ms_var(--ease-snappy)_both]";

export default function LandingPage() {
  return (
    <div className="bg-canvas">
      <SiteHeader />
      <main id="main" className="flex flex-col">
        <Hero />
        <Split />
        <HowItWorks />
        <Product />
        <ADay />
        <Privacy />
        <BadWeek />
        <Limits />
        <Lenders />
        <UnderTheHood />
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
  { href: "#lenders", label: "For lenders" },
] as const;

const drawLine =
  "bg-linear-to-r from-current to-current bg-size-[0%_1px] bg-position-[0_100%] bg-no-repeat transition-[background-size,color] duration-200 ease-snappy hover:bg-size-[100%_1px]";

function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 motion-reduce:backdrop-blur-none">
      <div className={cn(WRAP, "flex h-16 items-center gap-6")}>
        <Link href={routes.landing} aria-label={`${APP_NAME} home`} className="inline-flex shrink-0 items-center gap-2 rounded-md">
          <JarMark size={28} />
          <span className="font-display text-[20px] leading-none font-extrabold tracking-[-0.02em] text-charcoal">{APP_NAME}</span>
        </Link>
        <nav aria-label="Sections" className="hidden flex-1 items-center justify-center gap-7 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={cn("py-1 font-body text-note font-semibold text-charcoal-soft hover:text-charcoal", drawLine)}>
              {n.label}
            </a>
          ))}
        </nav>
        <Button href={routes.home} size="sm" width="auto" className="ml-auto px-5 md:ml-0">
          Open the app
        </Button>
      </div>
    </header>
  );
}

function SiteFooter() {
  const cols: { title: string; links: [string, string][] }[] = [
    { title: "Shops", links: [[PRIMARY, routes.welcome], ["Demo shop", routes.merchant], ["Customer pay screen", routes.pay]] },
    { title: "Lenders", links: [["Senior vault", routes.earn], ["Junior token", routes.junior], ["Trade JAR-J", routes.trade]] },
    { title: "Public", links: [["Protocol dashboard", routes.protocol], ["Risk status", routes.risk], ["Explorer", routes.explorer]] },
  ];
  return (
    <footer className="bg-deep text-honeydew">
      <div className={cn(WRAP, "grid grid-cols-1 gap-10 py-16 md:grid-cols-[1.4fr_1fr_1fr_1fr]")}>
        <div className="flex flex-col gap-3">
          <span className="inline-flex items-center gap-2">
            <JarMark size={28} on="dark" />
            <span className="font-display text-[20px] font-extrabold tracking-[-0.02em] text-canvas">{APP_NAME}</span>
          </span>
          <p className="m-0 max-w-[34ch] font-body text-note text-honeydew/70">Dollars for stock today. Paid back one sale at a time.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title} className="flex flex-col gap-1">
            <h2 className="m-0 font-ledger text-tag font-medium text-honeydew/55 uppercase">{c.title}</h2>
            <ul className="m-0 flex list-none flex-col p-0">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="inline-flex min-h-10 items-center">
                    <span className={cn("font-body text-note text-honeydew/80 hover:text-canvas", drawLine)}>{label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className={cn(WRAP, "flex flex-col gap-1 border-t border-honeydew/10 py-5 font-ledger text-ledger text-honeydew/55 md:flex-row md:justify-between")}>
        <span>Built at ETHGlobal Mumbai · November 2026 · Open source</span>
        <span>Demo data. Example rate 1 USD = {shop.usdToLocal.toLocaleString("en-US")} ARS.</span>
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

const PROMISES = ["Flat fee, no interest", "No penalty for slow weeks", "Your agent, your limits"];

function Hero() {
  return (
    <section aria-labelledby="hero-h" className="relative h-[calc(100svh-4rem)] min-h-[940px] overflow-hidden bg-canvas md:min-h-[720px]">
      <PixelScene />
      {/* Scrim: keeps the copy readable when a cloud drifts behind it. */}
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-full bg-linear-to-r from-canvas/90 via-canvas/55 to-transparent md:w-[62%]" />
      <div className={cn(WRAP, "pointer-events-none relative z-10 pt-12 md:pt-20")}>
        <div className="pointer-events-auto flex max-w-[620px] flex-col gap-5">
          <span className={cn("inline-flex w-fit items-center gap-2 rounded-md border border-hairline bg-surface/80 px-3 py-1.5 font-ledger text-[12px] text-charcoal-soft uppercase backdrop-blur", enter)}>
            <i aria-hidden className="size-1.5 rounded-[1px] bg-hunter" />
            Dollar advances for small shops
          </span>
          <h1 id="hero-h" className={cn("m-0 max-w-[15ch] font-display text-[44px] leading-[1.02] font-bold tracking-[-0.035em] text-charcoal md:text-[64px]", enter)}>
            Dollars for stock today. <span className="text-hunter">Paid back one sale at a time.</span>
          </h1>
          <p className={cn("m-0 max-w-[44ch] font-body text-[18px] leading-[1.55] text-charcoal-soft [animation-delay:90ms]", enter)}>
            No fixed instalments. 10% of each sale goes toward your advance, so slow days cost you nothing extra.
          </p>
          <p
            className={cn(
              "m-0 inline-flex w-fit items-center gap-2.5 rounded-md border border-honeydew-line bg-honeydew py-2 pr-4 pl-3 font-body text-[15px] font-semibold text-hunter [animation-delay:120ms]",
              enter,
            )}
          >
            <LockIcon size={18} className="shrink-0" />
            We never ask for your name, phone or contacts.
          </p>
          <div className={cn("flex flex-col gap-3 pt-1 sm:flex-row [animation-delay:160ms]", enter)}>
            <Button href={routes.welcome} width="auto" className="w-full px-6 sm:w-auto">
              {PRIMARY}
            </Button>
            <Button href="#lenders" variant="secondary" width="auto" className="w-full bg-surface/80 px-6 backdrop-blur sm:w-auto">
              {LEND}
            </Button>
          </div>
          <ul className={cn("m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 font-body text-note text-charcoal-soft [animation-delay:200ms]", enter)}>
            {PROMISES.map((p) => (
              <li key={p} className="inline-flex items-center gap-2">
                <span aria-hidden className="grid size-4.5 place-items-center rounded-[3px] bg-hunter text-canvas">
                  <CheckIcon size={11} strokeWidth={3.5} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- The split */

const PARTNERS = ["Uniswap v4", "World ID", "Anon-RPC"];

function Split() {
  return (
    <section aria-labelledby="split-h" className="bg-hunter text-canvas">
      <BlockBand rows={1} cols={12} theme="brand" shapes={BLOCKY} seed={5} density={0.7} grain />
      <div className={cn(WRAP, "flex flex-wrap items-center justify-center gap-x-10 gap-y-3 border-b border-honeydew/15 py-6 font-ledger text-ledger")}>
        <span className="text-tag text-honeydew uppercase">Built at ETHGlobal Mumbai with</span>
        {PARTNERS.map((p) => (
          <span key={p} className="font-semibold text-canvas">
            {p}
          </span>
        ))}
      </div>
      <div className={cn(WRAP, "flex flex-col items-center gap-12 py-28 text-center md:py-40")}>
        <Eyebrow tone="dark">The split</Eyebrow>
        <h2 id="split-h" className={cn(H2, "max-w-[16ch] md:text-[64px]")}>
          Every sale pays a little back.
        </h2>
        <p className="m-0 max-w-[52ch] font-body text-read text-honeydew/85">
          Customers pay you like always. Nine parts land with you, one part drips back until the advance is paid off. Your customers never see
          the advance.
        </p>
        <div className="flex w-full max-w-[760px] flex-col gap-4">
          <div className="grid h-16 grid-cols-10 gap-1" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={cn("rounded-[2px]", i === 9 ? "bg-lime" : "bg-honeydew/15")} />
            ))}
          </div>
          <div className="flex justify-between gap-4 text-left">
            <div className="flex flex-col gap-1">
              <span className="font-display text-[32px] leading-none font-bold tracking-[-0.025em]">90%</span>
              <span className="font-body text-note text-honeydew">yours, to spend or save</span>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="font-display text-[32px] leading-none font-bold tracking-[-0.025em] text-lime">10%</span>
              <span className="font-body text-note text-honeydew">drips back to the advance</span>
            </div>
          </div>
        </div>
        <Link
          href={routes.advance.details}
          className="group inline-flex min-h-11 items-center gap-2 rounded-md bg-honeydew px-4 font-body text-note font-semibold text-hunter transition-[transform,background-color] duration-150 ease-snappy hover:bg-canvas active:scale-[0.97]"
        >
          Open an advance in the app
          <span aria-hidden className="transition-transform duration-200 ease-snappy group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- How it works */

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-h" className="scroll-mt-16 bg-deep py-28 md:py-40">
      <div className={cn(WRAP, "flex flex-col gap-14 md:gap-20")}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-4">
            <Eyebrow tone="dark">How it works</Eyebrow>
            <h2 id="how-h" className={cn(H2, "max-w-[16ch] text-canvas")}>
              From your first sale to a bigger limit.
            </h2>
          </div>
          <p className="m-0 max-w-[40ch] font-body text-read text-honeydew/75">Four steps. The tiles remix with each one; tap any tile to turn it.</p>
        </div>
        <Mosaic />
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Product */

function Product() {
  return (
    <section id="product" aria-labelledby="product-h" className="scroll-mt-16 bg-canvas py-28 md:py-40">
      <div className={cn(WRAP, "flex flex-col gap-16 md:gap-20")}>
        <div className="mx-auto flex max-w-[720px] flex-col items-center gap-5 text-center">
          <Eyebrow>Product overview</Eyebrow>
          <h2 id="product-h" className={cn(H2, "text-charcoal")}>
            Three parts that keep a shop stocked.
          </h2>
          <p className="m-0 max-w-[52ch] font-body text-read text-charcoal-soft">
            A private check gets you in, every sale drips a little back, and your agent restocks inside your limits.
          </p>
        </div>
        <Explore />
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- A day */

function ADay() {
  return (
    <section id="day" aria-labelledby="day-h" className="scroll-mt-16 bg-well py-28 md:py-40">
      <div className={cn(WRAP, "flex flex-col gap-14 md:gap-20")}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-4">
            <Eyebrow>The app</Eyebrow>
            <h2 id="day-h" className={cn(H2, "text-charcoal")}>
              A day at {shop.name}.
            </h2>
          </div>
          <p className="m-0 max-w-[40ch] font-body text-read text-charcoal-soft">Everything the shop owner sees, on one screen. Play the sale sound, or pause the agent.</p>
        </div>
        <Bento />
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Privacy */

function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-h" className="scroll-mt-16 bg-well pb-28 md:pb-40">
      <div className={WRAP}>
        <Fog />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Bad week */

/** One day: a row of ten blocks, nine unlit and one Hunter, as wide as the day's sales. */
function DayCard({ title, sales, width, children }: { title: string; sales: string; width: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-hairline bg-surface p-6">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-h2 font-bold">{title}</span>
        <span className="font-ledger text-ledger text-charcoal-muted">{sales}</span>
      </div>
      <div className="grid h-4 grid-cols-10 gap-[3px]" style={{ width }} aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={cn("rounded-[1px]", i === 9 ? "bg-hunter" : "bg-unlit")} />
        ))}
      </div>
      <span className="font-body text-note text-charcoal-soft">{children}</span>
    </div>
  );
}

function BadWeek() {
  return (
    <section aria-labelledby="week-h" className="bg-canvas py-28 md:py-40">
      <div className={cn(WRAP, "grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-20")}>
        <div className="flex flex-col gap-5">
          <Eyebrow>Built for real weeks</Eyebrow>
          <h2 id="week-h" className={cn(H2, "max-w-[14ch] text-charcoal")}>
            A slow week costs you nothing extra.
          </h2>
          <p className="m-0 max-w-[46ch] font-body text-read text-charcoal-soft">
            The fee is flat and you see it before you start. When sales slow down, paying back slows with them. No penalty, no late fee, nobody calling.
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <DayCard title="Busy day" sales="$200 in sales" width="100%">
            <strong className="text-hunter">$20</strong> drips back
          </DayCard>
          {/* Bar width is the day's sales relative to the busy day. */}
          <DayCard title="Slow day" sales="$30 in sales" width="max(15%, 7rem)">
            <strong className="text-hunter">$3</strong> drips back. Same fee, a little more time.
          </DayCard>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Limits */

function Limits() {
  return (
    <section id="limits" aria-labelledby="limits-h" className="scroll-mt-16 bg-charcoal pt-28 md:pt-40">
      <div className={WRAP}>
        <Staircase />
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Lenders */

function Ticks({ items, tone }: { items: string[]; tone: "light" | "dark" }) {
  return (
    <ul className={cn("m-0 flex list-none flex-col gap-3 p-0 font-body text-read", tone === "dark" ? "text-honeydew" : "text-charcoal-soft")}>
      {items.map((t) => (
        <li key={t} className="flex items-start gap-3">
          <span aria-hidden className={cn("mt-0.5 grid size-5.5 shrink-0 place-items-center rounded-[4px]", tone === "dark" ? "bg-lime text-charcoal" : "bg-hunter text-canvas")}>
            <CheckIcon size={12} strokeWidth={3.5} />
          </span>
          {t}
        </li>
      ))}
    </ul>
  );
}

function Lenders() {
  return (
    <section id="lenders" aria-labelledby="lenders-h" className="scroll-mt-16 bg-deep py-28 md:py-40">
      <div className={cn(WRAP, "flex flex-col gap-14 md:gap-20")}>
        <div className="flex max-w-[680px] flex-col gap-5">
          <Eyebrow tone="dark">For lenders</Eyebrow>
          <h2 id="lenders-h" className={cn(H2, "text-canvas")}>
            Earn from real shop sales. Pick your risk.
          </h2>
          <p className="m-0 max-w-[52ch] font-body text-read text-honeydew/80">
            Every advance is repaid from daily sales at real counters. The fees flow to lenders in two layers: steady and protected, or first-loss for a
            bigger share.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
          <article className="flex flex-col gap-6 rounded-[20px] border border-hairline bg-surface p-7 md:p-10">
            <span className="w-fit rounded-[4px] bg-well px-2 py-1 font-ledger text-tag text-charcoal-soft uppercase">Senior vault</span>
            <h3 className="m-0 font-display text-h1 font-bold text-charcoal">Steady yield, protected first.</h3>
            <Ticks tone="light" items={["Deposit USDC, earn a share of every fee", "Losses hit the Junior token before you", "Withdraw what isn’t lent out, anytime"]} />
            <Button href={routes.earn} width="auto" className="mt-auto self-start px-6">
              Deposit USDC
            </Button>
          </article>
          <article className="relative flex min-h-[520px] flex-col overflow-hidden rounded-[20px] border border-honeydew/10 bg-charcoal">
            <div className="relative z-10 flex flex-col gap-6 p-7 md:p-10">
              <span className="inline-flex w-fit items-center gap-2 rounded-[4px] bg-lime px-2 py-1 font-ledger text-tag text-charcoal uppercase">
                <TokenBadge size={16} />
                Junior token
              </span>
              <h3 className="m-0 font-display text-h1 font-bold text-canvas">First loss, bigger share.</h3>
              <Ticks tone="dark" items={["A larger cut of the fees", "Absorbs losses first, protecting the vault", "Trades on a Uniswap v4 pool with a risk hook"]} />
              <Button href={routes.junior} variant="lime" width="auto" className="self-start px-6">
                Buy Junior on Uniswap
              </Button>
            </div>
            <LendDune className="absolute inset-x-0 bottom-0 h-[34%]" />
          </article>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- Under the hood */

const PARTS = [
  {
    tag: "Uniswap v4",
    title: "Pay in any token",
    body: "Customers pay in USDT, repayment settles in USDC. The Junior token trades on its own pool, guarded by a risk hook.",
    seed: 3,
  },
  {
    tag: "World ID",
    title: "One approval, then your agent works",
    body: "An Agent Pass turns your cash-flow agent on. If your phone is lost, a World ID check gets your shop back.",
    seed: 8,
  },
  {
    tag: "Anon-RPC",
    title: "No one watching the wire",
    body: "Every read goes through Anon-RPC, so nobody can tie your shop to your phone from the network.",
    seed: 14,
  },
];

function UnderTheHood() {
  return (
    <section aria-labelledby="hood-h" className="bg-canvas py-28 md:py-40">
      <div className={cn(WRAP, "flex flex-col gap-14 md:gap-20")}>
        <div className="flex flex-col gap-5">
          <Eyebrow>Under the hood</Eyebrow>
          <h2 id="hood-h" className={cn(H2, "max-w-[16ch] text-charcoal")}>
            Open source, private by design.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
          {PARTS.map((p) => (
            <article key={p.tag} className="flex flex-col gap-6 overflow-hidden rounded-[20px] border border-hairline bg-surface p-7">
              <div className="flex items-start justify-between gap-4">
                <span className="rounded-[4px] bg-well px-2 py-1 font-ledger text-tag text-charcoal-soft uppercase">{p.tag}</span>
                <BlockCluster cols={3} rows={2} theme="day" shapes={BLOCKY} seed={p.seed} className="w-18 overflow-hidden rounded-[4px]" />
              </div>
              <div className="flex flex-col gap-2.5">
                <h3 className="m-0 font-display text-h2 font-bold text-charcoal">{p.title}</h3>
                <p className="m-0 font-body text-note text-charcoal-soft">{p.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Close */

const BANDS = ["bg-deep", "bg-forest", "bg-hunter", "bg-fern", "bg-leaf", "bg-lime", "bg-honeydew"] as const;

function Close() {
  return (
    <section id="start" aria-labelledby="close-h" className="relative flex flex-col overflow-hidden bg-canvas">
      {/* Stepped jar bands, top and bottom: the gradient as blocks. */}
      <div aria-hidden className="flex flex-col">
        {BANDS.map((b, i) => (
          <span key={b} className={cn("block", b)} style={{ height: `${14 + i * 3}px` }} />
        ))}
      </div>
      <div className="flex flex-col items-center gap-8 px-4 py-28 text-center md:py-40">
        <JarMark size={64} lit={1} />
        <h2 id="close-h" className="m-0 font-display text-[40px] leading-[1.05] font-bold tracking-[-0.035em] text-charcoal md:text-[64px]">
          <span className="block">Stock up today.</span>
          <span className="block text-hunter">Pay it back as you sell.</span>
        </h2>
        <p className="m-0 font-body text-read text-charcoal-soft">No name, no phone number, no contacts. Just your sales.</p>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <Button href={routes.welcome} width="auto" className="px-7">
            {PRIMARY}
          </Button>
          <Button href="#lenders" variant="secondary" width="auto" className="px-6">
            {LEND}
          </Button>
        </div>
      </div>
      <div aria-hidden className="flex flex-col-reverse">
        {BANDS.map((b, i) => (
          <span key={b} className={cn("block", b)} style={{ height: `${14 + i * 3}px` }} />
        ))}
      </div>
    </section>
  );
}
