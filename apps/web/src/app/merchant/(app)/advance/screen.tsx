"use client";

import type { AdvanceDetailsView } from "@repo/sdk";
import { Button, Card, Columns, KeyValue, Label, Ledger, Page, PageHead, Stack, Text } from "@/final";
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
import { BigFigure, CardTitle, DarkMeter, HeroBlock, HeroLabel, PlainWords } from "../../_ui";
import { BehindNotice, UnlockMeter } from "../../_unlock";

/** M12 Advance details: `merchant.advance()`. Owed now, pay early pay less, the gradual unlock, the terms. */
export function AdvanceDetailsScreen({ initial, demo }: { initial: AdvanceDetailsView | null; demo?: string }) {
  const { data: raw, error } = useMRA(q.advance, { initial });
  const cur = useCurrency();
  if (!raw) return <MRAState error={error} />;
  const data = isMock && isBehindDemo(demo) ? withBehind(raw) : raw;
  const { advance, daysLeftEstimates } = data;
  const behind = advance.isBehind;
  const usual = daysLeftEstimates.find((e) => e.label === "Normal");
  const maxFee = (advance.drawn * advance.maxFeeBps) / 10_000;
  const payEarly: [string, number][] = [
    ["1 week", advance.feeIfRepaidIn1Week],
    ["2 weeks", advance.feeIfRepaidIn2Weeks],
    ["4 weeks", advance.feeIfRepaidIn4Weeks],
    ["6 weeks or more", advance.feeIfRepaidIn6Weeks],
  ];

  return (
    <Page tabs>
      <PageHead back={routes.merchant} backLabel="Home" label={`For ${advance.purpose} · drawn ${advance.drawnOn}`} title="Your advance" />

      {behind ? <BehindNotice advance={advance} /> : null}

      <Columns ratio="3:2">
        <Stack gap="lg">
          <HeroBlock>
            <HeroLabel>Owed now</HeroLabel>
            <div className="flex flex-col gap-1.5">
              <BigFigure>{formatMoney(advance.owedNow)}</BigFigure>
              <Ledger className="text-honeydew">
                left of {formatMoney(advance.drawn + advance.feeSoFar + advance.lateFee)} · fee so far {formatMoney(advance.feeSoFar)}
                {advance.lateFee > 0 ? ` · late fee ${formatMoney(advance.lateFee)}` : cur.dollarsOnly ? "" : ` · ${cur.approx(advance.owedNow)}`}
              </Ledger>
            </div>
            <div className="flex flex-col gap-2">
              <DarkMeter value={advance.pct / 100} label="Advance paid back" />
              <div className="flex flex-col gap-0.5 font-body text-note text-honeydew sm:flex-row sm:justify-between sm:gap-4">
                <span>
                  {formatMoney(advance.repaid)} paid back · {formatPercent(advance.pct)}
                </span>
                <span>{formatPercent(advance.holdback)} of each payment</span>
              </div>
            </div>
          </HeroBlock>

          <Card padding="lg">
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
                : `No late fee if you pay on time.${usual && etaKnown(usual.days) ? ` At your usual sales this is paid off in about ${usual.days} ${usual.days === 1 ? "day" : "days"}.` : ""}`}
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

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button href={routes.advance.arrived} variant="secondary" className="sm:flex-1">
              Why your agent drew this
            </Button>
            <Button href={routes.week} variant="secondary" className="sm:flex-1">
              What if I have a slow week?
            </Button>
          </div>
        </Stack>

        <Stack gap="lg">
          <Card padding="lg">
            <CardTitle>The terms</CardTitle>
            <KeyValue
              rows={[
                ["Advance", formatMoney(advance.drawn)],
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
          <PlainWords>
            <p className="m-0">{advance.feeRule}</p>
            <p className="m-0 pt-2">The minimum is 1% of the advance plus the fee, every 7 days. Your sales usually cover it on their own.</p>
            <p className="m-0 pt-2 text-note">
              ≈{formatPercent(Math.round(advance.annualizedCostPercent))}/yr maximum (simple, not an APR).
            </p>
          </PlainWords>
        </Stack>
      </Columns>
    </Page>
  );
}
