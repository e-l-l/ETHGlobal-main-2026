import { annualizedCost } from "@repo/sdk";
import { Card } from "./surface";
import { Pill } from "./status";
import { Text } from "./text";

export function DemoBadge({ children }: { children: React.ReactNode }) {
  return <Pill tone="locked">{children}</Pill>;
}

export function OfferDisclosure({ principal, fee, total, holdback, estimates }: { principal: number; fee: number; total: number; holdback: number; estimates: { label: string; days: number }[] }) {
  return <Card tone="well" gap="sm">
    <Text>Received ${principal.toFixed(2)} · flat fee ${fee.toFixed(2)} · repay ${total.toFixed(2)} · {holdback}% of each processed sale</Text>
    {estimates.map((e) => {
      const rate = annualizedCost(principal, fee, e.days);
      return <Text size="note" key={e.label}>{e.label}: {e.days > 0 ? `${e.days} days · ${rate?.toFixed(1)}% simple annualized cost` : "estimate unavailable"}</Text>;
    })}
    <Text size="note" tone="muted">Illustrative simple annualization of the flat fee, not APR; repayment timing depends on sales processed here. Faster repayment raises annualized cost.</Text>
  </Card>;
}

export function LenderDisclosure() {
  return <Card tone="well" gap="sm">
    <Text>For a fully repaid $100 advance at a 15% fee: $9 senior, $4.50 DripCoin (DRIP), $1.50 reserve, $0 protocol.</Text>
    <Text size="note">Pool swaps pay a 0.30% pool fee and a separate 0.30% RiskHook fee when USDC is the unspecified swap currency. Hook fees go to reserve.</Text>
    <Text size="note">Senior is not guaranteed. Junior withdrawals require remaining cover of at least 10% of senior outstanding; new draws do not enforce this ratio. Withdrawals also depend on available cash.</Text>
    <DemoBadge>Seeded liquidity · test balances</DemoBadge>
  </Card>;
}
