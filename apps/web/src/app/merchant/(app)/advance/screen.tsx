"use client";

import type { AdvanceDetailsView } from "@repo/sdk";
import { Button, Card, Columns, KeyValue, Label, Ledger, LineChart, OfferDisclosure, Page, PageHead, Stack, Text } from "@/final";
import { cn } from "@/lib/cn";
import { ETA_PENDING, etaKnown } from "@/lib/estimate";
import { formatMoney, formatPercent } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { BigFigure, CardTitle, DarkMeter, HeroBlock, HeroLabel, PlainWords } from "../../_ui";

/** "Day 0 · Day n/2 · Day n" for a curve with one point per day. */
function dayLabels(points: number[]) {
  const last = Math.max(0, points.length - 1);
  return last < 2 ? ["Day 0", `Day ${last}`] : ["Day 0", `Day ${Math.round(last / 2)}`, `Day ${last}`];
}

/** The SDK's estimate labels, in the merchant's words. */
const PACE_LABEL: Record<string, string> = { "Slow week": "Slow", Normal: "Your usual", "Busy week": "Busy" };

/** M12 Advance details: `merchant.advance()`. */
export function AdvanceDetailsScreen({ initial }: { initial: AdvanceDetailsView | null }) {
  const { data, error } = useMRA(q.advance, { initial });
  if (!data) return <MRAState error={error} />;
  const { advance, repaymentCurve, daysLeftEstimates } = data;
  const estimates = daysLeftEstimates.filter((e) => etaKnown(e.days));

  return (
    <Page tabs>
      <PageHead
        back={routes.merchant}
        backLabel="Home"
        label={`For ${advance.purpose} · drawn ${advance.drawnOn}`}
        title="Your advance"
      />

      <OfferDisclosure principal={advance.drawn} fee={advance.fee} total={advance.total} holdback={advance.holdback} estimates={daysLeftEstimates.map((e) => ({ ...e, label: `${e.label} (estimated total duration)`, days: e.days > 0 ? e.days + Math.max(0, repaymentCurve.points.length - 1) : 0 }))} />
      <Columns ratio="3:2">
        <Stack gap="lg">
          <HeroBlock>
            <HeroLabel>Left to pay back</HeroLabel>
            <div className="flex flex-col gap-1.5">
              <BigFigure>{formatMoney(advance.left)}</BigFigure>
              <Ledger className="text-honeydew">of {formatMoney(advance.total)}</Ledger>
            </div>
            <div className="flex flex-col gap-2">
              <DarkMeter value={advance.pct / 100} label="Advance paid back" />
              <div className="flex flex-col gap-0.5 font-body text-note text-honeydew sm:flex-row sm:gap-4">
                <span>
                  {formatMoney(advance.repaid)} paid back · {formatPercent(advance.pct)}
                </span>
                <span>{formatPercent(advance.holdback)} of each payment</span>
              </div>
            </div>
          </HeroBlock>

          <Card padding="lg">
            <div className="flex flex-col gap-1">
              <CardTitle>When it&rsquo;s paid off</CardTitle>
              <Text size="note" tone="muted">
                Depends on how much you sell. A slower week just takes longer.
              </Text>
            </div>
            {estimates.length > 0 ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {estimates.map((e) => {
                  const usual = e.label === "Normal";
                  return (
                    <div
                      key={e.label}
                      className={cn("flex flex-col gap-1.5 rounded-md p-3.5", usual ? "border border-hunter bg-honeydew text-hunter" : "bg-well text-charcoal")}
                    >
                      <Label className={usual ? "text-hunter" : undefined}>{PACE_LABEL[e.label] ?? e.label}</Label>
                      <span className="font-display text-h1 tabular-nums">
                        {e.days} {e.days === 1 ? "day" : "days"}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Text size="note">{ETA_PENDING}.</Text>
            )}
          </Card>

          <Card padding="lg">
            <CardTitle end={<Label>{formatPercent(advance.holdback)} of each payment</Label>}>Paid back so far</CardTitle>
            <LineChart
              points={[...repaymentCurve.points]}
              label={repaymentCurve.ariaLabel}
              format={(v) => formatMoney(v)}
              xLabels={isMock ? ["Day 0", "Day 5", "Day 9"] : dayLabels(repaymentCurve.points)}
            />
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button href={routes.advance.arrived} variant="secondary" className="sm:flex-1">
              Why your agent drew this
            </Button>
            <Button href={routes.week} variant="secondary" className="sm:flex-1">
              What if I have a slow week?
            </Button>
          </div>
        </Stack>

        <Stack gap="lg">
          <Card padding="lg">
            <CardTitle>The terms</CardTitle>
            <KeyValue
              rows={[
                ["Advance", formatMoney(advance.drawn)],
                [advance.feeLabel, formatMoney(advance.fee)],
                ["Total to pay back", formatMoney(advance.total)],
                ["Paid from", `${formatPercent(advance.holdback)} of each payment`],
                ["Drawn on", advance.drawnOn],
              ]}
            />
          </Card>
          <PlainWords>
            No interest and no late fees. The fee never grows, however long it takes. If you have no payments at all for 30
            days, the advance closes as unpaid and won&rsquo;t count toward a higher limit.
          </PlainWords>
        </Stack>
      </Columns>
    </Page>
  );
}
