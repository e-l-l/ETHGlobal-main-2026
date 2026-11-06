"use client";

import { useState, type ReactNode } from "react";
import { BoltIcon, EyeIcon, LockIcon, ShieldIcon } from "@/final/icons";
import { ArrowRightIcon, CopyIcon } from "@/final/icons";
import { Reveal } from "@/final/reveal";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/cn";
import {
  DRAW_LINE,
  ENTER,
  Eyebrow,
  H2,
  PIXEL_NOTCH,
  Section as LandingSection,
  SectionHeading,
  Wrap,
  WRAP,
} from "@/final/layout";
import {
  AppIcon,
  Banner,
  BottomNav,
  Button,
  Card,
  Chips,
  Divider,
  GradientHero,
  Heading,
  IconButton,
  JarBandStrip,
  JarCard,
  JarMark,
  KeyValue,
  Label,
  Ledger,
  LedgerGrid,
  Lockup,
  LossWaterfall,
  Money,
  PacePicker,
  Pill,
  PixelDune,
  ProgressBar,
  Ring,
  SaleRow,
  Segmented,
  SettingRow,
  SplitBar,
  Spinner,
  Steps,
  Switch,
  Text,
  TextField,
  TextLink,
  TierMeter,
  TokenBadge,
  WaveBand,
  WorldMark,
} from "@/final";

const NAV = [
  ["colour", "Colour"],
  ["type", "Type"],
  ["logo", "Logo"],
  ["patterns", "Patterns"],
  ["actions", "Actions"],
  ["surfaces", "Surfaces"],
  ["status", "Status"],
  ["forms", "Forms"],
  ["domain", "Domain"],
  ["screen", "Screen"],
  ["laws", "Landing laws"],
  ["landing-update", "Landing update"],
] as const;

/* Swatches mirror packages/tailwind-config/final.css. Class names are literal so Tailwind sees them. */
const GREENS: [string, string, string, string][] = [
  ["charcoal", "#262E24", "bg-charcoal", "Text, deepest ink"],
  ["hunter", "#2C5A3A", "bg-hunter", "Primary, links, brand panels"],
  ["forest", "#234A2F", "bg-forest", "Hunter pressed"],
  ["fern", "#3F7D4F", "bg-fern", "Success text, positive deltas"],
  ["sage", "#5C7C62", "bg-sage", "Quiet brand, icons"],
  ["leaf", "#6FA65A", "bg-leaf", "Decoration only"],
  ["lime", "#C6F28C", "bg-lime", "Fill on Hunter only"],
  ["honeydew", "#DDF7E6", "bg-honeydew", "Tints, tonal buttons"],
];
const GROUNDS: [string, string, string, string][] = [
  ["canvas", "#F6FAF5", "bg-canvas", "Page"],
  ["surface", "#FFFFFF", "bg-surface", "Cards, inputs, sheets"],
  ["well", "#EEF4EC", "bg-well", "Segmented well, quiet fills"],
  ["hairline", "#DFE9DC", "bg-hairline", "Card borders, dividers"],
  ["track", "#B7CDB1", "bg-track", "Empty progress, toggle off"],
  ["unlit", "#A9C3A2", "bg-unlit", "Unlit bands, the 90%"],
  ["control", "#6F8A68", "bg-control", "Borders on tappable things"],
  ["charcoal-muted", "#55664F", "bg-charcoal-muted", "Labels, captions"],
];
const STATUS: [string, string, string, string][] = [
  ["caution", "#7A4F00", "bg-caution", "Slow week"],
  ["caution-tint", "#FBF1DC", "bg-caution-tint", "Caution banner"],
  ["risk", "#A3341D", "bg-risk", "Errors, revoke"],
  ["risk-tint", "#FBE6E1", "bg-risk-tint", "Risk banner"],
];

const CONTRAST: [string, string, string, string][] = [
  ["bg-canvas text-charcoal", "Charcoal on canvas", "13.3", "Body headings"],
  ["bg-canvas text-charcoal-soft", "Charcoal soft on canvas", "9.0", "Body copy"],
  ["bg-canvas text-charcoal-muted", "Muted on canvas", "5.9", "Labels"],
  ["bg-hunter text-canvas", "Canvas on Hunter", "7.6", "Primary button"],
  ["bg-hunter text-lime", "Lime on Hunter", "6.3", "Repaid figure"],
  ["bg-lime text-charcoal", "Charcoal on lime", "11.0", "Lime button on panels"],
  ["bg-surface text-fern", "Fern on white", "4.9", "Success text"],
  ["bg-surface text-lime", "Lime on white", "1.2", "Never"],
];

const DUNE = [12, 18, 9, 22, 30, 26, 14, 0, 19, 33, 28, 35, 24, 31, 40, 22, 18, 29, 38, 44, 36, 27, 41, 48];

function Section({ id, label, title, children, note }: { id: string; label: string; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-28 flex-col gap-5 border-t border-hairline pt-8">
      <header className="flex flex-col gap-1.5">
        <Label>{label}</Label>
        <Heading size="h1">{title}</Heading>
        {note ? <Text className="max-w-[64ch]">{note}</Text> : null}
      </header>
      {children}
    </section>
  );
}

function Spec({ name, children, className }: { name: string; children: ReactNode; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <Label>{name}</Label>
      <div className={cn("flex min-w-0 flex-col gap-4 rounded-lg border border-dashed border-track p-4", className)}>{children}</div>
    </div>
  );
}

const grid = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,320px),1fr))] items-start gap-5";

/* Landing laws: rules the marketing page introduces. Source of each rule: apps/web/src/app/page.tsx and _landing/*. */
const LAW_LAYOUT: [string, string][] = [
  ["Section rhythm", "Every content band is py-28 md:py-40. An edge band drops one side (pt-28 md:pt-40 on the charcoal ladder) when the neighbour carries the gap."],
  ["WRAP", "mx-auto, max 1200px, px-4 md:px-8. Every section's content sits inside it. Full-bleed bands sit outside."],
  ["Section header", "Eyebrow, H2, lede. Split (lede to the right from md), stack, or centred. Content gap gap-14 phone, md:gap-20."],
  ["Grids", "One column on phones. Cards md:grid-cols-3 with gap-4 md:gap-6. Text beside art md:grid-cols-2 with gap-12 md:gap-20."],
  ["Anchors", "Every #id section takes scroll-mt-16. The floating nav hides on scroll down, so 4rem is enough to clear it."],
  ["Hero", "Exactly one screen: h-svh, because the nav floats and takes no space. Min 1150px on phones, 940px from md."],
];

const LAW_TYPE: [string, string][] = [
  ["H2", "40px phone, 56px from md. Leading 1.04, tracking -0.035em, balanced. The split and the close go to 64px from md."],
  ["Sentence headings", "H2s are whole sentences ending in a full stop, about 14 to 16ch wide when a lede sits beside them."],
  ["Accent clause", "One clause of a hero or close headline is set in Hunter. Nothing else in the heading changes colour."],
  ["Eyebrow", "Mono 11, uppercase, a 6px square marker. Hunter on light, Lime on dark. A short noun, never a sentence."],
  ["Lede", "text-read, 16px on 1.55. Max 40 to 52ch. Charcoal soft on light, honeydew at 80% on dark."],
  ["Figures", "Split figures 32px, leading none, tracking -0.025em, tabular."],
];

const LAW_COLOUR: [string, string][] = [
  ["Alternation", "Light bands alternate canvas and well. One Hunter band remains: A day at the kiosk. The green split band after the hero is gone. Same-tone neighbours merge: the second drops its top padding."],
  ["Dark bands", "Eyebrow on dark, headings canvas, body honeydew at 75 to 85%. Lime is the only accent and sits on Hunter, charcoal or deep."],
  ["Lime", "Never on white (1.2:1). Lime buttons only on Hunter or charcoal panels."],
  ["Lines", "border-hairline on light cards and the header. Honeydew at 10 to 15% on dark."],
  ["Cards", "Surface, hairline border, 20px radius, no shadow. Shadow-lift only on floating pins."],
  ["Radius", "Pixel parts 1 to 4px. Notched boxes use the pixel notch. Buttons md."],
];

const LAW_LANGUAGES: [string, string][] = [
  ["Pixel", "Hero street scene, the staircase, the privacy fog. The scene is drawn on a fine grid: 3px squares on desktop, 2px on phones. Icons are 12 by 12 bitmaps."],
  ["Blocks", "Mosaic, block bands, walls. Steps, stripes, checkers, triangles. No curves. Drip band strips 14 to 32px at section edges."],
  ["Real", "The merchant app itself: widgets and a day timeline built from the mock shop data. No mockup photos. The footer says the data is demo."],
  ["Mixing", "A section picks one language. The how-it-works row pairs a block wall with a real product card."],
];

const LAW_MOTION: [string, string][] = [
  ["Load", "Hero copy only: page-in 700ms, lead first, support on 90ms steps. Nothing animates because the page scrolled."],
  ["Easing", "ease-snappy for everything. ease-swap only for the staircase rise, which runs both ways. Hover 200ms, press 150ms, content swap 300ms."],
  ["Press", "active:scale-[0.97] on every pressable control. Light cards lift 2px on hover. Dark buttons grow 2% on hover."],
  ["Draw line", "Nav and footer links draw a 1px underline left to right on hover, 200ms."],
  ["Swapped content", "Keyed remount with starting styles: opacity 0, 4px down, 2px blur, settling in 300ms."],
  ["Loops", "All loops go through useLive: they run only when motion is allowed, the tab is visible and the element is on screen. No Pause or Play buttons anywhere: this is production, not a demo."],
  ["Reduced motion", "Loops hold a still frame. The global rule drops durations to 0.01ms. Backdrop blur is removed."],
  ["Floating nav", "A fixed pill, not a full-width bar. See Landing update below: hides on scroll down, returns on any scroll up."],
];

const LAW_COPY: [string, string][] = [
  ["Primary", "Get an advance. The same label in the hero and the close, default variant."],
  ["Secondary", "Lend to shops. Secondary variant, opens the lender screen in the app. The landing page has no lenders section."],
  ["Header CTA", "Open the app. Small, one per header."],
  ["Action verbs", "Buttons name the action and its object: Deposit USDC, Buy DripCoin on Uniswap. No Learn more."],
  ["Text links", "Label then an arrow that nudges 2px on hover."],
  ["Nav", "Two anchors: How it works, Privacy."],
];


/* Landing update: everything changed on the marketing page after the laws above were written. Source: apps/web/src/app/page.tsx and _landing/*. */
const UPD_HERO: [string, string][] = [
  ["Lockup first", "The logo mark (85px) and the wordmark lead the hero, wordmark 55px, 69px from md. It replaces the small pill above the headline."],
  ["Headline", "Stock up now. Repay as you sell. 60px phone, 94px from md, 14ch wide, accent clause in Hunter."],
  ["Support", "One 26px line under the headline, then Get an advance and Lend to shops, then the lock pill, then the three ticks (20px)."],
  ["Position", "Wide, low and right: 890px column, pt-16 md:pt-32, px-4 md:px-20 xl:px-36. It does not sit inside WRAP."],
  ["Fog, not a box", "A white wash behind the copy: canvas at 92 to 70% fading to clear, 2px blur, masked to the left 94% of the hero. The pixel scene stays visible through it. A boxed panel was tried and rejected."],
];

const UPD_SCENE: [string, string][] = [
  ["Fine grid", "Two canvas pixels per art unit. Still layers (sky, skyline, street) are painted once per resize into cached canvases; only clouds, windows and actors redraw, at 30fps."],
  ["One sale, in order", "Customer walks up, taps (phone lights, ring pulses), coin arcs onto the counter, 10% hops into the pool, customer turns and leaves. About 5.6s per loop."],
  ["Cast", "Two alternating shoppers, a shopkeeper behind the counter who nods and holds out a hand, a passer-by with a bag, and the AI agent: a robot with an AI chest panel. Every fourth sale it throws a crate of stock to the counter."],
  ["Kiosk", "Twinkling bulbs under the awning, awning and counter shadows, glass glare, produce crates, ground shadow. Kiosk sits at 72% of the width to leave room for the agent."],
  ["Street", "Pavement with staggered joints, kerb, quiet road. No hedge, no speckle, no dissolve into the next section."],
  ["Clouds", "One flat light green (honeydew-line), no shading. Right-hand sky only, clear of the sun. Each cloud lets 4 small lime drops fall for under 2s about every 9s."],
  ["Chips", "Events slide out of the kiosk sideways, alternating left and right, hold about 3s, then drift up and fade. Icon tile, kind, item, amount. From 2xl only, so they never cross the copy."],
  ["Still frame", "Reduced motion: no loop, no rain, no chips. One composed frame."],
];

const UPD_PAGE: [string, string][] = [
  ["Floating nav", "Fixed pill, max 880px, top-3 md:top-4, rounded-2xl, hairline border, shadow-lift, canvas at 80% with blur. Slides up and fades on scroll down past 64px, returns on any scroll up, always shown at the top. Hidden means inert."],
  ["Day at the kiosk", "Background Hunter (was well). Eyebrow dark, heading canvas, lede honeydew."],
  ["Removed: the split", "The green band after the hero, with its block-pattern strip and 90/10 receipt, is gone."],
  ["Removed: lenders section", "The For lenders section, its nav link and its fee-split bar, loss-order boxes, block bands and falling-pixel dune are gone. Lend to shops opens the app."],
  ["Removed: Open source", "The Under the hood cards are gone. The partner names live in the hero strip and the Built with section."],
  ["No demo chrome", "No Pause, Play or Pause steps buttons on any loop."],
];

const UPD_NAME: [string, string][] = [
  ["Name", "DripMoney. Read from APP_NAME in src/lib/brand.ts, never typed."],
  ["The old name", "The previous product word is gone from all user-facing copy. Use drip: Your drip, Shop's drip, drip balance. Component names that still carry it are internal only."],
  ["Junior token", "DripCoin (DRIP), on every screen."],
  ["Dollar", "Dollar is a description of the advance (dollar advances, dollars for stock), never part of the name."],
];

function LawList({ rows }: { rows: [string, string][] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {rows.map(([name, rule]) => (
        <li key={name} className="flex flex-col gap-0.5">
          <span className="font-body text-note font-semibold text-charcoal">{name}</span>
          <span className="font-body text-note text-charcoal-soft">{rule}</span>
        </li>
      ))}
    </ul>
  );
}

const TONE_ORDER: [string, string][] = [
  ["bg-canvas", "canvas"],
  ["bg-hunter", "hunter"],
  ["bg-deep", "deep"],
  ["bg-canvas", "canvas"],
  ["bg-well", "well"],
  ["bg-canvas", "canvas"],
  ["bg-charcoal", "charcoal"],
  ["bg-deep", "deep"],
  ["bg-canvas", "canvas"],
];

function Swatches({ rows }: { rows: [string, string, string, string][] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] gap-3">
      {rows.map(([name, hex, cls, use]) => (
        <div key={name} className="flex flex-col gap-1.5">
          <span className={cn("h-14 rounded-md border border-hairline", cls)} />
          <span className="font-body text-note font-semibold text-charcoal">{name}</span>
          <Ledger className="text-[12px] text-charcoal-muted">{hex}</Ledger>
          <span className="font-body text-[12px] leading-snug text-charcoal-muted">{use}</span>
        </div>
      ))}
    </div>
  );
}

export function FinalGallery() {
  const [seg, setSeg] = useState<"today" | "week" | "month">("week");
  const [chip, setChip] = useState<"50" | "100" | "200">("100");
  const [pace, setPace] = useState<"slow" | "usual" | "busy">("usual");
  const [voice, setVoice] = useState(true);
  const [world, setWorld] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");

  const run = () => {
    setBusy(true);
    setTimeout(() => setBusy(false), 1600);
  };

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-hairline bg-canvas/85 backdrop-blur-lg motion-reduce:backdrop-blur-none">
        <div className="mx-auto flex max-w-280 flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
          <Lockup size={28} />
          <nav aria-label="Sections" className="flex flex-wrap gap-1">
            {NAV.map(([id, l]) => (
              <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center rounded-md px-2.5 font-ledger text-[12px] text-charcoal-soft hover:bg-well hover:text-charcoal">
                {l}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <main className="mx-auto flex max-w-280 flex-col gap-12 px-4 pt-10 pb-24">
        <header className="flex flex-col gap-4">
          <Pill tone="saving">Final kit · light</Pill>
          <Heading level={1} size="hero">Greens on white.</Heading>
          <Text className="max-w-[60ch]">
            dev1&apos;s light ground, dev2&apos;s typography, logo, patterns and green harmony. Every component is Tailwind v4 utilities;
            tokens live in <Ledger className="text-hunter">packages/tailwind-config/final.css</Ledger>.
          </Text>
          <JarBandStrip className="max-w-60" />
        </header>

        {/* ------------------------------------------------------------ colour */}
        <Section
          id="colour"
          label="01 · Colour"
          title="One green family, white ground"
          note="All chromatic hues sit in dev2's 128–157° band. Warm greens act (Hunter, Leaf, Lime), cool greens hold surfaces (Honeydew, canvas, well). Lime is the single saturation peak, and it only ever sits on Hunter or Charcoal."
        >
          <Label>Greens</Label>
          <Swatches rows={GREENS} />
          <Label>Grounds and lines</Label>
          <Swatches rows={GROUNDS} />
          <Label>Status</Label>
          <Swatches rows={STATUS} />
          <Label>Measured contrast</Label>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3">
            {CONTRAST.map(([cls, name, ratio, use]) => (
              <div key={name} className={cn("flex items-center justify-between gap-3 rounded-md border border-hairline px-4 py-3", cls)}>
                <span className="flex flex-col">
                  <span className="font-body text-note font-semibold">{name}</span>
                  <span className="font-ledger text-[12px] opacity-80">{use}</span>
                </span>
                <span className="font-display text-h2 tabular-nums">{ratio}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* -------------------------------------------------------------- type */}
        <Section id="type" label="02 · Type" title="Urbanist, Figtree, JetBrains Mono" note="dev2 typography only. Money is always tabular, dollars first, local amount underneath in mono.">
          <div className={grid}>
            <Spec name="Hero · Urbanist 700 · 56 / 40 phone">
              <Heading size="hero">Every sale pays it back.</Heading>
            </Spec>
            <Spec name="Amount · Urbanist 700 · 40">
              <Money usd={86.4} local />
            </Spec>
            <Spec name="H1 · 28 / 24 phone · H2 · 20">
              <Heading size="h1">Your agent drew $100</Heading>
              <Heading size="h2" level={3}>About 12 days at your usual pace</Heading>
            </Spec>
            <Spec name="Body · Figtree 16 · Note 14">
              <Text>Every sale sends 8% to your advance. Nobody can tell who owes.</Text>
              <Text size="note" tone="muted">No penalty, no late fee.</Text>
            </Spec>
            <Spec name="Label · Mono 11 · Ledger · Mono 13">
              <Label>Repaid this week</Label>
              <Ledger>0x7a3f…c91e · 14:02</Ledger>
            </Spec>
          </div>
        </Section>

        {/* -------------------------------------------------------------- logo */}
        <Section
          id="logo"
          label="03 · Logo"
          title="Ribbon drop"
          note="On white: Hunter bands, Leaf for the lit band (lime would vanish). On Hunter or Charcoal: Honeydew bands, Lime lit. Lit bands = tier + 1."
        >
          <div className={grid}>
            <Spec name="Lockup · light and on Hunter">
              <Lockup size={36} />
              <div className="rounded-md bg-hunter p-4"><Lockup size={36} on="dark" /></div>
            </Spec>
            <Spec name="Mark sizes · 64 · 40 · 24 · 20 (solid)">
              <div className="flex items-end gap-4">
                <JarMark size={64} label="DripMoney" />
                <JarMark size={40} />
                <JarMark size={24} />
                <JarMark size={20} />
              </div>
            </Spec>
            <Spec name="Token badge · app icons">
              <div className="flex items-center gap-4">
                <TokenBadge size={44} label="DripCoin (DRIP)" />
                <AppIcon size={64} />
                <AppIcon size={64} tone="charcoal" />
              </div>
            </Spec>
            <Spec name="Tier meter · Standing Pass">
              <TierMeter tier={1} />
              <Divider />
              <TierMeter tier={3} />
            </Spec>
            <Spec name="Loading · bands light bottom to top">
              <div className="flex items-center gap-4">
                <JarMark size={56} loading label="Saving" />
                <Text size="note" tone="muted">8s loop. Static with reduced motion.</Text>
              </div>
            </Spec>
          </div>
        </Section>

        {/* ---------------------------------------------------------- patterns */}
        <Section id="patterns" label="04 · Patterns" title="Lines and decals" note="Each pattern means something. Text over a decal always sits on solid Hunter or white.">
          <div className={grid}>
            <Spec name="Wave band · checkout and Get Paid headers">
              <WaveBand>
                <Label className="text-honeydew/80">Pay Corner Kiosk</Label>
                <span className="font-display text-amount text-canvas">$12.40</span>
              </WaveBand>
            </Spec>
            <Spec name="Gradient hero · one per screen">
              <GradientHero>
                <Heading size="h2" level={3}>Welcome to DripMoney</Heading>
                <Text size="note">Gradient on top, text below on solid white.</Text>
              </GradientHero>
            </Spec>
            <Spec name="Ledger grid · hero, lender page">
              <LedgerGrid>
                <Label className="text-honeydew/80">The vault</Label>
                <span className="font-display text-h1 text-canvas">8.4% APY</span>
                <span className="font-body text-note text-honeydew/85">$412,000 lent to 1,204 shops</span>
              </LedgerGrid>
            </Spec>
            <Spec name="Pixel dune · real days of sales">
              <PixelDune days={DUNE} />
              <div className="flex justify-between"><Ledger className="text-charcoal-muted">24 days</Ledger><Ledger className="text-hunter">today $48</Ledger></div>
            </Spec>
            <Spec name="Split bar · every sale">
              <SplitBar />
            </Spec>
            <Spec name="Band strip · divider decal">
              <JarBandStrip />
              <Text size="note" tone="muted">The mirrored brand gradient as a 6px rule. Use once per screen at most.</Text>
            </Spec>
          </div>
        </Section>

        {/* ----------------------------------------------------------- actions */}
        <Section id="actions" label="05 · Actions" title="Buttons" note="Primary is Hunter. Lime buttons only appear on Hunter panels.">
          <div className={grid}>
            <Spec name="Variants">
              <Button>Get paid</Button>
              <Button variant="secondary">Edit limits</Button>
              <Button variant="tonal" iconEnd={<ArrowRightIcon size={18} />}>See how it works</Button>
              <Button variant="ghost">Not now</Button>
              <Button variant="danger">Revoke agent</Button>
            </Spec>
            <Spec name="States">
              <Button loading={busy} onClick={run}>{busy ? "Saving" : "Tap to load"}</Button>
              <Button disabled>Disabled</Button>
              <Button size="sm" width="auto" variant="secondary">Small</Button>
            </Spec>
            <Spec name="On Hunter · lime">
              <div className="flex flex-col gap-3 rounded-lg bg-hunter p-4">
                <Button variant="lime" width="full">Approve with World</Button>
              </div>
            </Spec>
            <Spec name="Icon button · text link">
              <div className="flex items-center gap-2">
                <IconButton label="Copy address"><CopyIcon size={18} /></IconButton>
                <TextLink href="#actions" arrow>View in explorer</TextLink>
              </div>
            </Spec>
          </div>
        </Section>

        {/* ---------------------------------------------------------- surfaces */}
        <Section id="surfaces" label="06 · Surfaces" title="Cards and banners" note="White cards on canvas separate by a hairline. No shadows on cards.">
          <div className={grid}>
            <Card>
              <Label>Surface</Label>
              <KeyValue rows={[["Advance", "$100.00"], ["Fee if repaid in 2 weeks", "$1.00"], ["Max fee (3%)", "$3.00"]]} />
            </Card>
            <Card tone="well">
              <Label>Well</Label>
              <Text size="note">Quiet grouping inside a page, never for primary content.</Text>
            </Card>
            <Card tone="tint">
              <Label className="text-hunter">Tint</Label>
              <Text size="note">Honeydew for good news and explainers.</Text>
            </Card>
            <Card tone="hunter">
              <Label className="text-honeydew/80">Hunter</Label>
              <Text size="note" className="text-honeydew">Brand panels. Lime may appear here.</Text>
            </Card>
            <Spec name="Banners">
              <Banner>Your agent drew $100 for stock.</Banner>
              <Banner tone="caution">Repayment slowed this week. No penalty.</Banner>
              <Banner tone="risk">Couldn&apos;t verify the shop. Nothing was drawn.</Banner>
            </Spec>
          </div>
        </Section>

        {/* ------------------------------------------------------------ status */}
        <Section id="status" label="07 · Status" title="Pills, progress, steps">
          <div className={grid}>
            <Spec name="Pills">
              <div className="flex flex-wrap gap-2">
                <Pill tone="saving" dot>Saving</Pill>
                <Pill tone="locked">Locked</Pill>
                <Pill tone="repaying">Repaying</Pill>
                <Pill tone="slow">Slow</Pill>
                <Pill tone="risk">Written off</Pill>
                <Pill tone="onchain">Onchain</Pill>
              </div>
            </Spec>
            <Spec name="Progress · spinner">
              <ProgressBar value={0.4} label="Repaid" />
              <div className="flex items-center gap-3 text-hunter"><Spinner /> <Text size="note">Verifying…</Text></div>
            </Spec>
            <Spec name="Repayment ring">
              <div className="flex justify-center">
                <Ring value={46 / 115}>
                  <span className="flex flex-col items-center">
                    <span className="font-display text-h1 tabular-nums">$46</span>
                    <Ledger className="text-charcoal-muted">of $115</Ledger>
                  </span>
                </Ring>
              </div>
            </Spec>
            <Spec name="Steps">
              <Steps items={[{ label: "Proof from the seller portal", state: "done" }, { label: "Checking revenue band", state: "current" }, { label: "Issue Business Pass", state: "next" }]} />
            </Spec>
          </div>
        </Section>

        {/* ------------------------------------------------------------- forms */}
        <Section id="forms" label="08 · Forms" title="Controls" note="Inputs and chips use the control border (3.8:1). Selected states fill Hunter.">
          <div className={grid}>
            <Spec name="Segmented">
              <Segmented label="Range" value={seg} onChange={setSeg} options={[{ value: "today", label: "Today" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
            </Spec>
            <Spec name="Chips · max per advance">
              <Chips label="Max per advance" value={chip} onChange={setChip} options={[{ value: "50", label: "$50" }, { value: "100", label: "$100" }, { value: "200", label: "$200" }]} />
            </Spec>
            <Spec name="Pace picker">
              <PacePicker
                label="Sales pace"
                value={pace}
                onChange={setPace}
                options={[{ value: "slow", label: "Slow", hint: "18d" }, { value: "usual", label: "Usual", hint: "12d" }, { value: "busy", label: "Busy", hint: "8d" }]}
              />
            </Spec>
            <Spec name="Switch rows">
              <SettingRow title="Voice announcements" hint="Read each sale aloud">
                <Switch checked={voice} onCheckedChange={setVoice} aria-label="Voice announcements" />
              </SettingRow>
              <Divider />
              <SettingRow title="World view" hint="Show what's public">
                <Switch checked={world} onCheckedChange={setWorld} aria-label="World view" />
              </SettingRow>
            </Spec>
            <Spec name="Text fields">
              <TextField label="Amount" prefix="$" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} hint="Up to $200 at your tier" />
              <TextField label="Shop name" defaultValue="Corner Kiosk 7" error="That name is taken. Try another." />
            </Spec>
          </div>
        </Section>

        {/* ------------------------------------------------------------ domain */}
        <Section id="domain" label="09 · Domain" title="Product pieces">
          <div className={grid}>
            <Spec name="Repaid card">
              <JarCard usd={86.4} local goal={150} />
            </Spec>
            <Spec name="Live sales">
              <ul className="m-0 list-none p-0">
                <SaleRow item="Yerba 1kg" amount={12.4} time="14:02" />
                <SaleRow item="Bread, milk" amount={4.75} time="13:48" />
              </ul>
            </Spec>
            <Spec name="Loss waterfall · viewer holds DRIP">
              <LossWaterfall you="dripcoin" />
            </Spec>
            <Spec name="World view overlay">
              <WorldMark kind="pub" show={world}>
                <Card padding="sm"><Ledger>shop · 0x7a3f…c91e</Ledger></Card>
              </WorldMark>
              <WorldMark kind="priv" show={world}>
                <Card padding="sm"><Text size="note">Business Pass · band 2 · Argentina</Text></Card>
              </WorldMark>
              <Text size="note" tone="muted">Toggle “World view” in Forms.</Text>
            </Spec>
          </div>
        </Section>

        {/* ------------------------------------------------------------ screen */}
        <Section id="screen" label="10 · Screen" title="Home, composed">
          <div className="mx-auto flex w-full max-w-97.5 flex-col overflow-hidden rounded-[36px] border border-hairline bg-canvas">
            <div className="flex items-center justify-between px-4 pt-4">
              <Lockup size={26} />
              <Pill tone="saving" dot>Live</Pill>
            </div>
            <div className="flex flex-col gap-4 p-4">
              <JarCard usd={86.4} local goal={150} />
              <Card>
                <div className="flex items-center justify-between">
                  <Label>Today&apos;s sales</Label>
                  <Ledger className="text-hunter">$48.00</Ledger>
                </div>
                <PixelDune days={DUNE} />
              </Card>
              <Card>
                <Label>Latest</Label>
                <ul className="m-0 list-none p-0">
                  <SaleRow item="Yerba 1kg" amount={12.4} time="14:02" />
                </ul>
              </Card>
              <Button width="full">Get paid</Button>
            </div>
            <BottomNav
              active="home"
              className="static"
              items={[
                { key: "home", label: "Home", icon: <LockIcon size={22} /> },
                { key: "agent", label: "Agent", icon: <BoltIcon size={22} /> },
                { key: "pass", label: "Pass", icon: <ShieldIcon size={22} /> },
                { key: "settings", label: "Settings", icon: <EyeIcon size={22} /> },
              ]}
            />
          </div>
        </Section>

        {/* ------------------------------------------------------------ laws */}
        <Section
          id="laws"
          label="11 · Landing"
          title="Landing design laws"
          note="Rules the marketing page introduces, now written down. Reusable pieces are live in src/final/layout.tsx: Section, Wrap, Eyebrow, SectionHeading, H2, PIXEL_NOTCH, DRAW_LINE, ENTER."
        >
          <div className={grid}>
            <Spec name="Eyebrow · light and dark">
              <Eyebrow>The split</Eyebrow>
              <div className="rounded-md bg-deep p-4">
                <Eyebrow tone="dark">How it works</Eyebrow>
              </div>
            </Spec>
            <Spec name="H2 · 40 phone, 56 md · leading 1.04">
              <span className={cn(H2, "block text-charcoal")}>Every sale pays a little back.</span>
            </Spec>
            <Spec name="Section tones · landing order">
              <div className="flex flex-wrap gap-1.5">
                {TONE_ORDER.map(([cls, name], i) => (
                  <span key={i} className={cn("rounded-md border border-hairline px-2.5 py-1.5 font-ledger text-[12px]", cls, cls === "bg-canvas" || cls === "bg-well" ? "text-charcoal" : "text-canvas")}>
                    {name}
                  </span>
                ))}
              </div>
            </Spec>
            <Spec name="Pixel notch · hero panel">
              <div className="bg-hunter p-0.75" style={PIXEL_NOTCH}>
                <div className="bg-surface p-5 font-body text-note text-charcoal-soft" style={PIXEL_NOTCH}>
                  Stepped corners, 8px cut in 4px steps.
                </div>
              </div>
            </Spec>
            <Spec name="Draw line · hover the link">
              <a href="#how" className={cn("font-body text-note font-semibold text-charcoal", DRAW_LINE)}>
                How it works
              </a>
            </Spec>
            <Spec name="Enter · once on load">
              <span className={cn(ENTER, "font-display text-h2 font-bold text-charcoal")}>Stock up today.</span>
              <Text size="note" tone="muted">Plays on mount only. Supporting lines add a 90ms delay each.</Text>
            </Spec>
            <Spec name="Reveal · scroll, once">
              <Reveal>
                <Text size="note" tone="muted">
                  {"<Reveal delay={90}>"} fades up 16px over 600ms the first time it enters from below. Already on screen at load, or reduced motion: it stays put. Stagger siblings by delay, under 400ms total.
                </Text>
              </Reveal>
            </Spec>
          </div>

          <div className="overflow-hidden rounded-lg border border-hairline">
            <LandingSection tone="well" pad="both" labelledBy="laws-demo-h">
              <Wrap>
                <SectionHeading
                  id="laws-demo-h"
                  eyebrow="The split"
                  title="Every sale pays a little back."
                  lede="Section on well, py-28 md:py-40, inside WRAP. The split layout puts the lede to the right from md."
                />
              </Wrap>
            </LandingSection>
          </div>
          <div className="overflow-hidden rounded-lg">
            <LandingSection tone="deep" pad="none">
              <Wrap className="py-10">
                <SectionHeading
                  tone="dark"
                  layout="stack"
                  eyebrow="For lenders"
                  title="Earn from real shop sales. Pick your risk."
                  lede="Stack layout on deep. Eyebrow dark, heading canvas, body honeydew."
                />
              </Wrap>
            </LandingSection>
          </div>
          <Ledger className="text-charcoal-muted">WRAP: {WRAP}</Ledger>

          <div className={grid}>
            <Spec name="Layout">
              <LawList rows={LAW_LAYOUT} />
            </Spec>
            <Spec name="Type">
              <LawList rows={LAW_TYPE} />
            </Spec>
            <Spec name="Colour and surfaces">
              <LawList rows={LAW_COLOUR} />
            </Spec>
            <Spec name="Three visual languages">
              <LawList rows={LAW_LANGUAGES} />
            </Spec>
            <Spec name="Motion and chrome">
              <LawList rows={LAW_MOTION} />
            </Spec>
            <Spec name="Copy and CTAs">
              <LawList rows={LAW_COPY} />
            </Spec>
          </div>
        </Section>

        {/* ------------------------------------------------------------ landing update */}
        <Section
          id="landing-update"
          label="12 · Landing update"
          title="What changed on the landing page"
          note="Recorded after the first pass of laws. Sources: apps/web/src/app/page.tsx, _landing/floating-nav.tsx, _landing/pixel-scene.tsx."
        >
          <div className={grid}>
            <Spec name="Floating nav · static copy">
              <div className="mx-auto flex h-14 w-full max-w-220 items-center gap-4 rounded-2xl border border-hairline bg-canvas/80 px-4 shadow-lift backdrop-blur-xl">
                <span className="inline-flex shrink-0 items-center gap-2">
                  <JarMark size={28} />
                  <span className="font-display text-[20px] leading-none font-extrabold tracking-[-0.02em] text-charcoal">{APP_NAME}</span>
                </span>
                <span className="hidden flex-1 items-center justify-center gap-6 font-body text-note font-semibold text-charcoal-soft sm:flex">
                  <span>How it works</span>
                  <span>Privacy</span>
                </span>
                <Button size="sm" width="auto" className="ml-auto px-5">
                  Open the app
                </Button>
              </div>
              <Text size="note" tone="muted">Scroll the landing page to see it hide and return.</Text>
            </Spec>

            <Spec name="Hero lockup and fog">
              <div className="relative overflow-hidden rounded-md bg-hunter">
                <div aria-hidden className="grid grid-cols-12">
                  {Array.from({ length: 36 }, (_, i) => (
                    <span key={i} className={cn("aspect-square", ["bg-hunter", "bg-forest", "bg-fern", "bg-leaf", "bg-lime", "bg-deep"][(i * 7 + (i >> 2)) % 6])} />
                  ))}
                </div>
                <div aria-hidden className="absolute inset-0 bg-linear-to-r from-canvas/92 via-canvas/70 to-transparent backdrop-blur-[2px] mask-[linear-gradient(to_right,black_40%,transparent)]" />
                <span className="absolute inset-y-0 left-4 flex flex-col justify-center gap-1.5">
                  <span className="inline-flex items-center gap-2">
                    <JarMark size={36} />
                    <span className="font-display text-[26px] leading-none font-extrabold tracking-[-0.03em] text-charcoal">{APP_NAME}</span>
                  </span>
                  <span className="font-display text-[22px] leading-none font-bold tracking-[-0.035em] text-charcoal">
                    Stock up now. <span className="text-hunter">Repay as you sell.</span>
                  </span>
                </span>
              </div>
              <Text size="note" tone="muted">Scale model. Real sizes: mark 85, wordmark 55/69, headline 60/94.</Text>
            </Spec>

            <Spec name="Sale chips · left and right">
              <div className="flex flex-col gap-2.5">
                {(
                  [
                    ["$", "bg-hunter text-canvas", "Sale", "Phone charger", "$10.00", "border-hairline"],
                    ["%", "bg-lime text-deep", "Drip", "8% repays your advance", "+$0.80", "border-hunter/50"],
                    ["AI", "bg-deep text-lime", "Agent", "Agent drew for stock", "$100", "border-hairline"],
                  ] as const
                ).map(([glyph, tile, kind, text, amount, border], i) => (
                  <div
                    key={kind}
                    className={cn(
                      "flex w-60 max-w-full items-center gap-3 rounded-lg border bg-surface py-2 pr-3.5 pl-2 shadow-lift",
                      border,
                      i === 1 && "self-end",
                    )}
                  >
                    <span className={cn("grid size-9 shrink-0 place-items-center rounded-[6px] font-ledger text-[14px] font-bold", tile)}>{glyph}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="font-ledger text-[11px] leading-none text-charcoal-muted uppercase">{kind}</span>
                      <span className="truncate font-body text-[13px] font-semibold text-charcoal">{text}</span>
                    </span>
                    <span className="font-display text-[16px] leading-none font-bold text-hunter tabular-nums">{amount}</span>
                  </div>
                ))}
              </div>
            </Spec>

            <Spec name="Cloud and day band">
              <div className="relative h-20 overflow-hidden rounded-md bg-well" aria-hidden>
                <span className="absolute top-6 left-8 h-3.5 w-20 bg-honeydew-line" />
                <span className="absolute top-4 left-11 h-2.5 w-10 bg-honeydew-line" />
                <span className="absolute top-2.5 left-15 h-3.5 w-6 bg-honeydew-line" />
                {[0, 1, 2, 3].map((d) => (
                  <span key={d} className="absolute w-0.5 bg-lime" style={{ left: `${44 + d * 16}px`, top: `${46 + (d % 2) * 8}px`, height: 6 }} />
                ))}
              </div>
              <div className="rounded-md bg-hunter p-4">
                <Eyebrow tone="dark">The app</Eyebrow>
                <span className="mt-2 block font-display text-h2 font-bold text-canvas">A day at Corner Kiosk.</span>
              </div>
            </Spec>
          </div>

          <div className={grid}>
            <Spec name="Hero">
              <LawList rows={UPD_HERO} />
            </Spec>
            <Spec name="Hero scene">
              <LawList rows={UPD_SCENE} />
            </Spec>
            <Spec name="Page">
              <LawList rows={UPD_PAGE} />
            </Spec>
            <Spec name="Naming">
              <LawList rows={UPD_NAME} />
            </Spec>
          </div>
        </Section>
      </main>
    </>
  );
}
