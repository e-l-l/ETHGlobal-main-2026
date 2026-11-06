"use client";

import { useState, type ReactNode } from "react";
import { BoltIcon, EyeIcon, LockIcon, ShieldIcon } from "@/final/icons";
import { ArrowRightIcon, CopyIcon } from "@/final/icons";
import { cn } from "@/lib/cn";
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
  ["bg-hunter text-lime", "Lime on Hunter", "6.3", "Jar figure"],
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
  const [chip, setChip] = useState<"50" | "100" | "250">("100");
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
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2">
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

      <main className="mx-auto flex max-w-[1120px] flex-col gap-12 px-4 pt-10 pb-24">
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
              <Heading size="hero">Your jar is growing.</Heading>
            </Spec>
            <Spec name="Amount · Urbanist 700 · 40">
              <Money usd={86.4} rate={1010} />
            </Spec>
            <Spec name="H1 · 28 / 24 phone · H2 · 20">
              <Heading size="h1">Your agent drew $100</Heading>
              <Heading size="h2" level={3}>About 12 days at your usual pace</Heading>
            </Spec>
            <Spec name="Body · Figtree 16 · Note 14">
              <Text>Every sale puts 10% in your dollar jar. Nobody can tell who owes.</Text>
              <Text size="note" tone="muted">No penalty, no extra fee.</Text>
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
                <JarMark size={64} label="DripMoni" />
                <JarMark size={40} />
                <JarMark size={24} />
                <JarMark size={20} />
              </div>
            </Spec>
            <Spec name="Token badge · app icons">
              <div className="flex items-center gap-4">
                <TokenBadge size={44} label="DRIP" />
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
                <Heading size="h2" level={3}>Welcome to your jar</Heading>
                <Text size="note">Gradient on top, text below on solid white.</Text>
              </GradientHero>
            </Spec>
            <Spec name="Ledger grid · hero, lender page">
              <LedgerGrid>
                <Label className="text-honeydew/80">Senior vault</Label>
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
            <Spec name="Jar band strip · divider decal">
              <JarBandStrip />
              <Text size="note" tone="muted">The mirrored jar gradient as a 6px rule. Use once per screen at most.</Text>
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
              <KeyValue rows={[["Advance", "$100.00"], ["Flat fee", "$15.00"], ["Total to repay", "$115.00"]]} />
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
                <Pill tone="locked">Jar locked</Pill>
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
              <Chips label="Max per advance" value={chip} onChange={setChip} options={[{ value: "50", label: "$50" }, { value: "100", label: "$100" }, { value: "250", label: "$250" }]} />
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
              <TextField label="Amount" prefix="$" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} hint="Up to $250 at your tier" />
              <TextField label="Shop name" defaultValue="Corner Kiosk 7" error="That name is taken. Try another." />
            </Spec>
          </div>
        </Section>

        {/* ------------------------------------------------------------ domain */}
        <Section id="domain" label="09 · Domain" title="Product pieces">
          <div className={grid}>
            <Spec name="Jar card">
              <JarCard usd={86.4} rate={1010} goal={150} />
            </Spec>
            <Spec name="Live sales">
              <ul className="m-0 list-none p-0">
                <SaleRow item="Yerba 1kg" amount={12.4} time="14:02" />
                <SaleRow item="Bread, milk" amount={4.75} time="13:48" />
              </ul>
            </Spec>
            <Spec name="Loss waterfall · viewer is junior">
              <LossWaterfall you="junior" />
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
          <div className="mx-auto flex w-full max-w-[390px] flex-col overflow-hidden rounded-[36px] border border-hairline bg-canvas">
            <div className="flex items-center justify-between px-4 pt-4">
              <Lockup size={26} />
              <Pill tone="saving" dot>Live</Pill>
            </div>
            <div className="flex flex-col gap-4 p-4">
              <JarCard usd={86.4} rate={1010} goal={150} />
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
      </main>
    </>
  );
}
