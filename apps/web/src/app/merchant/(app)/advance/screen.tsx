"use client";

import type { AdvanceDetailsView } from "@repo/sdk";
import { Button, Card, Columns, KeyValue, Label, LineChart, OfferDisclosure, Page, PageHead, Stack, StatGrid, Text } from "@/final";
import { ETA_PENDING, etaKnown } from "@/lib/estimate";
import { formatDays, formatMoney, formatPercent } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";

/** "Day 0 · Day n/2 · Day n" for a curve with one point per day. */
function dayLabels(points: number[]) {
  const last = Math.max(0, points.length - 1);
  return last < 2 ? ["Day 0", `Day ${last}`] : ["Day 0", `Day ${Math.round(last / 2)}`, `Day ${last}`];
}

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
        label={`Advance · ${advance.purpose} · drawn ${advance.drawnOn}`}
        title={`${formatMoney(advance.left)} left to repay.`}
      />

      <StatGrid
        items={[
          { label: "Advance", value: formatMoney(advance.drawn) },
          { label: advance.feeLabel, value: formatMoney(advance.fee), sub: "fixed, never grows" },
          { label: "Total to repay", value: formatMoney(advance.total) },
          { label: "Repaid so far", value: formatMoney(advance.repaid), sub: formatPercent(advance.pct) },
        ]}
      />

      <OfferDisclosure principal={advance.drawn} fee={advance.fee} total={advance.total} holdback={advance.holdback} estimates={daysLeftEstimates.map((e) => ({ ...e, label: `${e.label} (estimated total duration)`, days: e.days > 0 ? e.days + Math.max(0, repaymentCurve.points.length - 1) : 0 }))} />
      <Columns ratio="3:2">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <Label>Repaid over time</Label>
            <Label>{formatPercent(advance.holdback)} of each sale</Label>
          </div>
          <LineChart
            points={[...repaymentCurve.points]}
            label={repaymentCurve.ariaLabel}
            format={(v) => formatMoney(v)}
            xLabels={isMock ? ["Day 0", "Day 5", "Day 9"] : dayLabels(repaymentCurve.points)}
          />
        </Card>
        <Stack>
          <Card>
            <Label>Estimated days left</Label>
            {estimates.length > 0 ? (
              <KeyValue rows={estimates.map((e) => [e.label, formatDays(e.days)])} />
            ) : (
              <Text size="note">{ETA_PENDING}.</Text>
            )}
            <Text size="note" tone="muted">
              The fee never grows, however long it takes.
            </Text>
          </Card>
          <Button href={routes.advance.arrived} variant="secondary">
            Why my agent drew this
          </Button>
        </Stack>
      </Columns>
    </Page>
  );
}
