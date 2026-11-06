"use client";

import type { HomeView } from "@repo/sdk";
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
import type { Lang } from "@/lib/copy";
import { ETA_PENDING, etaKnown } from "@/lib/estimate";
import { formatDays, formatMoney, formatPercent } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { SaleVoice } from "./sale-voice";
import { SalesFeed } from "./sales-feed";

/** Live modes poll for new sales (the feed and the voice line). Mock data never changes, so it isn't polled. */
const SALES_POLL_MS = 4000;

/** M10 Home: `merchant.home()` (+ `agent.status()` for the pill in live modes). */
export function HomeScreen({ initial, lang }: { initial: HomeView | null; lang: Lang }) {
  const { data, error } = useMRA(q.home, { initial, ...(isMock ? {} : { refreshMs: SALES_POLL_MS }) });
  const { data: agent } = useMRA(q.agentStatus, { enabled: !isMock });
  if (!data) return <MRAState error={error} />;
  const { shop, today, agentSummary, agentLimits, advance, sales } = data;
  const holdback = advance?.holdback ?? 0;
  const agentOn = isMock || agent?.active === true;

  return (
    <Page tabs>
      <PageHead
        label={today.label}
        title="Today at your shop."
        actions={
          agentOn ? (
            <Pill tone="saving" dot>
              agent active
            </Pill>
          ) : agent ? (
            <Pill tone="locked">agent off</Pill>
          ) : null
        }
      />

      <Columns>
        <Stack>
          {advance ? (
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
                  <Money usd={advance.left} rate={shop.usdToLocal} size="h1" />
                  <Text size="note" tone="muted">
                    left of {formatMoney(advance.total)}
                  </Text>
                </div>
              </div>
              <ProgressBar value={advance.pct / 100} label="Advance repaid" />
              <Text size="note">
                {etaKnown(advance.etaDays) ? `${formatDays(advance.etaDays)} to go at this pace` : ETA_PENDING}
              </Text>
            </Card>
          ) : (
            <Card tone="tint">
              <Label>Advance</Label>
              <Text>No open advance. Your agent draws one when your sales can repay it.</Text>
              <TextLink href={agentOn ? routes.agent.log : routes.agent.setup} arrow>
                {agentOn ? "agent activity" : "set up your agent"}
              </TextLink>
            </Card>
          )}

          <StatGrid
            items={[
              { label: "Sold today", value: formatMoney(today.soldLocal, shop.localCurrency), sub: `≈ ${formatMoney(today.soldUsd)}` },
              { label: "Sales today", value: today.salesCount },
              { label: "To repayment", value: formatMoney(today.toRepayment), sub: `${formatPercent(holdback)} of sales` },
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
                ["Last draw", agentSummary.lastDrawWhen ? `${formatMoney(agentSummary.lastDraw)} · ${agentSummary.lastDrawWhen}` : "None yet"],
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
            <SalesFeed sales={sales} localCurrency={shop.localCurrency} holdback={holdback} />
          </Card>

          <SaleVoice lang={lang} sales={sales} usdToLocal={shop.usdToLocal} holdback={holdback} />

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
