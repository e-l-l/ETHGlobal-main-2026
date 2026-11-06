"use client";

import { useState } from "react";
import type { AgentLimitsVM, LadderStepVM } from "@repo/sdk";
import { ActionBar, Button, Card, Chips, Label, OfferDisclosure, Stack, Text } from "@/final";
import { formatMoney } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { PrivateMark } from "../_parts";
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
    <Stack gap="lg">
      <PrivateMark>
        <Stack gap="md">
          <Card>
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
          <Card>
            <Label>Max per month</Label>
            <Chips
              label="Max per month"
              value={perMonth}
              onChange={setPerMonth}
              options={perMonthOptions.map((v) => ({ value: String(v), label: formatMoney(v) }))}
            />
          </Card>
          <Card>
            <Label>What it can draw for</Label>
            <Chips
              label="Purpose"
              value={purpose}
              onChange={setPurpose}
              options={purposes.map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
            />
          </Card>
        </Stack>
      </PrivateMark>
      <Card tone="tint" gap="sm">
        <Label>In plain words</Label>
        <Text className="text-charcoal">
          Your agent can draw up to {formatMoney(Number(perAdvance))} at a time, and {formatMoney(Number(perMonth))} in a
          month, for {purpose}
           to your registered payout address. The purpose is not enforced onchain. It can never go past
          these limits: the contract blocks it.
        </Text>
      </Card>
      <Text size="note">Illustrative maximum advance at a 15% flat fee and 10% sales share; future offers may differ.</Text>
      <OfferDisclosure principal={Number(perAdvance)} fee={Number(perAdvance) * 0.15} total={Number(perAdvance) * 1.15} holdback={10} estimates={[100, 200, 400].map((sales, i) => ({ label: ["Slow ($100/day)", "Normal ($200/day)", "Busy ($400/day)"][i]!, days: Math.ceil(Number(perAdvance) * 1.15 / (sales * 0.1)) }))} />
      <ActionBar hint="One-time approval. Only you can turn the agent on.">
        <Button href={`${routes.agent.approve}?${new URLSearchParams({ perAdvance, perMonth, purpose })}`}>Approve with World</Button>
      </ActionBar>
    </Stack>
  );
}
