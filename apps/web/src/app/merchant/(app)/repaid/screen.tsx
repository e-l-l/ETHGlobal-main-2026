"use client";

import { useState } from "react";
import type { ClaimResult, ClaimStep, RepaidView } from "@repo/sdk";
import { Banner, Button, Card, Columns, KeyValue, Label, Ledger, Page, PageHead, Pill, Stack, Text, TierMeter } from "@/final";
import { formatMoney } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";

const CLAIM_STEP: Record<ClaimStep, string> = {
  claiming: "Saving your repayment to the private record",
  finding_leaf: "Finding your pass in the whole record",
  proving: "Checking your record privately",
  done: "Done",
};

/**
 * M16 Repaid: `merchant.repaid()` (Standing Pass count → tier, and the limits ladder). Live modes: when the last
 * advance is fully repaid and this device holds its pass, "Claim" runs `merchant.claimStandingPass()` (relayed
 * claim, whole-tree lookup, a private proof on this device) and then shows the new limit.
 */
export function RepaidScreen({ initial }: { initial: RepaidView | null }) {
  const { data, error } = useMRA(q.repaid, { initial });
  const [step, setStep] = useState<ClaimStep | undefined>();
  const [claimed, setClaimed] = useState<ClaimResult | undefined>();
  const claim = useMRAAction((m) => m.merchant.claimStandingPass({ onStep: setStep }));
  if (!data) return <MRAState error={error} />;
  const { limitsLadder } = data;
  const currentTier = claimed ? claimed.tier : data.currentTier;
  const cap = claimed ? claimed.newCap : (limitsLadder[currentTier]?.cap ?? 0);
  const claimable = !claimed && data.standingPass.claimable === true;

  const run = () => {
    claim.run().then(setClaimed, () => undefined);
  };

  return (
    <Page tabs>
      <PageHead back={routes.merchant} backLabel="Home" label="Advance repaid" title="Repaid. From today, 100% of each sale is yours." />

      <Columns>
        <Stack>
          <Card tone="tint">
            <div className="flex items-center justify-between gap-3">
              <Label>Standing Pass</Label>
              <Pill tone="locked">private</Pill>
            </div>
            <TierMeter tier={Math.min(3, Math.max(0, currentTier)) as 0 | 1 | 2 | 3} />
            <div className="flex flex-col gap-1">
              <strong className="font-display text-h2 text-charcoal">
                You&rsquo;ve repaid {currentTier} {currentTier === 1 ? "advance" : "advances"}
              </strong>
              <Text size="note">
                Your limit now: <strong className="text-charcoal">{formatMoney(cap)}</strong>
              </Text>
            </div>
            <Text size="note" tone="muted">
              Nobody can see your history. Not even us.
            </Text>
          </Card>
          {claimable ? (
            <Card>
              <Text>
                Claim your Standing Pass to raise your limit to{" "}
                <strong className="text-charcoal">{formatMoney(data.standingPass.nextCap ?? 0)}</strong>. It stays on this
                phone, and nobody can link it to this shop.
              </Text>
              {claim.pending && step ? <Ledger role="status">{CLAIM_STEP[step]}…</Ledger> : null}
              {claim.error ? <Banner tone="risk">Not claimed yet ({claim.error}). Try again.</Banner> : null}
              <Button onClick={run} loading={claim.pending}>
                Claim my Standing Pass
              </Button>
            </Card>
          ) : null}
          {claimed ? <Banner>Standing Pass claimed. Your new limit is {formatMoney(claimed.newCap)} per advance.</Banner> : null}
          {claimed ? (
            <Button href={routes.agent.setup}>Use my new limit</Button>
          ) : (
            <Button href={routes.merchant} {...(claimable ? { variant: "ghost" as const } : {})}>
              Back to home
            </Button>
          )}
        </Stack>

        <Card>
          <Label>How your limit grows</Label>
          <KeyValue
            rows={limitsLadder.map((t, i) => [
              i === currentTier ? <strong key={t.label}>{t.label} · now</strong> : t.label,
              formatMoney(t.cap),
            ])}
          />
        </Card>
      </Columns>
    </Page>
  );
}
