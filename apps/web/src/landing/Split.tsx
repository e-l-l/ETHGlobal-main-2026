import { Card, Text } from "@/final";
import { cn } from "@/lib/cn";
import { Eyebrow, Section, SectionTitle } from "./primitives";

/* Nine unlit tenths and one Hunter tenth, 3px apart. Outer corners 8px, inner 4px. */
function NineToOne() {
  return (
    <div className="flex h-18 gap-0.75" aria-hidden>
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-chip",
            i === 9 ? "rounded-r-md bg-hunter" : "bg-unlit",
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
            Customers pay you like always. Nine parts land with you, one part
            drips back until the advance is paid off. Your customers never see
            the advance.
          </Text>
        </div>
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
          <NineToOne />
          <div className="flex justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="font-display text-[32px] leading-[normal] font-bold tracking-[-0.025em]">
                90%
              </span>
              <span className="text-note leading-[normal] text-charcoal-soft">
                yours, to spend or save
              </span>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="font-display text-[32px] leading-[normal] font-bold tracking-[-0.025em] text-hunter">
                10%
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
