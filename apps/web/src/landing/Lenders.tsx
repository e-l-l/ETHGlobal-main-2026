import { Button, Card, Label, Text, WaveBand } from "@/final";
import { CheckGlyph } from "./glyphs";
import { Eyebrow, RING_ON_HUNTER, Section, SectionTitle } from "./primitives";

function Ticks({
  items,
  tick,
  className,
}: {
  items: string[];
  tick: string;
  className: string;
}) {
  return (
    <ul
      className={`m-0 flex list-none flex-col gap-2.5 p-0 text-read leading-normal ${className}`}
    >
      {items.map((t) => (
        <li key={t} className="flex gap-2.5">
          <CheckGlyph size={20} className={`mt-0.5 flex-none ${tick}`} />
          {t}
        </li>
      ))}
    </ul>
  );
}

const CARD_TITLE = "m-0 font-display text-h1 font-bold";

export function Lenders() {
  return (
    <Section id="lenders" className="flex flex-col gap-8">
      <div className="flex max-w-170 flex-col gap-3">
        <Eyebrow>For lenders</Eyebrow>
        <SectionTitle>Earn from real shop sales. Pick your risk.</SectionTitle>
        <Text className="m-0">
          Every advance is repaid from daily sales at real counters. The fees
          flow to lenders in two layers: steady and protected, or first-loss for
          a bigger share.
        </Text>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-4">
        <Card className="p-7">
          <Label className="self-start rounded-chip bg-well px-2 py-1 text-charcoal-soft">
            Senior vault
          </Label>
          <h3 className={CARD_TITLE}>Steady yield, protected first.</h3>
          <Ticks
            className="text-charcoal-soft"
            tick="text-fern"
            items={[
              "Deposit USDC, earn a share of every fee",
              "Losses hit the Junior token before you",
              "Withdraw what isn’t lent out, anytime",
            ]}
          />
          <Button href="/earn" width="auto" className="mt-auto self-start px-6 py-0">
            Deposit USDC
          </Button>
        </Card>

        {/* Wave frame 16px, text on an inset solid Hunter panel. */}
        <WaveBand
          className="flex flex-col"
          bodyClassName="m-4 flex-1 gap-4 rounded-md bg-hunter p-6"
        >
          <Label className="self-start rounded-chip bg-lime px-2 py-1 text-charcoal">
            Junior token
          </Label>
          <h3 className={`${CARD_TITLE} text-canvas`}>
            First loss, bigger share.
          </h3>
          <Ticks
            className="text-honeydew"
            tick="text-lime"
            items={[
              "A larger cut of the fees",
              "Absorbs losses first, protecting the vault",
              "Trades on a Uniswap v4 pool with a risk hook",
            ]}
          />
          <Button
            href="/junior"
            variant="lime"
            width="auto"
            className={`mt-auto self-start px-6 py-0 ${RING_ON_HUNTER}`}
          >
            Buy Junior on Uniswap
          </Button>
        </WaveBand>
      </div>
    </Section>
  );
}
