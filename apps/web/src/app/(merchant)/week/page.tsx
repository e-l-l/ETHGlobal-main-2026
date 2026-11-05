import { KeyValueList, WeekSplitBars } from "@/components/data";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Card, Eyebrow, Heading, Pill, Text } from "@/components/ui";
import { formatDays, formatMoney } from "@/lib/format";
import { advance } from "@/lib/mock/shop";
import { week } from "@/lib/mock/merchant";

/* Calm state: no red anywhere on this screen. */
export default function WeekPage() {
  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>This week</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            You sold less, so you repaid <Accent>less</Accent>.
          </Heading>
        }
        aside={<Pill tone="tint">quiet week · no penalty</Pill>}
      />

      <TwoColumn
        main={
          <Card>
            <WeekSplitBars
              days={[...week.days]}
              dayLabels={[...week.dayLabels]}
              youLabel="to you"
              repayLabel="to repayment"
              ariaLabel={week.ariaLabel}
            />
          </Card>
        }
        side={
          <Card>
            <KeyValueList
              items={[
                { k: "Your fee", v: `${formatMoney(advance.fee)} · unchanged` },
                { k: "Extra charges", v: "None" },
                { k: "New estimate", v: formatDays(week.newEstimateDays) },
              ]}
            />
            <Text>
              That&rsquo;s fine. Repayment follows your sales. If you make no sales for 30 days in a row, the
              advance closes, and we&rsquo;ll warn you well before that.
            </Text>
          </Card>
        }
      />
    </>
  );
}
