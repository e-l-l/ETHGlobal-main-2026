import { KeyValueList, LineChart, StatCard, StatGrid } from "@/components/data";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Button, Card, CardHeader, Eyebrow, Heading, Label, Mono } from "@/components/ui";
import { formatDays, formatMoney, formatPercent } from "@/lib/format";
import { routes } from "@/lib/routes";
import { advance } from "@/lib/mock/shop";
import { daysLeftEstimates, repaymentCurve } from "@/lib/mock/merchant";

export default function AdvanceDetailsPage() {
  return (
    <>
      <PageHeader
        eyebrow={
          <Eyebrow>
            Advance · {advance.purpose} · drawn {advance.drawnOn}
          </Eyebrow>
        }
        title={
          <Heading level={1} size="lg">
            {formatMoney(advance.left)} left to <Accent>repay</Accent>.
          </Heading>
        }
      />

      <StatGrid>
        <StatCard label="Advance" value={formatMoney(advance.drawn)} />
        <StatCard label={advance.feeLabel} value={formatMoney(advance.fee)} sub="fixed, never grows" />
        <StatCard label="Total to repay" value={formatMoney(advance.total)} />
        <StatCard label="Repaid so far" value={formatMoney(advance.repaid)} sub={formatPercent(advance.pct)} />
      </StatGrid>

      <TwoColumn
        main={
          <Card>
            <CardHeader aside={<Mono>{formatPercent(advance.holdback)} of each sale</Mono>}>
              <Label>Repaid over time</Label>
            </CardHeader>
            <LineChart tone="accent-text" area={false} points={[...repaymentCurve.points]} ariaLabel={repaymentCurve.ariaLabel} />
          </Card>
        }
        side={
          <>
            <Card>
              <Label>Estimated days left</Label>
              <KeyValueList
                items={daysLeftEstimates.map((e) => ({ k: e.label, v: formatDays(e.days) }))}
              />
              <Mono>the fee never grows, however long it takes</Mono>
            </Card>
            <div>
              <Button href={routes.advance.arrived} variant="outline">
                Why my agent drew this
              </Button>
            </div>
          </>
        }
      />
    </>
  );
}
