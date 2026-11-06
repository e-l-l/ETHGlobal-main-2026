import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  BlockBand,
  BlockCluster,
  BlockFrame,
  BlockWall,
  ON,
  SHAPE_NOTES,
  SHAPES,
  THEMES,
  TONES,
  TONE_BG,
  TURNABLE,
  Tile,
  type Theme,
  type TileSpec,
  type Tone,
} from "@/blocks";
import { Button, JarMark, SplitBar } from "@/final";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/cn";
import { routes } from "@/lib/routes";
import { Playground } from "./playground";

/*
 * Living spec for the block pattern (src/blocks). Every demo on this page is the real component,
 * so what you see here is what a landing section gets.
 */

export const metadata: Metadata = {
  title: "Block pattern",
  description: `The ${APP_NAME} block pattern: square tiles of brand greens, each carrying one flat shape. Tones, shapes, rules and ready-made compositions.`,
};

const WRAP = "mx-auto w-full max-w-300 px-4 md:px-8";

const TONE_HEX: Record<Tone, string> = {
  lime: "#c6f28c",
  honeydew: "#ddf7e6",
  leaf: "#6fa65a",
  sage: "#5c7c62",
  fern: "#3f7d4f",
  hunter: "#2c5a3a",
  forest: "#234a2f",
  deep: "#151a13",
};

/* Shape gallery colours: a fixed walk through readable pairs so the gallery itself looks like the pattern. */
const GALLERY: [Tone, Tone][] = [
  ["hunter", "lime"],
  ["lime", "hunter"],
  ["leaf", "forest"],
  ["fern", "lime"],
  ["forest", "leaf"],
  ["honeydew", "fern"],
  ["sage", "lime"],
  ["deep", "leaf"],
];

export default function BlockPatternPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_SHOW_KIT !== "1") notFound();
  return (
    <div className="min-h-dvh bg-canvas text-charcoal">
      <Header />
      <main id="main" className="flex flex-col">
        <Hero />
        <Anatomy />
        <Tones />
        <Shapes />
        <States />
        <Compositions />
        <InContext />
        <Rules />
        <PlaygroundSection />
      </main>
      <BlockBand seed={91} theme="night" rows={2} grain className="bg-deep" />
    </div>
  );
}

/* ------------------------------------------------------------------ Chrome */

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-canvas/90 backdrop-blur-xl motion-reduce:backdrop-blur-none">
      <div className={cn(WRAP, "flex h-14 items-center gap-3")}>
        <Link href={routes.landing} aria-label={`${APP_NAME} home`} className="inline-flex items-center gap-2 rounded-md">
          <JarMark size={24} />
          <span className="font-display text-[18px] font-extrabold tracking-[-0.02em]">{APP_NAME}</span>
        </Link>
        <span className="font-ledger text-tag text-charcoal-muted uppercase">/ Block pattern</span>
        <nav aria-label="Sections" className="ml-auto hidden gap-5 font-body text-note font-semibold text-charcoal-soft lg:flex">
          {[
            ["#tones", "Tones"],
            ["#shapes", "Shapes"],
            ["#compositions", "Compositions"],
            ["#rules", "Rules"],
            ["#playground", "Playground"],
          ].map(([h, l]) => (
            <a key={h} href={h} className="hover:text-charcoal">
              {l}
            </a>
          ))}
        </nav>
      </div>
    </header>
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

function Section({ id, n, title, lead, children, dark }: { id: string; n: string; title: string; lead: ReactNode; children: ReactNode; dark?: boolean }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn("scroll-mt-14 py-16 md:py-24", dark ? "bg-deep text-canvas" : "")}>
      <div className={cn(WRAP, "flex flex-col gap-10")}>
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-3">
            <Eyebrow tone={dark ? "dark" : "light"}>{n}</Eyebrow>
            <h2 id={`${id}-h`} className={cn("m-0 font-display text-[32px] leading-[1.05] font-bold tracking-[-0.03em] md:text-[44px]", dark ? "text-canvas" : "text-charcoal")}>
              {title}
            </h2>
          </div>
          <p className={cn("m-0 max-w-[46ch] font-body text-read", dark ? "text-honeydew/75" : "text-charcoal-soft")}>{lead}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function Code({ children, className }: { children: string; className?: string }) {
  return <pre className={cn("m-0 overflow-x-auto rounded-md bg-deep p-4 font-ledger text-[12px] leading-relaxed text-honeydew", className)}>{children}</pre>;
}

function Caption({ children }: { children: ReactNode }) {
  return <span className="font-ledger text-tag font-medium text-charcoal-muted uppercase">{children}</span>;
}

/* -------------------------------------------------------------------- Hero */

function Hero() {
  return (
    <section className="bg-deep py-10 md:py-14">
      <div className={WRAP}>
        <BlockFrame seed={2026} lit={[0, 1, 8, 9]} interactive>
          <div className="flex items-center gap-3">
            <JarMark size={32} on="dark" lit={4} />
            <span className="font-ledger text-tag font-medium text-honeydew/70 uppercase">Design system</span>
          </div>
          <h1 className="m-0 font-display text-[40px] leading-none font-bold tracking-[-0.035em] text-canvas md:text-[56px]">Block pattern</h1>
          <p className="m-0 font-body text-read text-honeydew/80">
            Square tiles in the brand greens, each carrying one flat shape. One grid, many uses: hero frames, dividers, card corners, backgrounds.
          </p>
          <dl className="m-0 grid grid-cols-3 gap-1.5">
            {[
              [String(TONES.length), "tones"],
              [String(SHAPES.length), "shapes"],
              ["4", "layouts"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-md border border-honeydew/15 px-2.5 py-2">
                <dt className="sr-only">{l}</dt>
                <dd className="m-0 font-display text-h2 text-lime">{v}</dd>
                <dd className="m-0 font-ledger text-[11px] text-honeydew/70 uppercase">{l}</dd>
              </div>
            ))}
          </dl>
        </BlockFrame>
        <p className="mt-3 font-ledger text-[11px] text-honeydew/60">Tap any tile to turn it.</p>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Anatomy */

function Anatomy() {
  const spec: TileSpec = { bg: "hunter", shape: "quarter", fg: "lime", rot: 90 };
  return (
    <Section id="anatomy" n="01 · Anatomy" title="A tile is four choices" lead="Background tone, one shape, the shape's tone, and a quarter-turn rotation. Nothing else: no outlines, no gradients, no shadows.">
      <div className="grid items-center gap-8 md:grid-cols-[280px_1fr]">
        <div className="relative w-full max-w-70">
          <Tile spec={spec} className="rounded-lg" />
        </div>
        <div className="flex flex-col gap-4">
          <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {[
              ["bg", "hunter", "One of 8 tones. Neighbours never share it."],
              ["shape", "quarter", "One of 17 shapes, drawn in a 100×100 box."],
              ["fg", "lime", "Picked from the tones that read on bg."],
              ["rot", "90", "0, 90, 180 or 270. Turnable shapes only."],
            ].map(([k, v, d]) => (
              <li key={k} className="flex flex-col gap-1 rounded-lg border border-hairline bg-surface p-4">
                <span className="font-ledger text-ledger">
                  <span className="text-charcoal-muted">{k}:</span> <span className="font-semibold text-hunter">{v}</span>
                </span>
                <span className="font-body text-note text-charcoal-soft">{d}</span>
              </li>
            ))}
          </ol>
          <Code>{`import { Tile } from "@/blocks";

<Tile spec={{ bg: "hunter", shape: "quarter", fg: "lime", rot: 90 }} />`}</Code>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- Tones */

function Tones() {
  return (
    <Section id="tones" n="02 · Tones" title="Eight greens, fixed pairs" lead="Each tone lists the shape colours that read on it. The generator only uses these pairs; hand-set grids should too. Lime never touches white.">
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
        {TONES.map((t) => (
          <li key={t} className="overflow-hidden rounded-lg border border-hairline bg-surface">
            <div className={cn("flex aspect-[4/3] items-end gap-1.5 p-3", TONE_BG[t])}>
              {ON[t].map((fg) => (
                <span key={fg} title={fg} className={cn("size-5 rounded-full", TONE_BG[fg])} />
              ))}
            </div>
            <div className="flex items-baseline justify-between p-3">
              <span className="font-body text-note font-semibold capitalize">{t}</span>
              <span className="font-ledger text-[11px] text-charcoal-muted">{TONE_HEX[t]}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-4">
        <h3 className="m-0 font-display text-h2">Themes</h3>
        <p className="m-0 max-w-[60ch] font-body text-read text-charcoal-soft">A theme is a weighting of background tones. Pick by the section it sits in.</p>
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(THEMES) as Theme[]).map((th, i) => (
            <figure key={th} className="m-0 flex flex-col gap-2">
              <BlockCluster seed={40 + i} theme={th} cols={4} rows={3} className="w-full overflow-hidden rounded-lg" />
              <figcaption className="flex flex-col gap-0.5">
                <Caption>theme=&quot;{th}&quot;</Caption>
                <span className="font-body text-note text-charcoal-soft">
                  {th === "brand" ? "Default. Mixed sections, the How it works mosaic." : th === "night" ? "Dark sections. Lime only as an accent." : "Light sections. Hunter as the ink."}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ Shapes */

function Shapes() {
  return (
    <Section id="shapes" n="03 · Shapes" title="One shape per tile" lead="Flat, geometric, drawn in currentColor. Turnable shapes follow the grid's step; the rest stay put. Each has a meaning so a tile can hint at the copy beside it.">
      <ul className="m-0 grid list-none grid-cols-3 gap-px overflow-hidden rounded-xl bg-hairline p-0 sm:grid-cols-4 lg:grid-cols-6">
        {SHAPES.map((s, i) => {
          const [bg, fg] = GALLERY[i % GALLERY.length]!;
          return (
            <li key={s} className="flex flex-col bg-surface">
              <Tile spec={{ bg, shape: s, fg }} />
              <div className="flex flex-col gap-1 p-3">
                <span className="flex items-center gap-2 font-ledger text-ledger font-semibold">
                  {s}
                  {TURNABLE.has(s) ? <span className="rounded-chip bg-honeydew px-1 text-[10px] font-medium text-hunter">TURNS</span> : null}
                </span>
                <span className="font-body text-[12px] leading-snug text-charcoal-muted">{SHAPE_NOTES[s]}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------------ States */

function States() {
  const s: TileSpec = { bg: "fern", shape: "quarter", fg: "lime", rot: 0 };
  return (
    <Section id="states" n="04 · States" title="Lit, stepped, turned" lead="Three ways a grid comes alive, and all of them are colour or rotation: no layout moves, nothing slides in on scroll.">
      <div className="grid gap-8 md:grid-cols-3">
        <figure className="m-0 flex flex-col gap-3">
          <div className="grid grid-cols-2 overflow-hidden rounded-lg">
            <Tile spec={s} />
            <Tile spec={s} lit />
          </div>
          <figcaption className="flex flex-col gap-1">
            <Caption>lit</Caption>
            <span className="font-body text-note text-charcoal-soft">The tile goes lime and the shape swaps to a colour that reads on it. Light a 2×2 cluster to point at the panel&apos;s current step.</span>
          </figcaption>
        </figure>
        <figure className="m-0 flex flex-col gap-3">
          <div className="grid grid-cols-4 overflow-hidden rounded-lg">
            {[0, 1, 2, 3].map((st) => (
              <Tile key={st} spec={{ ...s, bg: st % 2 ? "hunter" : "leaf", fg: "lime" }} step={st} />
            ))}
          </div>
          <figcaption className="flex flex-col gap-1">
            <Caption>step = 0 · 1 · 2 · 3</Caption>
            <span className="font-body text-note text-charcoal-soft">A grid-wide quarter turn. Bump it when the content changes and every turnable shape rotates together (500ms, swap curve).</span>
          </figcaption>
        </figure>
        <figure className="m-0 flex flex-col gap-3">
          <div className="grid grid-cols-2 overflow-hidden rounded-lg">
            <Tile spec={{ bg: "lime", shape: "arc", fg: "hunter" }} />
            <Tile spec={{ bg: "lime", shape: "arc", fg: "hunter" }} turns={1} />
          </div>
          <figcaption className="flex flex-col gap-1">
            <Caption>interactive</Caption>
            <span className="font-body text-note text-charcoal-soft">Tap a tile to turn it once more. Tiles are decorative buttons: hidden from screen readers, out of the tab order.</span>
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ Compositions */

function Compositions() {
  return (
    <Section
      id="compositions"
      n="05 · Compositions"
      title="Four ready-made layouts"
      lead="Each takes a seed (same seed, same tiles on server and client), a theme and a density, or hand-set tiles. All of them are BlockGrid underneath."
    >
      <Comp
        name="BlockFrame"
        use="Tiles framing one content panel. Hero, How it works, any feature that deserves a stage. Layouts: center, left, right."
        code={`<BlockFrame seed={12} layout="left" lit={[4, 5, 8, 9]}>
  <h3>Your agent draws stock money</h3>
  …
</BlockFrame>`}
      >
        <BlockFrame seed={12} layout="left" lit={[4, 5, 8, 9]} interactive>
          <Eyebrow tone="dark">Step 03 · Restock</Eyebrow>
          <h3 className="m-0 font-display text-h1-sm text-canvas md:text-h1">Your agent draws stock money</h3>
          <p className="m-0 font-body text-read text-honeydew/80">Inside limits you set and approve once with World ID. Every draw tells you why.</p>
        </BlockFrame>
      </Comp>

      <Comp
        name="BlockBand"
        use="A strip of tiles, one or two rows. Section dividers, the top of the footer, a card header. Phones show the left half."
        code={`<BlockBand seed={5} rows={1} cols={12} />
<BlockBand seed={8} rows={2} theme="day" />`}
      >
        <div className="flex flex-col gap-3">
          <BlockBand seed={5} className="overflow-hidden rounded-lg" />
          <BlockBand seed={8} rows={2} theme="day" className="overflow-hidden rounded-lg" />
        </div>
      </Comp>

      <Comp
        name="BlockCluster"
        use="A small fixed block. Card corners, beside a stat, a generated avatar for a shop (seed it with the shop id)."
        code={`<BlockCluster seed={shopId} cols={2} rows={2} className="w-16 rounded-md overflow-hidden" />`}
      >
        <div className="flex flex-wrap items-end gap-4">
          {[1, 2, 3, 4, 5].map((s) => (
            <BlockCluster key={s} seed={s * 13} cols={2} rows={2} className="w-16 overflow-hidden rounded-md" />
          ))}
          <BlockCluster seed={77} cols={3} rows={2} className="w-36 overflow-hidden rounded-md" />
          <BlockCluster seed={78} cols={4} rows={1} theme="night" className="w-40 overflow-hidden rounded-md" />
        </div>
      </Comp>

      <Comp
        name="BlockWall"
        use="A field of tiles behind a section, faded so copy can sit on top. Fades: bottom, top, sides, radial (quiet middle), none."
        code={`<div className="absolute inset-0 overflow-hidden">
  <BlockWall seed={3} theme="night" cols={12} rows={4} fade="radial" />
</div>`}
      >
        <div className="relative isolate grid min-h-80 place-items-center overflow-hidden rounded-[20px] bg-deep p-8 text-center">
          <div className="absolute inset-0 -z-10">
            <BlockWall seed={3} theme="night" cols={12} rows={4} fade="radial" />
          </div>
          <div className="flex max-w-[34ch] flex-col items-center gap-3">
            <Eyebrow tone="dark">fade=&quot;radial&quot;</Eyebrow>
            <p className="m-0 font-display text-h1 text-canvas">Copy sits in the quiet middle</p>
          </div>
        </div>
      </Comp>
    </Section>
  );
}

function Comp({ name, use, code, children }: { name: string; use: string; code: string; children: ReactNode }) {
  return (
    <article className="grid gap-5 border-t border-hairline pt-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-10">
      <div className="flex flex-col gap-3">
        <h3 className="m-0 font-ledger text-[15px] font-semibold text-hunter">&lt;{name} /&gt;</h3>
        <p className="m-0 font-body text-note text-charcoal-soft">{use}</p>
        <Code className="text-[11px]">{code}</Code>
      </div>
      <div className="min-w-0">{children}</div>
    </article>
  );
}

/* --------------------------------------------------------------- In context */

function InContext() {
  return (
    <Section id="context" n="06 · In context" title="Where it goes on the landing" lead="Use it as a frame, an accent or a texture, never as the content. These are patterns ready to lift into sections.">
      <div className="grid gap-4 md:grid-cols-3">
        {/* Feature card with a band header */}
        <article className="flex flex-col overflow-hidden rounded-xl border border-hairline bg-surface">
          <BlockBand seed={21} cols={8} theme="brand" />
          <div className="flex flex-col gap-2 p-5">
            <Caption>Feature card · band header</Caption>
            <h3 className="m-0 font-display text-h2">Paid in dollars</h3>
            <p className="m-0 font-body text-note text-charcoal-soft">Customers pay in USDC. Other tokens via Uniswap are next.</p>
          </div>
        </article>

        {/* Stat card with a corner cluster */}
        <article className="relative flex flex-col justify-between gap-6 overflow-hidden rounded-xl bg-hunter p-5 text-canvas">
          <BlockCluster seed={33} cols={2} rows={2} theme="night" className="absolute top-0 right-0 w-24" />
          <Caption>
            <span className="text-honeydew/70">Stat · corner cluster</span>
          </Caption>
          <div className="flex flex-col gap-1">
            <span className="font-display text-amount text-lime">10%</span>
            <span className="font-body text-note text-honeydew/80">of each sale repays the advance</span>
          </div>
        </article>

        {/* Receipt with tile avatar */}
        <article className="flex flex-col gap-4 rounded-xl border border-hairline bg-surface p-5">
          <Caption>Row · shop avatar</Caption>
          {[
            ["Block Bodega", 101, "$10.00"],
            ["Mama Ruth's", 202, "$4.50"],
            ["Bike Fix", 303, "$22.00"],
          ].map(([n, seed, v]) => (
            <div key={n as string} className="flex items-center gap-3">
              <BlockCluster seed={seed as number} cols={2} rows={2} className="w-10 overflow-hidden rounded-md" />
              <span className="flex-1 font-body text-note font-semibold">{n}</span>
              <span className="font-ledger text-ledger">{v}</span>
            </div>
          ))}
        </article>
      </div>

      {/* Split hero */}
      <BlockFrame seed={64} layout="right" theme="brand" lit={[2, 3, 6, 7]}>
        <Caption>
          <span className="text-honeydew/70">Split hero · BlockFrame layout=&quot;right&quot;</span>
        </Caption>
        <h3 className="m-0 font-display text-[36px] leading-none font-bold tracking-[-0.03em] text-canvas md:text-[44px]">Stock on credit, repaid from each sale</h3>
        <div className="rounded-md bg-surface p-3 text-charcoal">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-body text-note font-semibold">Paid in USDT · Phone charger</span>
            <span className="font-display text-h2">$10.00</span>
          </div>
          <SplitBar />
        </div>
        <div>
          <Button variant="lime" width="auto">
            Start your shop
          </Button>
        </div>
      </BlockFrame>

      {/* Closing CTA on a wall */}
      <div className="relative isolate overflow-hidden rounded-[20px] bg-lime px-6 py-14 text-center md:py-20">
        <div className="absolute inset-0 -z-10">
          <BlockWall seed={150} theme="day" cols={12} rows={4} fade="sides" density={0.6} />
        </div>
        <div className="mx-auto flex max-w-[30ch] flex-col items-center gap-4 rounded-xl bg-lime/90 p-6">
          <Caption>
            <span className="text-hunter">Closing CTA · BlockWall theme=&quot;day&quot;</span>
          </Caption>
          <p className="m-0 font-display text-h1 text-charcoal">Open your shop in five minutes</p>
          <Button width="auto">Start your shop</Button>
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- Rules */

const DO = [
  "One panel per frame. The tiles are the stage, the panel is the play.",
  "Keep neighbours apart: no shared background left or above (the generator does this for you).",
  "Light a 2×2 cluster to point at something; light nothing else.",
  "Turn shapes when content changes. Pause every loop: button, reduced motion, hidden tab, off screen.",
  "Seed by something stable (a section name, a shop id) so the server and client agree.",
  "Use the drop mark at most once per grid.",
];
const DONT = [
  "Put copy directly on tiles. Use a panel, or a wall with a fade.",
  "Lime tiles on a white page. Lime sits on deep or hunter only.",
  "Animate on scroll, or slide tiles in. Colour and rotation only.",
  "Add outlines, shadows, gradients or rounded tiles. Round the grid, not the tile.",
  "Mix in pixel-art or photography inside the same grid.",
];

function Rules() {
  return (
    <Section id="rules" n="07 · Rules" title="Do and don't" lead="The pattern stays good-looking only while it stays strict.">
      <div className="grid gap-4 md:grid-cols-2">
        {[
          ["Do", DO, "bg-honeydew border-honeydew-line", "bg-hunter"],
          ["Don't", DONT, "bg-surface border-hairline", "bg-risk"],
        ].map(([h, list, box, dot]) => (
          <div key={h as string} className={cn("flex flex-col gap-3 rounded-xl border p-5", box as string)}>
            <h3 className="m-0 font-display text-h2">{h as string}</h3>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {(list as string[]).map((r) => (
                <li key={r} className="flex gap-3 font-body text-note text-charcoal-soft">
                  <i aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-[1px]", dot as string)} />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------- Playground */

function PlaygroundSection() {
  return (
    <Section id="playground" n="08 · Playground" title="Generate one" lead="Shuffle seeds, switch themes, turn the step. Copy the props when you like what you see. Tap tiles to turn them.">
      <Playground />
    </Section>
  );
}
