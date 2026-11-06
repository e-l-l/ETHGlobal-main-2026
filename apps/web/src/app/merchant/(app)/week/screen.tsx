"use client";

import type { WeekView } from "@repo/sdk";
import { Card, Columns, Label, Page, Stack, Text } from "@/final";
import { etaKnown } from "@/lib/estimate";
import { formatDays, formatMoney, formatPercent } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { BlockRule, CardTitle, CheckList, ScreenHead } from "../../_ui";

/** Payments per day, stacked: the shop's share (quiet) under the advance's share (Hunter). */
function SplitBars({ days, labels, ariaLabel }: { days: { you: number; repay: number }[]; labels: string[]; ariaLabel: string }) {
  const max = Math.max(1, ...days.map((d) => d.you + d.repay));
  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={ariaLabel} className="grid h-48 grid-flow-col auto-cols-fr items-end gap-2 md:h-56 md:gap-3 lg:h-44">
        {days.map((d, i) => (
          <div
            key={i}
            className="flex h-full origin-bottom flex-col justify-end gap-0.5 motion-safe:animate-[rise_600ms_var(--ease-snappy)_both]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className="block min-h-px rounded-t-[4px] bg-unlit" style={{ height: `${(d.you / max) * 100}%` }} />
            <span className="block min-h-px bg-hunter" style={{ height: `${(d.repay / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div aria-hidden className="grid grid-flow-col auto-cols-fr gap-2 text-center font-ledger text-ledger text-charcoal-muted md:gap-3">
        {labels.map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
    </div>
  );
}

/* M13 This week: `merchant.week()`. Calm state: no red anywhere on this screen. */
export function WeekScreen({ initial }: { initial: WeekView | null }) {
  const { data, error } = useMRA(q.week, { initial });
  if (!data) return <MRAState error={error} />;
  const { advance, week } = data;
  const paidBack = week.days.reduce((t, d) => t + d.repay, 0);

  return (
    <Page tabs dense>
      <ScreenHead back={routes.advance.details} backLabel="Your advance" label="This week" title="A slow week. That's fine.">
        {advance.isBehind
          ? "Payments fell below the weekly minimum, so the fee is 1% a week until sales catch up."
          : "Payments fell this week, so paying back slowed down with them. You still met the weekly minimum, so your fee stays at 0.5% a week."}
      </ScreenHead>

      <Columns ratio="3:2">
        <Stack gap="lg" className="lg:gap-4">
          <Card padding="lg" className="lg:p-4">
            <CardTitle
              end={
                <span className="flex gap-3.5 font-body text-note text-charcoal-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <i aria-hidden className="size-2.5 rounded-xs bg-unlit" />
                    To you
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i aria-hidden className="size-2.5 rounded-xs bg-hunter" />
                    To advance
                  </span>
                </span>
              }
            >
              Payments per day
            </CardTitle>
            <SplitBars days={week.days} labels={[...week.dayLabels]} ariaLabel={week.ariaLabel} />
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:gap-3">
            <Card>
              <Label>Paid back this week</Label>
              <span className="font-display text-h1 text-charcoal tabular-nums">{formatMoney(paidBack)}</span>
            </Card>
            <Card>
              <Label>Late fee</Label>
              {advance.lateFee === 0 ? (
                <>
                  <span className="font-display text-h1 tabular-nums text-fern">$0</span>
                  <Text size="note" tone="muted">On time: no late fee.</Text>
                </>
              ) : (
                <>
                  <span className="font-display text-h1 tabular-nums text-caution">{formatMoney(advance.lateFee)}</span>
                  <Text size="note" tone="muted">Late fee {formatMoney(advance.lateFee)}{advance.lateFeeHint ? `. ${advance.lateFeeHint}` : ", paid to the safety reserve."}</Text>
                </>
              )}
            </Card>
            <Card>
              <Label>New estimate</Label>
              <span className="font-display text-h1 text-charcoal tabular-nums">
                {etaKnown(week.newEstimateDays) ? formatDays(week.newEstimateDays) : "Soon"}
              </span>
              {!etaKnown(week.newEstimateDays) ? (
                <Text size="note" tone="muted">
                  After a few more payments
                </Text>
              ) : null}
            </Card>
          </div>
        </Stack>

        <Stack gap="lg" className="lg:gap-4">
        <BlockRule seed={9} className="rounded-md" />
        <Card padding="lg" className="lg:p-4">
          <CardTitle>What a slow week means</CardTitle>
          <CheckList
            items={[
              { text: `You pay back ${formatPercent(advance.holdback)} of what you take in. Take in less, pay less.` },
              { text: `On time, no late fee. The fee keeps adding 0.5% a week but stops at ${formatPercent(advance.maxFeeBps / 100)} (${formatMoney((advance.drawn * advance.maxFeeBps) / 10_000)}).` },
              { text: `The weekly minimum is 1% of the advance plus the fee. ${advance.feeRule}`, caution: true },
            ]}
          />
        </Card>
        </Stack>
      </Columns>
    </Page>
  );
}
