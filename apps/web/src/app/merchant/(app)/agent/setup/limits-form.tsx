"use client";

import { useState } from "react";
import type { AgentLimitsVM, LadderStepVM } from "@repo/sdk";
import { ActionBar, Button, Card, Chips, Columns, Label, OfferDisclosure, Stack, Text } from "@/final";
import { HeroBlock, HeroLabel } from "../../../_ui";
import { FEE_TERMS, HOLDBACK_PCT, annualizedMaxPercent, feeAfterDays, maxFee } from "@/lib/fees";
import { formatMoney, formatPercent } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { perMonthOptions, purposes } from "../_data";

type SetupPage = { agentLimits: AgentLimitsVM; limitsLadder: LadderStepVM[]; currentTier: number };

/** M07: defaults from `agent.setupOptions()`, the ladder and tier from `merchant.repaid()`. M08 gets the picks. */
export function LimitsForm({ initial }: { initial: SetupPage | null }) {
  const { data, error } = useMRA(q.agentSetupPage, { initial });
  if (!data) return <MRAState error={error} />;
  return <LimitsFields view={data} />;
}

/** Local state until "Approve with World": the picks travel to M08 in the URL. */
function LimitsFields({ view }: { view: SetupPage }) {
  const { agentLimits, limitsLadder, currentTier } = view;
  const lockedCaps = limitsLadder.filter((_, i) => i > currentTier);
  const cap = limitsLadder[currentTier]?.cap ?? agentLimits.perAdvance;
  const [perAdvance, setPerAdvance] = useState(String(Math.min(agentLimits.perAdvance, cap)));
  const [perMonth, setPerMonth] = useState(String(agentLimits.perMonth));
  const [purpose, setPurpose] = useState<string>(agentLimits.purpose);

  // Caps above the current tier can't be picked; fall back to the tier cap.
  const pick = (v: string) => (Number(v) <= cap ? setPerAdvance(v) : undefined);

  return (
    <Columns ratio="3:2">
      <div>
        <Stack gap="md">
          <Card padding="lg">
            <Label>Max per advance</Label>
            <Chips
              label="Max per advance"
              value={perAdvance}
              onChange={pick}
              options={limitsLadder.map((l, i) => ({
                value: String(l.cap),
                label: i > currentTier ? `${formatMoney(l.cap)} (locked)` : formatMoney(l.cap),
              }))}
            />
            <Text size="note">
              {lockedCaps.length > 0 ? `${lockedCaps.map((l) => formatMoney(l.cap)).join(" and ")} unlock as you repay. ` : ""}Your limit is{" "}
              {formatMoney(cap)} today.
            </Text>
          </Card>
          <Card padding="lg">
            <Label>Max per month</Label>
            <Chips
              label="Max per month"
              value={perMonth}
              onChange={setPerMonth}
              options={perMonthOptions.map((v) => ({ value: String(v), label: formatMoney(v) }))}
            />
          </Card>
          <Card padding="lg">
            <Label>What it can draw for</Label>
            <Chips
              label="Purpose"
              value={purpose}
              onChange={setPurpose}
              options={purposes.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
            />
          </Card>
        </Stack>
      </div>

      <Stack gap="md" className="md:sticky md:top-24">
        <HeroBlock rule={false}>
          <HeroLabel>In plain words</HeroLabel>
          <p className="m-0 font-display text-h2 text-canvas">
            Your agent can draw up to <span className="text-lime">{formatMoney(Number(perAdvance))} at a time</span> and{" "}
            <span className="text-lime">{formatMoney(Number(perMonth))} a month</span>, for {purpose}, to your registered payout address.
          </p>
          <Text className="text-honeydew">The purpose is not enforced onchain. The contract blocks anything past these limits.</Text>
          <div className="grid grid-cols-2 gap-4 border-t border-honeydew/25 pt-4 font-body text-note">
            <div className="flex flex-col">
              <span className="text-honeydew">Paid back from</span>
              <span className="font-semibold text-canvas">A share of each sale</span>
            </div>
            <div className="flex flex-col">
              <span className="text-honeydew">Fee</span>
              <span className="font-semibold text-canvas">0.5% a week, max 3%</span>
            </div>
          </div>
        </HeroBlock>
        <Text size="note">
          Illustrative maximum advance at the full {formatPercent(FEE_TERMS.capBps / 100)} fee and a {formatPercent(HOLDBACK_PCT)} sales
          share; future offers may differ.
        </Text>
        <OfferDisclosure
          principal={Number(perAdvance)}
          maxFeeBps={FEE_TERMS.capBps}
          feeIfRepaidIn2Weeks={feeAfterDays(Number(perAdvance), 14)}
          annualizedCostPercent={annualizedMaxPercent()}
          holdback={HOLDBACK_PCT}
          estimates={[100, 200, 400].map((sales, i) => ({
            label: ["Slow ($100/day)", "Normal ($200/day)", "Busy ($400/day)"][i]!,
            // Worst case: the whole advance plus the full fee, repaid from the holdback share.
            days: Math.ceil((Number(perAdvance) + maxFee(Number(perAdvance))) / ((sales * HOLDBACK_PCT) / 100)),
          }))}
        />
        <ActionBar hint="One-time approval. Only you can turn the agent on.">
          <Button href={`${routes.agent.approve}?${new URLSearchParams({ perAdvance, perMonth, purpose })}`} width="full">
            Approve with World
          </Button>
        </ActionBar>
      </Stack>
    </Columns>
  );
}
