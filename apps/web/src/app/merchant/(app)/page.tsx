import {
  Card,
  Columns,
  Divider,
  EyeIcon,
  KeyValue,
  Label,
  ListRow,
  Money,
  Page,
  PageHead,
  Pill,
  ProgressBar,
  Ring,
  RowList,
  Stack,
  StatGrid,
  Text,
  TextLink,
} from "@/final";
import { formatDays, formatMoney, formatPercent } from "@/lib/format";
import { agentSummary, today } from "@/lib/mock/merchant";
import { ARS_PER_USD, advance, agentLimits, shop } from "@/lib/mock/shop";
import { routes } from "@/lib/routes";
import { SalesFeed } from "./sales-feed";

export default function DashboardPage() {
  return (
    <Page tabs>
      <PageHead
        label={today.label}
        title="Today at your shop."
        actions={
          <Pill tone="saving" dot>
            agent active
          </Pill>
        }
      />

      <Columns>
        <Stack>
          <Card tone="tint">
            <div className="flex items-center justify-between gap-3">
              <Label>Advance · {advance.purpose}</Label>
              <TextLink href={routes.advance.details} arrow>
                details
              </TextLink>
            </div>
            <div className="flex items-center gap-5">
              <Ring value={advance.pct / 100} size={112}>
                <span className="font-display text-h2 text-charcoal tabular-nums">{formatPercent(advance.pct)}</span>
              </Ring>
              <div className="flex min-w-0 flex-col gap-1">
                <Money usd={advance.left} rate={ARS_PER_USD} size="h1" />
                <Text size="note" tone="muted">
                  left of {formatMoney(advance.total)}
                </Text>
              </div>
            </div>
            <ProgressBar value={advance.pct / 100} label="Advance repaid" />
            <Text size="note">{formatDays(advance.etaDays)} to go at this pace</Text>
          </Card>

          <StatGrid
            items={[
              { label: "Sold today", value: formatMoney(today.soldLocal, shop.localCurrency), sub: `≈ ${formatMoney(today.soldUsd)}` },
              { label: "Sales today", value: today.salesCount },
              { label: "To repayment", value: formatMoney(today.toRepayment), sub: `${formatPercent(advance.holdback)} of sales` },
              {
                label: "This week",
                value: formatMoney(today.weekUsd),
                sub: (
                  <TextLink href={routes.week} className="min-h-0">
                    see week
                  </TextLink>
                ),
              },
            ]}
          />

          <Card>
            <Label>Agent</Label>
            <KeyValue
              rows={[
                ["Last draw", `${formatMoney(agentSummary.lastDraw)} · ${agentSummary.lastDrawWhen}`],
                ["This month", `${formatMoney(agentSummary.monthUsed)} of ${formatMoney(agentLimits.perMonth)}`],
              ]}
            />
            <TextLink href={routes.agent.log} arrow>
              activity log
            </TextLink>
          </Card>
        </Stack>

        <Stack>
          <Card>
            <div className="flex items-center justify-between gap-3">
              <Label>Today&rsquo;s sales</Label>
              <Pill tone="saving" dot>
                live
              </Pill>
            </div>
            <Divider />
            <SalesFeed />
          </Card>

          <RowList label="More">
            <ListRow href={routes.cashOut} title="Cash out" sub="Move your dollars" />
            <ListRow href={routes.week} title="This week" sub="How a quiet week affects repayment" />
            <ListRow href={routes.advance.arrived} title="Latest advance" sub="Why your agent drew it" />
            <ListRow href={routes.repaid} title="When it's repaid" sub="How your limit grows" />
            <ListRow
              href={routes.worldView}
              lead={<EyeIcon size={20} />}
              title="What the world sees"
              sub="Public onchain vs private on this device"
            />
          </RowList>
        </Stack>
      </Columns>
    </Page>
  );
}
