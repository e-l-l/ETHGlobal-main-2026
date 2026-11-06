import type { ReactNode } from "react";
import { Card, Text } from "@/final";
import { cn } from "@/lib/cn";
import { Eyebrow, Section, SectionTitle } from "./primitives";

function DayCard({
  title,
  sales,
  barClassName,
  children,
}: {
  title: string;
  sales: string;
  barClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card gap="sm" className="p-5">
      <div className="flex justify-between gap-3">
        <span className="font-display text-[20px] leading-[normal] font-bold">
          {title}
        </span>
        <span className="font-ledger text-ledger leading-[normal] text-charcoal-muted">
          {sales}
        </span>
      </div>
      <div className={cn("flex h-3 gap-0.75", barClassName)} aria-hidden>
        <div className="flex-9 rounded-chip bg-unlit" />
        <div className="min-w-1 flex-1 rounded-chip bg-hunter" />
      </div>
      <span className="text-note leading-[normal] text-charcoal-soft">
        {children}
      </span>
    </Card>
  );
}

export function BadWeek() {
  return (
    <Section className="flex flex-wrap items-center gap-12">
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
        <Eyebrow>Built for real weeks</Eyebrow>
        <SectionTitle>A slow week costs you nothing extra.</SectionTitle>
        <Text className="m-0">
          The fee is flat and you see it before you start. When sales slow down,
          paying back slows with them. No penalty, no late fee, nobody calling.
        </Text>
      </div>
      <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
        <DayCard title="Busy day" sales="$200 in sales">
          <strong className="text-hunter">$20</strong> drips back
        </DayCard>
        {/* Bar width is the day's sales relative to the busy day. */}
        <DayCard
          title="Slow day"
          sales="$30 in sales"
          barClassName="w-[15%] min-w-12"
        >
          <strong className="text-hunter">$3</strong> drips back. Same fee, a
          little more time.
        </DayCard>
      </div>
    </Section>
  );
}
