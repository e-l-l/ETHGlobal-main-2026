import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { BlockBand, BlockFrame, BlockWall } from "@/blocks";
import { JarMark } from "@/final";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/cn";

/*
 * Five cover options, built from the real logo (JarMark), wordmark (Urbanist, display) and block pattern.
 * Each cover is a 3:2 box that scales with its width (cqw units), so it screenshots cleanly at any size.
 * Open one alone with /covers?c=3 and capture it at 1500 px wide for a 1500×1000 PNG.
 */

export const metadata: Metadata = {
  title: "Covers",
  description: `Five cover options for ${APP_NAME}: the ribbon drop, the wordmark and the block pattern.`,
};

const TAGLINE = "Every sale puts 10% in your dollar jar.";
const SUB = "Stock on credit, repaid from each sale.";

/** Size in container-width percent, so the whole cover scales as one. */
const cq = (n: number): CSSProperties => ({ fontSize: `${n}cqw` });
const mark = (w: number): CSSProperties => ({ width: `${w}cqw` });

function Cover({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative isolate aspect-3/2 w-full overflow-hidden", className)} style={{ containerType: "inline-size" }}>
      {children}
    </div>
  );
}

function Mark({ w, lit = 1, on = "dark" }: { w: number; lit?: 0 | 1 | 2 | 3 | 4; on?: "light" | "dark" }) {
  return (
    <div style={mark(w)} className="[&>svg]:h-auto [&>svg]:w-full">
      <JarMark size={160} on={on} lit={lit} />
    </div>
  );
}

function Word({ size, tone = "dark" }: { size: number; tone?: "dark" | "light" }) {
  return (
    <span className={cn("font-display leading-none font-extrabold tracking-[-0.03em]", tone === "dark" ? "text-honeydew" : "text-charcoal")} style={cq(size)}>
      {APP_NAME}
    </span>
  );
}

/* 1. Night wall: a radial field of tiles with a quiet middle, the lockup in it. */
function NightWall() {
  return (
    <Cover className="bg-surface">
      {/* Radial fade that bottoms out at 50% tile opacity, so the white behind the lockup is half strength. */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,.3) 25%, #000 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,.3) 25%, #000 75%)",
        }}
      >
        <BlockWall seed={2026} theme="night" cols={12} rows={8} fade="none" grain />
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ gap: "2.2cqw" }}>
        <Mark w={13} on="light" />
        <Word size={9} tone="light" />
        <p className="m-0 font-ledger tracking-[0.12em] text-black uppercase" style={cq(1.4)}>
          Dollar jar credit for small shops
        </p>
      </div>
    </Cover>
  );
}

/* 2. Split: lockup on a calm panel, the pattern fills the right half. */
function Split() {
  return (
    <Cover className="grid grid-cols-2 bg-deep">
      <div className="flex flex-col justify-center" style={{ padding: "5cqw", gap: "2.6cqw" }}>
        <Mark w={8} />
        <Word size={8} />
        <p className="m-0 font-body leading-[1.2] font-semibold text-honeydew/85" style={{ ...cq(2.5), maxWidth: "26ch" }}>
          {TAGLINE} <span className="text-lime">{SUB}</span>
        </p>
      </div>
      <BlockWall seed={7} theme="brand" cols={6} rows={8} fade="none" grain lit={[14, 15, 20, 21]} />
    </Cover>
  );
}

/* 3. Lime day: light ground, hunter panel, the pattern fading in from the sides. */
function LimeDay() {
  return (
    <Cover className="bg-lime">
      <div className="absolute inset-0 -z-10">
        <BlockWall seed={150} theme="day" cols={12} rows={8} fade="sides" density={0.7} />
      </div>
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex flex-col items-center rounded-[1.6cqw] bg-hunter text-center" style={{ padding: "4cqw 6cqw", gap: "1.8cqw" }}>
          <Mark w={9} />
          <Word size={7.5} />
          <p className="m-0 font-body font-semibold text-honeydew/85" style={cq(1.8)}>
            {TAGLINE}
          </p>
        </div>
      </div>
    </Cover>
  );
}

/* 4. Tier ladder: the logo is a meter, so show all four bands lit, between two tile bands. */
function Ladder() {
  return (
    <Cover className="flex flex-col bg-hunter">
      <BlockBand seed={31} rows={1} cols={12} theme="night" grain className="shrink-0" />
      <div className="flex flex-1 items-center justify-center" style={{ gap: "5cqw", padding: "0 6cqw" }}>
        <Mark w={22} lit={4} />
        <div className="flex flex-col" style={{ gap: "1.6cqw" }}>
          <Word size={9} />
          <p className="m-0 font-display leading-[1.05] font-bold tracking-[-0.02em] text-lime" style={{ ...cq(3.6), maxWidth: "16ch" }}>
            Stock on credit. Repaid from each sale.
          </p>
          <p className="m-0 font-ledger tracking-[0.12em] text-honeydew/70 uppercase" style={cq(1.3)}>
            $50 → $100 → $250 → $500
          </p>
        </div>
      </div>
      <BlockBand seed={32} rows={1} cols={12} theme="night" grain className="shrink-0" />
    </Cover>
  );
}

/* 5. Frame: the pattern's own hero layout, the lockup as the panel. */
function Frame() {
  return (
    <Cover className="grid place-items-center bg-deep">
      <div className="w-full">
        <BlockFrame
          seed={64}
          layout="center"
          theme="brand"
          lit={[11, 12, 19, 20]}
          className="rounded-none"
          panelClassName="items-center text-center"
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.6cqw" }}>
            <Mark w={8} />
            <Word size={6} />
            <p className="m-0 font-ledger tracking-[0.12em] text-lime uppercase" style={cq(1.1)}>
              Every sale puts 10% in your jar
            </p>
          </div>
        </BlockFrame>
      </div>
    </Cover>
  );
}

const COVERS = [
  { n: 1, name: "Night wall", note: "Radial tile field, a quiet middle for the lockup.", el: <NightWall /> },
  { n: 2, name: "Split", note: "Lockup and promise on the left, the pattern on the right with a lit cluster.", el: <Split /> },
  { n: 3, name: "Lime day", note: "Light version. Hunter panel on a lime pattern that fades in from the sides.", el: <LimeDay /> },
  { n: 4, name: "Tier ladder", note: "The logo is a meter: all four bands lit, between two tile bands.", el: <Ladder /> },
  { n: 5, name: "Frame", note: "The block pattern's own hero frame, lockup as the panel.", el: <Frame /> },
];

export default async function CoversPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const one = COVERS.find((x) => String(x.n) === c);

  if (one) {
    return (
      <main className="min-h-dvh bg-deep">
        <div className="mx-auto w-full max-w-375">{one.el}</div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh bg-canvas text-charcoal">
      <div className="mx-auto flex w-full max-w-300 flex-col gap-10 px-4 py-10 md:px-8 md:py-16">
        <header className="flex flex-col gap-2">
          <span className="font-ledger text-tag font-medium text-hunter uppercase">/ Covers</span>
          <h1 className="m-0 font-display text-[36px] leading-none font-bold tracking-[-0.03em] md:text-[48px]">Five cover options</h1>
          <p className="m-0 max-w-[60ch] font-body text-read text-charcoal-soft">
            Built from the real ribbon drop, the wordmark and the block pattern. Open one alone with <code>?c=1</code> to <code>?c=5</code>, then capture it at
            1500 px wide for a 1500×1000 image.
          </p>
        </header>
        {COVERS.map((x) => (
          <section key={x.n} id={`c${x.n}`} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="m-0 font-display text-h2">
                {x.n}. {x.name}
              </h2>
              <Link href={`/covers?c=${x.n}`} className="font-ledger text-tag font-medium text-hunter uppercase underline underline-offset-4">
                Open alone
              </Link>
            </div>
            <div className="overflow-hidden rounded-xl border border-hairline">{x.el}</div>
            <p className="m-0 font-body text-note text-charcoal-soft">{x.note}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
