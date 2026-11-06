import type { ReactNode } from "react";
import { Card, JarMark, Label, Text } from "@/final";
import { QrGlyph, ShieldCheckGlyph, SlidersGlyph, TrendGlyph } from "./glyphs";
import { Eyebrow, Section, SectionTitle } from "./primitives";

type Step = { n: string; icon: ReactNode; title: string; body: string; foot: ReactNode };

const ICON = { size: 28, stroke: 1.8, className: "text-sage" };

function Tag({ children }: { children: ReactNode }) {
  return <Label className="mt-auto self-start rounded-chip bg-honeydew px-2 py-1 text-hunter">{children}</Label>;
}

/* The logo is the tier meter: two bands lit = tier 1, $100. */
const LADDER = [
  { cap: "$500", tone: "text-charcoal-muted" },
  { cap: "$250", tone: "text-charcoal-muted" },
  { cap: "$100 · now", tone: "font-semibold text-charcoal" },
  { cap: "$50", tone: "text-charcoal" },
];

function Ladder() {
  return (
    <div className="mt-auto flex items-center gap-4">
      <JarMark lit={2} on="meter" size={56} label="Tier 1, limit $100" />
      <ol aria-label="Limits ladder" className="m-0 flex list-none flex-col gap-0.5 p-0 font-ledger text-ledger leading-[1.3]">
        {LADDER.map((l) => (
          <li key={l.cap} className={l.tone}>
            {l.cap}
          </li>
        ))}
      </ol>
    </div>
  );
}

const STEPS: Step[] = [
  {
    n: "01",
    icon: <ShieldCheckGlyph {...ICON} />,
    title: "Prove your shop, privately",
    body: "Log into the seller dashboard you already use. We check your months of sales and keep nothing else.",
    foot: <Tag>We learned nothing else</Tag>,
  },
  {
    n: "02",
    icon: <SlidersGlyph {...ICON} />,
    title: "Set your agent’s limits",
    body: "Choose the most per advance, the most per month and what it’s for. Approve once with World. Nothing is drawn until you do.",
    foot: <Tag>Pause or revoke anytime</Tag>,
  },
  {
    n: "03",
    icon: <QrGlyph {...ICON} />,
    title: "Sell like you always do",
    body: "Customers scan your QR and pay in the dollars they hold. A tenth of every sale drips back on its own.",
    foot: <Tag>Any token in, dollars out</Tag>,
  },
  {
    n: "04",
    icon: <TrendGlyph {...ICON} />,
    title: "Pay back, unlock more",
    body: "Every advance you repay raises your next limit, from $50 up to $500. Your Standing Pass proves it without showing your history.",
    foot: <Ladder />,
  },
];

export function HowItWorks() {
  return (
    <Section id="how" className="flex flex-col gap-8">
      <div className="flex max-w-160 flex-col gap-3">
        <Eyebrow>How it works</Eyebrow>
        <SectionTitle>From your first sale to a bigger limit.</SectionTitle>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4">
        {STEPS.map((s) => (
          <Card as="article" key={s.n} gap="sm" className="p-6">
            <div className="flex items-center justify-between">
              {s.icon}
              <span className="font-ledger text-ledger leading-normal text-charcoal-muted">{s.n}</span>
            </div>
            <h3 className="m-0 font-display text-h2 font-bold">{s.title}</h3>
            <Text size="note" className="m-0">
              {s.body}
            </Text>
            {s.foot}
          </Card>
        ))}
      </div>
    </Section>
  );
}
