"use client";

import type { WeekView } from "@repo/sdk";
import { KeyValueList, WeekSplitBars } from "@/components/data";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Card, Eyebrow, Heading, Pill, Text } from "@/components/ui";
import { formatDays, formatMoney } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { useMRA } from "@/lib/use-mra";

/* M13 Bad week: `merchant.week()`. Calm state: no red anywhere on this screen. */
export function WeekScreen({ initial }: { initial: WeekView | null }) {
  const { data, error } = useMRA(q.week, { initial });
  if (!data) return <MRAState error={error} />;
  const { advance, week } = data;
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
