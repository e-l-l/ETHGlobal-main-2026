import { KeyValueList, StatCard, StatGrid } from "@/components/data";
import { AdvanceCard, SalesFeed, SplitRow } from "@/components/domain";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Banner, Card, CardHeader, Eyebrow, Heading, Label, Mono, Pill, TextLink } from "@/components/ui";
import { SpeakerIcon } from "@/components/icons";
import { formatDays, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { routes } from "@/lib/routes";
import { advance, agentLimits, shop } from "@/lib/mock/shop";
import { agentSummary, lastAnnouncement, sales, splitSale, today } from "@/lib/mock/merchant";

export default function HomePage() {
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
          sub={`${formatPercent(advance.holdback)} of sales`}
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
            <Banner tone="tint" icon={<SpeakerIcon size={18} />}>
              Last sale announced: &ldquo;{lastAnnouncement}&rdquo;
            </Banner>
          </>
        }
        side={
          <Card gap="none">
            <CardHeader aside={<Mono tone="accent">live</Mono>} className="pb-2">
              <Label>Today&rsquo;s sales</Label>
            </CardHeader>
            <SalesFeed>
              {sales.map((s) => {
                const split = splitSale(s.total);
                return (
                  <SplitRow
                    key={s.id}
                    total={formatMoney(s.total, shop.localCurrency)}
                    time={s.time}
                    you={formatNumber(split.you)}
                    repay={formatNumber(split.repay)}
                    youLabel="to you"
                    repayLabel="to repayment"
                  />
                );
              })}
            </SalesFeed>
          </Card>
        }
      />
    </>
  );
}
