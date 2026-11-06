"use client";

import { useState } from "react";
import type { ClaimResult, ClaimStep, RepaidView } from "@repo/sdk";
import { Banner, Button, Card, Columns, JarMark, Ledger, Page, Stack, Text } from "@/final";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";
import { BackLink, BigFigure, CardTitle, DarkBlock, HeroBlock, HeroLabel } from "../../_ui";

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
  const lit = Math.min(4, Math.max(1, currentTier + 1)) as 1 | 2 | 3 | 4;
  const advances = `${currentTier} ${currentTier === 1 ? "advance" : "advances"}`;

  const run = () => {
    claim.run().then(setClaimed, () => undefined);
  };

  return (
    <Page tabs dense>
      <BackLink href={routes.merchant}>Home</BackLink>

      <HeroBlock seed={11} lit={Array.from({ length: lit }, (_, i) => 7 - i)}>
        <HeroLabel>Paid back in full</HeroLabel>
        <BigFigure as="h1" className="max-w-[16ch] text-balance">
          Your limit is now <span className="text-lime">{formatMoney(cap)}.</span>
        </BigFigure>
        <Text className="max-w-[56ch] text-honeydew md:text-[17px]">
          You&rsquo;ve repaid {advances}. From today, all of each payment is yours. Nobody can see your history, not even
          us.
        </Text>
      </HeroBlock>

      <Columns ratio="3:2">
        <Stack gap="lg" className="lg:gap-4">
          <DarkBlock className="lg:p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-display text-h1-sm">Standing Pass</span>
                  <span className="rounded-chip bg-lime px-2 py-1 font-ledger text-tag font-semibold text-charcoal uppercase">On this phone</span>
                </div>
                <Text className="text-honeydew">
                  Proves you&rsquo;ve paid back {advances}, without showing which shop, when, or how much. Your phone makes
                  the proof; we never see it.
                </Text>
              </div>
              <JarMark lit={lit} on="dark" size={64} build label={`Tier ${currentTier}`} />
            </div>
          </DarkBlock>

          {claimable ? (
            <Card padding="lg" gap="sm" className="lg:p-4">
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
        </Stack>

        <Stack gap="lg" className="lg:gap-4">
          <Card padding="lg" gap="sm" className="lg:p-4">
            <CardTitle>How your limit grows</CardTitle>
            <ol aria-label="Limits ladder" className="m-0 grid list-none grid-cols-2 gap-2 p-0">
              {limitsLadder.map((t, i) => {
                const now = i === currentTier;
                const done = i < currentTier;
                return (
                  <li
                    key={t.label}
                    style={{ animationDelay: `${i * 90}ms` }}
                    className={cn(
                      "flex origin-bottom flex-col gap-1 rounded-md px-3 py-3.5 lg:py-2.5 motion-safe:animate-[rise_500ms_var(--ease-snappy)_both]",
                      now ? "bg-hunter text-canvas" : done ? "bg-honeydew text-hunter" : "bg-well text-charcoal-soft",
                    )}
                  >
                    <span className="font-display text-h1-sm tabular-nums">{formatMoney(t.cap)}</span>
                    <span className="font-body text-note">
                      {t.label}
                      {now ? " · now" : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          </Card>
          {claimed ? (
            <Button href={routes.agent.setup} width="full">
              Use my new limit
            </Button>
          ) : (
            <Button href={routes.merchant} width="full" {...(claimable ? { variant: "secondary" as const } : {})}>
              Back home
            </Button>
          )}
        </Stack>
      </Columns>
    </Page>
  );
}
