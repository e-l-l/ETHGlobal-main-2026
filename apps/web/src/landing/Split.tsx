import { Card, Text } from "@/final";
import { cn } from "@/lib/cn";
import { Eyebrow, Section, SectionTitle } from "./primitives";

/* 25 cells of 4% each: 23 unlit, the last 2 Hunter (the 8% holdback), 3px apart. Outer corners 8px, inner 4px. */
const CELLS = 25;
const HELD = 2;
function NineToOne() {
  return (
    <div className="flex h-18 gap-0.75" aria-hidden>
      {Array.from({ length: CELLS }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-chip",
            i >= CELLS - HELD ? "bg-hunter" : "bg-unlit",
            i === CELLS - 1 && "rounded-r-md",
            i === 0 && "rounded-l-md",
          )}
        />
      ))}
    </div>
  );
}

export function Split() {
  return (
    <Section>
      <Card className="flex-row flex-wrap items-center gap-12 rounded-xl p-[clamp(24px,4vw,56px)]">
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
          <Eyebrow>The split</Eyebrow>
          <SectionTitle>Every sale pays a little back.</SectionTitle>
          <Text className="m-0">
            Customers pay you like always. 92% lands with you, 8% drips
            back until the advance is paid off. Your customers never see
            the advance.
          </Text>
        </div>
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
          <NineToOne />
          <div className="flex justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-display text-[32px] leading-[normal] font-bold tracking-[-0.025em]">
                92%
              </span>
              <span className="text-note leading-[normal] text-charcoal-soft">
                yours, to spend or save
              </span>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="font-display text-[32px] leading-[normal] font-bold tracking-[-0.025em] text-hunter">
                8%
              </span>
              <span className="text-note leading-[normal] text-charcoal-soft">
                drips back to the advance
              </span>
            </div>
          </div>
        </div>
      </Card>
    </Section>
  );
}
