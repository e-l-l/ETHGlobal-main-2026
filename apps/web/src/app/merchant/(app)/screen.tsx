"use client";

import type { HomeView } from "@repo/sdk";
import {
  Button,
  AgentStop,
  Card,
  EyeIcon,
  JarMark,
  Label,
  Ledger,
  ListRow,
  Page,
  PageHead,
  Pill,
  PixelDune,
  ProgressBar,
  RowList,
  Text,
  TextLink,
} from "@/final";
import { ETA_PENDING, etaKnown } from "@/lib/estimate";
import { formatDays, formatLocal, formatMoney, formatPercent } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { BigFigure, CardTitle, DarkBlock, DarkMeter, HeroBlock, HeroLabel, Tile } from "../_ui";
import { SalesFeed } from "./sales-feed";

/** Live modes poll for new payments. Mock data never changes, so it isn't polled. */
const SALES_POLL_MS = 4000;

/**
 * M10 Home: `merchant.home()` (+ `agent.status()` for the pill in live modes, `merchant.cashOutView()` for what is
 * ready to cash out, `merchant.week()` for the week's dune while an advance is open).
 * Desktop: payments and the advance side by side, equal weight. Phones: one green summary on top, then payments.
 */
export function HomeScreen({ initial }: { initial: HomeView | null }) {
  const { data, error } = useMRA(q.home, { initial, ...(isMock ? {} : { refreshMs: SALES_POLL_MS }) });
  const { data: agent, reload: reloadAgent } = useMRA(q.agentStatus);
  const { data: cash } = useMRA(q.cashOut);
  const { data: week } = useMRA(q.week, { enabled: data?.advance != null });
  if (!data) return <MRAState error={error} />;
  const { shop, today, agentSummary, agentLimits, advance, sales, limitsLadder, currentTier } = data;
  const holdback = advance?.holdback ?? 0;
  const agentOn = agent?.active === true;
  const toYou = Math.max(0, today.soldUsd - today.toRepayment);
  const available = cash?.available;
  const cap = limitsLadder[currentTier]?.cap;
  const nextCap = limitsLadder[currentTier + 1]?.cap;
  const lit = Math.min(4, Math.max(1, currentTier + 1)) as 1 | 2 | 3 | 4;
  const eta = advance ? (etaKnown(advance.etaDays) ? `${formatDays(advance.etaDays)} to go at this pace` : ETA_PENDING) : "";

  const agentPill = agentOn ? (
    <Pill tone="saving" dot>
      agent active
    </Pill>
  ) : agent ? (
    <Pill tone="locked">agent off</Pill>
  ) : null;

  return (
    <Page tabs>
      <PageHead
        label={today.label}
        title="Today at your shop."
        actions={
          <div className="flex items-center gap-3">
            {agentPill}
            <Button href={routes.myQr} size="sm" width="auto" className="hidden md:inline-flex">
              Show my QR
            </Button>
          </div>
        }
      />

      {/* Phones and tablets: payments and the advance at a glance. */}
      <HeroBlock className="lg:hidden">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <HeroLabel>Payments today</HeroLabel>
            <span className="font-display text-amount tabular-nums">{formatMoney(today.soldUsd)}</span>
            <Ledger className="text-honeydew">
              {today.salesCount} paid
            </Ledger>
          </div>
          <div className="flex min-w-0 flex-col gap-1 border-l border-honeydew/30 pl-4">
            <HeroLabel>{advance ? "Advance left" : "Advance"}</HeroLabel>
            {advance ? (
              <>
                <span className="font-display text-amount tabular-nums">{formatMoney(advance.left)}</span>
                <Ledger className="text-honeydew">of {formatMoney(advance.total)}</Ledger>
              </>
            ) : (
              <span className="font-body text-note text-honeydew">None open</span>
            )}
          </div>
        </div>
        {advance ? (
          <div className="flex flex-col gap-2">
            <DarkMeter value={advance.pct / 100} label="Advance paid back" />
            <div className="flex items-center justify-between gap-3 font-body text-note text-honeydew">
              <span>{formatPercent(advance.pct)} paid back</span>
              <TextLink href={routes.advance.details} className="text-canvas decoration-canvas/40 hover:decoration-canvas">
                Details
              </TextLink>
            </div>
          </div>
        ) : null}
      </HeroBlock>

      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        {/* ---------------------------------------------------------- Payments */}
        <section aria-label="Payments" className="flex min-w-0 flex-col gap-4 lg:gap-0 lg:overflow-hidden lg:rounded-lg lg:border lg:border-hairline lg:bg-surface">
          <div className="flex flex-col gap-4 lg:gap-5 lg:border-b lg:border-hairline lg:p-7">
            <div className="hidden items-center justify-between gap-3 lg:flex">
              <Label>Payments today</Label>
              <Pill tone="saving" dot>
                live
              </Pill>
            </div>
            <div className="hidden flex-col gap-1.5 lg:flex">
              <BigFigure className="text-charcoal">{formatMoney(today.soldUsd)}</BigFigure>
              <Ledger>
                {formatMoney(today.soldLocal, shop.localCurrency)} · {today.salesCount} {today.salesCount === 1 ? "payment" : "payments"}
                {sales[0] ? ` · last ${sales[0].time}` : ""}
              </Ledger>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Tile label="To you" value={formatMoney(toYou)} sub={advance ? `${formatPercent(100 - holdback)} of each payment` : "all of each payment"} />
              <Tile
                accent
                label="To your advance"
                value={formatMoney(today.toRepayment)}
                sub={advance ? `${formatPercent(holdback)} of each payment` : "no open advance"}
              />
            </div>
          </div>

          {/* Phones: money ready to move, on Charcoal. */}
          <DarkBlock className="flex-row flex-wrap items-center justify-between lg:hidden">
            <div className="flex flex-col gap-1">
              <HeroLabel>Ready to cash out</HeroLabel>
              <span className="font-display text-h1 tabular-nums">{available !== undefined ? formatMoney(available) : "…"}</span>
            </div>
            <Button href={routes.cashOut} variant="lime" width="auto">
              Cash out
            </Button>
          </DarkBlock>

          <div className="flex flex-col overflow-hidden rounded-lg border border-hairline bg-surface lg:rounded-none lg:border-0">
            <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5 md:px-7 lg:hidden">
              <CardTitle>Live payments</CardTitle>
              <Pill tone="saving" dot>
                live
              </Pill>
            </div>
            <SalesFeed sales={sales} usdToLocal={shop.usdToLocal} localCurrency={shop.localCurrency} holdback={holdback} className="py-1 lg:py-0" />
          </div>

          <div className="mt-auto hidden flex-wrap items-center justify-between gap-3 border-t border-hairline px-7 py-4 lg:flex">
            <Text size="note" tone="muted">
              {advance ? "Each payment splits 9 to 1 automatically." : "Every payment goes straight to you."}
            </Text>
            <Button href={routes.cashOut} variant="secondary" size="sm" width="auto">
              {available !== undefined ? `Cash out ${formatMoney(available)}` : "Cash out"}
            </Button>
          </div>
        </section>

        {/* ----------------------------------------------------------- Advance */}
        <section aria-label="Advance" className="flex min-w-0 flex-col gap-4 lg:gap-0 lg:overflow-hidden lg:rounded-lg lg:border lg:border-hairline lg:bg-surface">
          {advance ? (
            <HeroBlock className="hidden rounded-none lg:flex">
              <div className="flex items-center justify-between gap-3">
                <HeroLabel>Advance · {advance.purpose}</HeroLabel>
                <TextLink href={routes.advance.details} className="text-canvas decoration-canvas/40 hover:decoration-canvas">
                  Details
                </TextLink>
              </div>
              <div className="flex items-end justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <BigFigure>{formatMoney(advance.left)}</BigFigure>
                  <Ledger className="text-honeydew">
                    left of {formatMoney(advance.total)} · {formatLocal(advance.left * shop.usdToLocal, shop.localCurrency)}
                  </Ledger>
                </div>
                <JarMark lit={lit} on="dark" size={72} label={`Limit meter: tier ${currentTier} of 3`} />
              </div>
              <div className="flex flex-col gap-2">
                <DarkMeter value={advance.pct / 100} label="Advance paid back" />
                <div className="flex flex-col gap-0.5 font-body text-note text-honeydew">
                  <span>
                    {formatMoney(advance.repaid)} paid back · {formatPercent(advance.pct)}
                  </span>
                  <span>
                    {formatMoney(advance.fee)} {advance.feeLabel.toLowerCase()}, no interest · {eta}
                  </span>
                </div>
              </div>
            </HeroBlock>
          ) : (
            <HeroBlock className="hidden rounded-none lg:flex">
              <HeroLabel>Advance</HeroLabel>
              <span className="font-display text-h1 text-canvas">No open advance.</span>
              <Text className="text-honeydew">Your agent draws one for stock when your payments can pay it back.</Text>
            </HeroBlock>
          )}

          <Card className="lg:rounded-none lg:border-0 lg:border-b lg:border-hairline lg:px-7 lg:py-6">
            <CardTitle
              end={
                <TextLink href={agentOn ? routes.agent.log : routes.agent.setup} arrow>
                  {agentOn ? "Activity" : "Set up"}
                </TextLink>
              }
            >
              Your agent
            </CardTitle>
            <div className="flex items-center justify-between gap-3 font-body text-read">
              <span className="text-charcoal-muted">Last draw</span>
              <span className="text-right font-semibold text-charcoal tabular-nums">
                {agentSummary.lastDrawWhen ? `${formatMoney(agentSummary.lastDraw)} · ${agentSummary.lastDrawWhen}` : "None yet"}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 font-body text-read">
                <span className="text-charcoal-muted">This month</span>
                <span className="font-semibold text-charcoal tabular-nums">
                  {formatMoney(agentSummary.monthUsed)} of {formatMoney(agentLimits.perMonth)}
                </span>
              </div>
              <ProgressBar value={agentLimits.perMonth > 0 ? agentSummary.monthUsed / agentLimits.perMonth : 0} label="Monthly limit used" />
            </div>
            <div className="flex items-center justify-between gap-3 font-body text-read">
              <span className="text-charcoal-muted">Remaining allowance</span>
              <span className="text-right font-semibold text-charcoal tabular-nums">
                {agent?.remainingAllowance === undefined ? "Unavailable" : formatMoney(agent.remainingAllowance)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 font-body text-read">
              <span className="text-charcoal-muted">Mandate expiry</span>
              <span className="text-right font-semibold text-charcoal tabular-nums">
                {agent?.expiry ? new Date(agent.expiry * 1000).toLocaleDateString() : "Unavailable"}
              </span>
            </div>
            {agentOn ? <AgentStop onDone={reloadAgent} /> : null}
          </Card>

          {cap !== undefined ? (
            <Card className="flex-row flex-wrap items-center justify-between lg:rounded-none lg:border-0 lg:px-7 lg:py-5">
              <div className="flex min-w-0 flex-col">
                <span className="font-body text-note text-charcoal-muted">Your limit</span>
                <span className="font-body text-read font-semibold text-charcoal">
                  {formatMoney(cap)} now{nextCap !== undefined ? ` · ${formatMoney(nextCap)} after this is repaid` : ""}
                </span>
              </div>
              <TextLink href={routes.repaid} arrow>
                How it grows
              </TextLink>
            </Card>
          ) : null}
        </section>
      </div>

      {/* ------------------------------------------------- The week + links */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card padding="lg">
          <CardTitle end={<Label>One column per day</Label>}>This week</CardTitle>
          <div className="flex items-end gap-5">
            {week ? (
              <PixelDune days={week.week.days.map((d) => Math.round(d.you + d.repay))} className="h-24 w-auto shrink-0" />
            ) : null}
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-display text-h1 text-charcoal tabular-nums">{formatMoney(today.weekUsd)}</span>
              <Text size="note" tone="muted">
                in payments over the last 7 days
              </Text>
            </div>
          </div>
          <TextLink href={routes.week} arrow className="w-fit">
            How a quiet week affects your advance
          </TextLink>
        </Card>

        <RowList label="More">
          <ListRow href={routes.advance.arrived} title="Latest advance" sub="Why your agent drew it" />
          <ListRow href={routes.repaid} title="When it's repaid" sub="Your Standing Pass and a higher limit" />
          <ListRow
            href={routes.worldView}
            lead={<EyeIcon size={20} />}
            title="What the world sees"
            sub="Public onchain vs private on this device"
          />
          <ListRow href={routes.myQr} title="My QR" sub="Show it, share it, print it" />
        </RowList>
      </div>
    </Page>
  );
}
