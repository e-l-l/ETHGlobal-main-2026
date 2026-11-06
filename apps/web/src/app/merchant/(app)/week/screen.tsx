"use client";

import type { WeekView } from "@repo/sdk";
import { Card, Columns, Label, Page, PageHead, Stack, Text } from "@/final";
import { etaKnown } from "@/lib/estimate";
import { formatDays, formatMoney, formatPercent } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { CardTitle, CheckList } from "../../_ui";

/** Payments per day, stacked: the shop's share (quiet) under the advance's share (Hunter). */
function SplitBars({ days, labels, ariaLabel }: { days: { you: number; repay: number }[]; labels: string[]; ariaLabel: string }) {
  const max = Math.max(1, ...days.map((d) => d.you + d.repay));
  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={ariaLabel} className="grid h-48 grid-flow-col auto-cols-fr items-end gap-2 md:h-56 md:gap-3">
        {days.map((d, i) => (
          <div key={i} className="flex h-full flex-col justify-end gap-0.5">
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
    <Page tabs>
      <PageHead back={routes.advance.details} backLabel="Your advance" label="This week" title="A slow week. That's fine.">
        When payments fall, paying back slows down with them. Nothing else changes.
      </PageHead>

      <Columns ratio="3:2">
        <Stack gap="lg">
          <Card padding="lg">
            <CardTitle
              end={
                <span className="flex gap-3.5 font-body text-note text-charcoal-soft">
                  <span className="inline-flex items-center gap-1.5">
                    <i aria-hidden className="size-2.5 rounded-[2px] bg-unlit" />
                    To you
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <i aria-hidden className="size-2.5 rounded-[2px] bg-hunter" />
                    To advance
                  </span>
                </span>
              }
            >
              Payments per day
            </CardTitle>
            <SplitBars days={week.days} labels={[...week.dayLabels]} ariaLabel={week.ariaLabel} />
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <Label>Paid back this week</Label>
              <span className="font-display text-h1 text-charcoal tabular-nums">{formatMoney(paidBack)}</span>
            </Card>
            <Card>
              <Label>Late fees</Label>
              <span className="font-display text-h1 text-fern tabular-nums">$0</span>
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

        <Card padding="lg">
          <CardTitle>What a slow week means</CardTitle>
          <CheckList
            items={[
              { text: `You pay back ${formatPercent(advance.holdback)} of what you take in. Take in less, pay less.` },
              { text: `No penalty and no late fee. The fee keeps adding 0.5% a week but stops at ${formatPercent(advance.maxFeeBps / 100)} (${formatMoney((advance.drawn * advance.maxFeeBps) / 10_000)}).` },
              { text: "Every 7 days, pay back at least 1% of the advance plus the fee so far. Short of that for 14 days, the advance is marked late. We'll warn you well before that.", caution: true },
            ]}
          />
        </Card>
      </Columns>
    </Page>
  );
}
