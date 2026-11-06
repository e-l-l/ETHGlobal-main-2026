import { FEE_LINE, FEE_TERMS, feeAfterDays } from "@/lib/fees";
import { formatMoney, formatPercent } from "@/lib/format";
import { Card, KeyValue } from "./surface";
import { Pill } from "./status";
import { Text } from "./text";

export function DemoBadge({ children }: { children: React.ReactNode }) {
  return <Pill tone="locked">{children}</Pill>;
}

/**
 * The cost of an advance: principal, the most the fee can be, the fee at two weeks, and the simple annualized maximum
 * (not an APR). `estimates` are payoff durations; each shows the fee it would cost.
 */
export function OfferDisclosure({
  principal,
  maxFeeBps,
  feeIfRepaidIn2Weeks,
  annualizedCostPercent,
  holdback,
  estimates = [],
}: {
  principal: number;
  maxFeeBps: number;
  feeIfRepaidIn2Weeks: number;
  annualizedCostPercent: number;
  holdback: number;
  estimates?: { label: string; days: number }[];
}) {
  const terms = { rateBpsPerWeek: FEE_TERMS.rateBpsPerWeek, capBps: maxFeeBps };
  return <Card tone="well" gap="sm">
    <Text>{FEE_LINE} Paid back from {formatPercent(holdback)} of each processed sale.</Text>
    <KeyValue
      rows={[
        ["Advance", formatMoney(principal)],
        [`Max fee (${formatPercent(maxFeeBps / 100)})`, formatMoney((principal * maxFeeBps) / 10_000)],
        ["Fee if repaid in 2 weeks", formatMoney(feeIfRepaidIn2Weeks)],
        ["Yearly cost", `≈${formatPercent(Math.round(annualizedCostPercent))}/yr maximum (simple, not an APR)`],
      ]}
    />
    {estimates.map((e) => (
      <Text size="note" key={e.label}>
        {e.label}: {e.days > 0 ? `${e.days} days · fee ${formatMoney(feeAfterDays(principal, e.days, terms))}` : "estimate unavailable"}
      </Text>
    ))}
    <Text size="note" tone="muted">The fee builds on the original advance, is paid before the advance itself and stops once it&rsquo;s paid off. Pay early, pay less. No late fees.</Text>
  </Card>;
}

export function LenderDisclosure() {
  return <Card tone="well" gap="sm">
    <Text>For a $100 advance repaid in 4 weeks, the $2 fee pays $0.80 senior, $0.60 DripCoin (DRIP), $0.40 reserve, $0.20 protocol.</Text>
    <Text size="note">Pool swaps pay a 0.30% pool fee and a separate 0.30% RiskHook fee when USDC is the unspecified swap currency. Hook fees go to reserve.</Text>
    <Text size="note">Senior is not guaranteed. Junior withdrawals require remaining cover of at least 10% of senior outstanding; new draws do not enforce this ratio. Withdrawals also depend on available cash.</Text>
    <DemoBadge>Seeded liquidity · test balances</DemoBadge>
  </Card>;
}
