import { BarChart, Card, Columns, KeyValue, Label, Page, PageHead, Pill, Text } from "@/final";
import { formatDays, formatMoney } from "@/lib/format";
import { week } from "@/lib/mock/merchant";
import { advance } from "@/lib/mock/shop";
import { routes } from "@/lib/routes";

const totals = week.days.map((d) => d.you + d.repay);
const labels = [...week.dayLabels];

/* Calm state: no red anywhere on this screen. */
export default function WeekPage() {
  return (
    <Page tabs>
      <PageHead
        back={routes.merchant}
        backLabel="Home"
        label="This week"
        title="You sold less, so you repaid less."
        actions={<Pill tone="saving">quiet week · no penalty</Pill>}
      />

      <Columns ratio="3:2">
        <Card>
          <Label>Daily sales (USD) · latest day highlighted</Label>
          <BarChart
            values={totals}
            labels={labels}
            label={week.ariaLabel}
            highlight={[totals.length - 1]}
            format={(v) => formatMoney(v)}
          />
        </Card>
        <Card>
          <KeyValue
            rows={[
              ["Your fee", `${formatMoney(advance.fee)} · unchanged`],
              ["Extra charges", "None"],
              ["New estimate", formatDays(week.newEstimateDays)],
            ]}
          />
          <Text>
            That&rsquo;s fine. Repayment follows your sales. If you make no sales for 30 days in a row, the advance closes, and
            we&rsquo;ll warn you well before that.
          </Text>
        </Card>
      </Columns>
    </Page>
  );
}
