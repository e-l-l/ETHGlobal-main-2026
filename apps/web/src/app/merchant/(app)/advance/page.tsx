import { Button, Card, Columns, KeyValue, Label, LineChart, Page, PageHead, Stack, StatGrid, Text } from "@/final";
import { formatDays, formatMoney, formatPercent } from "@/lib/format";
import { daysLeftEstimates, repaymentCurve } from "@/lib/mock/merchant";
import { advance } from "@/lib/mock/shop";
import { routes } from "@/lib/routes";

export default function AdvanceDetailsPage() {
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
            xLabels={["Day 0", "Day 5", "Day 9"]}
          />
        </Card>
        <Stack>
          <Card>
            <Label>Estimated days left</Label>
            <KeyValue rows={daysLeftEstimates.map((e) => [e.label, formatDays(e.days)])} />
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
