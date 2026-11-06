"use client";

import type { AdvanceDetailsView } from "@repo/sdk";
import { Button, Card, KeyValue, Label, Ledger, LineChart, OfferDisclosure, Page, Stack, Text } from "@/final";
import { cn } from "@/lib/cn";
import { useCurrency } from "@/lib/currency";
import { etaKnown } from "@/lib/estimate";
import { FEE_LINE } from "@/lib/fees";
import { formatMoney, formatPercent } from "@/lib/format";
import { isBehindDemo, withBehind } from "@/lib/mock/behind";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { BigFigure, CardTitle, DarkMeter, HeroBlock, HeroLabel, PlainWords, ScreenHead } from "../../_ui";
import { BehindNotice, UnlockMeter } from "../../_unlock";

/** "Day 0 · Day n/2 · Day n" for a curve with one point per day. */
function dayLabels(points: number[]) {
  const last = Math.max(0, points.length - 1);
  return last < 2 ? ["Day 0", `Day ${last}`] : ["Day 0", `Day ${Math.round(last / 2)}`, `Day ${last}`];
}

/** M12 Advance details: `merchant.advance()`. Owed now, pay early pay less, the gradual unlock, the terms. */
export function AdvanceDetailsScreen({ initial, demo }: { initial: AdvanceDetailsView | null; demo?: string }) {
  const { data: raw, error } = useMRA(q.advance, { initial });
  const cur = useCurrency();
  if (!raw) return <MRAState error={error} />;
  const data = isMock && isBehindDemo(demo) ? withBehind(raw) : raw;
  const { advance, repaymentCurve, daysLeftEstimates } = data;
  const behind = advance.isBehind;
  const usual = daysLeftEstimates.find((e) => e.label === "Normal");
  const maxFee = (advance.drawn * advance.maxFeeBps) / 10_000;
  const payEarly: [string, number][] = [
    ["1 week", advance.feeIfRepaidIn1Week],
    ["2 weeks", advance.feeIfRepaidIn2Weeks],
    ["4 weeks", advance.feeIfRepaidIn4Weeks],
    ["6 weeks or more", advance.feeIfRepaidIn6Weeks],
  ];

  const disclosure = (
    <OfferDisclosure principal={advance.drawn} maxFeeBps={advance.maxFeeBps} feeIfRepaidIn2Weeks={advance.feeIfRepaidIn2Weeks} annualizedCostPercent={advance.annualizedCostPercent} holdback={advance.holdback} feeRule={advance.feeRule} estimates={daysLeftEstimates.map((e) => ({ ...e, label: `${e.label} (estimated total duration)`, days: e.days > 0 ? e.days + Math.max(0, repaymentCurve.points.length - 1) : 0 }))} />
  );

  return (
    <Page tabs dense>
      <ScreenHead
        back={routes.merchant}
        backLabel="Home"
        label={`For ${advance.purpose} · drawn ${advance.drawnOn}`}
        title="Your advance"
      />

      {behind ? <BehindNotice advance={advance} /> : null}

      {/* Phones and tablets: the cost first, then the advance. Desktop shows it in the middle column. */}
      <div className="lg:hidden">{disclosure}</div>

      {/* Desktop: three columns so the advance, the chart and the terms share one view. */}
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[3fr_2fr] lg:grid-cols-3 lg:gap-4">
        <Stack gap="lg" className="lg:gap-4">
          <HeroBlock seed={5}>
            <HeroLabel>Left to pay back</HeroLabel>
            <div className="flex flex-col gap-1.5 lg:gap-1">
              <BigFigure>{formatMoney(advance.left)}</BigFigure>
              <Ledger className="text-honeydew">
                left of {formatMoney(advance.drawn + advance.feeSoFar + advance.lateFee)} · fee so far {formatMoney(advance.feeSoFar)}
                {advance.lateFee > 0 ? ` · late fee ${formatMoney(advance.lateFee)}` : cur.dollarsOnly ? "" : ` · ${cur.approx(advance.owedNow)}`}
              </Ledger>
            </div>
            <div className="flex flex-col gap-2 lg:gap-1.5">
              <DarkMeter value={advance.pct / 100} label="Advance paid back" />
              <div className="flex flex-col gap-0.5 font-body text-note text-honeydew sm:flex-row sm:justify-between sm:gap-4">
                <span>
                  {formatMoney(advance.repaid)} paid back · {formatPercent(advance.pct)}
                </span>
                <span>{formatPercent(advance.holdback)} of each payment</span>
              </div>
            </div>
          </HeroBlock>

          <Card padding="lg" gap="sm" className="lg:p-4">
            <div className="flex flex-col gap-1">
              <CardTitle>Pay early, pay less</CardTitle>
              <Text size="note" tone="muted">
                {FEE_LINE} It stops the day it&rsquo;s paid off.
              </Text>
            </div>
            <ul className="m-0 grid list-none grid-cols-2 gap-2.5 p-0 sm:grid-cols-4">
              {payEarly.map(([when, fee], i) => (
                <li
                  key={when}
                  className={cn("flex flex-col gap-1.5 rounded-md p-3.5", i === 0 ? "border border-hunter bg-honeydew text-hunter" : "bg-well text-charcoal")}
                >
                  <Label className={i === 0 ? "text-hunter" : undefined}>Repaid in {when}</Label>
                  <span className="font-display text-h1 tabular-nums">{formatMoney(fee)}</span>
                  <span className={cn("font-body text-note", i === 0 ? "text-hunter" : "text-charcoal-muted")}>fee in total</span>
                </li>
              ))}
            </ul>
            <Text size="note" tone={behind ? undefined : "muted"} className={behind ? "text-caution" : undefined}>
              {behind
                ? "While you are behind, the fee runs at 1% a week. Catch up and it drops back to 0.5%."
                : `Keep up the weekly minimum and the fee stays 0.5% a week.${usual && etaKnown(usual.days) ? ` At your usual sales this is paid off in about ${usual.days} ${usual.days === 1 ? "day" : "days"}.` : ""}`}
            </Text>
          </Card>


          {data.limit > 0 ? (
            <Card padding="lg">
              <CardTitle>Your limit</CardTitle>
              <UnlockMeter
                availableNow={data.availableNow}
                limit={data.limit}
                unlockSteps={data.unlockSteps}
                nextUnlockAt={data.nextUnlockAt}
                frozen={behind}
              />
            </Card>
          ) : null}

          <PlainWords className="lg:p-4">
            <p className="m-0">The minimum is 1% of the advance plus the fee, every 7 days. Your sales usually cover it on their own.</p>
            <p className="m-0 pt-2 text-note">≈{formatPercent(Math.round(advance.annualizedCostPercent))}/yr maximum (simple, not an APR).</p>
          </PlainWords>
        </Stack>

        <Stack gap="lg" className="lg:gap-4">
          <div className="hidden lg:block">{disclosure}</div>
          <Card padding="lg" gap="sm" className="lg:p-4">
            <CardTitle end={<Label>{formatPercent(advance.holdback)} of each payment</Label>}>Paid back so far</CardTitle>
            <LineChart
              points={[...repaymentCurve.points]}
              label={repaymentCurve.ariaLabel}
              format={(v) => formatMoney(v)}
              xLabels={isMock ? ["Day 0", "Day 5", "Day 9"] : dayLabels(repaymentCurve.points)}
            />
          </Card>
        </Stack>

        <Stack gap="lg" className="lg:gap-4">
          <Card padding="lg" gap="sm" className="lg:p-4">
            <CardTitle>The terms</CardTitle>
            <KeyValue
              rows={[
                ["Fee", "0.5% a week while you owe"],
                [`Max fee (${formatPercent(advance.maxFeeBps / 100)})`, formatMoney(maxFee)],
                ["Fee so far", formatMoney(advance.feeSoFar)],
                ...(advance.lateFee > 0 ? [["Late fee so far", formatMoney(advance.lateFee)] as [string, string]] : []),
                ["Owed now", formatMoney(advance.owedNow)],
                ["Paid from", `${formatPercent(advance.holdback)} of each payment`],
                ["Drawn on", advance.drawnOn],
              ]}
            />
          </Card>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:gap-2">
            <Button href={routes.advance.arrived} variant="secondary" className="sm:flex-1">
              Why your agent drew this
            </Button>
            <Button href={routes.week} variant="secondary" className="sm:flex-1">
              What if I have a slow week?
            </Button>
          </div>
        </Stack>
      </div>
    </Page>
  );
}
