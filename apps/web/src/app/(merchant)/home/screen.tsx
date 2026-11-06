"use client";

import type { HomeView } from "@repo/sdk";
import { KeyValueList, StatCard, StatGrid } from "@/components/data";
import { AdvanceCard, SalesFeed, SplitRow } from "@/components/domain";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Card, CardHeader, Eyebrow, Heading, Label, Mono, Pill, TextLink } from "@/components/ui";
import type { Lang } from "@/lib/copy";
import { formatDays, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { SaleVoice } from "./sale-voice";

/** Live modes poll the SDK for new sales (the voice line). Mock data never changes, so it isn't polled. */
const SALES_POLL_MS = 4000;

/** M10 Home: `merchant.home()`. */
export function HomeScreen({ initial, lang }: { initial: HomeView | null; lang: Lang }) {
  const { data, error } = useMRA(q.home, { initial, ...(isMock ? {} : { refreshMs: SALES_POLL_MS }) });
  if (!data) return <MRAState error={error} />;
  const { shop, today, agentSummary, agentLimits, advance, sales } = data;
  const holdback = advance?.holdback ?? 0;
  const split = (total: number) => {
    const repay = (total * holdback) / 100;
    return { you: total - repay, repay };
  };

  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>{today.label}</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Today at your <Accent>shop</Accent>.
          </Heading>
        }
        aside={
          <Pill tone="tint" dot>
            agent active
          </Pill>
        }
      />

      <StatGrid>
        <StatCard
          label="Sold today"
          value={formatMoney(today.soldLocal, shop.localCurrency)}
          sub={`≈ ${formatMoney(today.soldUsd)}`}
        />
        <StatCard label="Sales today" value={today.salesCount} />
        <StatCard
          label="To repayment"
          value={formatMoney(today.toRepayment)}
          sub={`${formatPercent(holdback)} of sales`}
        />
        <StatCard
          label="This week"
          value={formatMoney(today.weekUsd)}
          sub={
            <TextLink href={routes.week} arrow className="min-h-0">
              see week
            </TextLink>
          }
        />
      </StatGrid>

      <TwoColumn
        ratio="1:1"
        main={
          <>
            {advance ? (
              <AdvanceCard
                purpose={`Advance · ${advance.purpose}`}
                left={advance.left}
                total={advance.total}
                percentRepaid={advance.pct}
                leftOfText={(total) => `left of ${total}`}
                etaText={`${formatDays(advance.etaDays)} to go at this pace`}
                href={routes.advance.details}
                linkLabel="details"
                progressLabel="Advance repaid"
              />
            ) : null}
            <Card>
              <Label>Agent</Label>
              <KeyValueList
                items={[
                  { k: "Last draw", v: `${formatMoney(agentSummary.lastDraw)} · ${agentSummary.lastDrawWhen}` },
                  {
                    k: "This month",
                    v: `${formatMoney(agentSummary.monthUsed)} of ${formatMoney(agentLimits.perMonth)}`,
                  },
                ]}
              />
              <div>
                <TextLink href={routes.agent.log} arrow>
                  activity log
                </TextLink>
              </div>
            </Card>
          </>
        }
        side={
          <>
            <Card gap="none">
              <CardHeader aside={<Mono tone="accent">live</Mono>} className="pb-2">
                <Label>Today&rsquo;s sales</Label>
              </CardHeader>
              <SalesFeed>
                {sales.map((s) => {
                  const { you, repay } = split(s.total);
                  return (
                    <SplitRow
                      key={s.id}
                      total={formatMoney(s.total, shop.localCurrency)}
                      time={s.time}
                      you={formatNumber(you)}
                      repay={formatNumber(repay)}
                      youLabel="to you"
                      repayLabel="to repayment"
                    />
                  );
                })}
              </SalesFeed>
            </Card>
            <SaleVoice lang={lang} sales={sales} usdToLocal={shop.usdToLocal} holdback={holdback} />
          </>
        }
      />
    </>
  );
}
