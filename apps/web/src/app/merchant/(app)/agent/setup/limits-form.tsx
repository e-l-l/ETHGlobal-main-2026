"use client";

import { useState } from "react";
import type { AgentLimitsVM, LadderStepVM } from "@repo/sdk";
import { ActionBar, Button, Card, Chips, Columns, Label, SettingRow, Stack, Switch, Text } from "@/final";
import { HeroBlock, HeroLabel } from "../../../_ui";
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
  const [supplier, setSupplier] = useState(true);

  // Caps above the current tier can't be picked; fall back to the tier cap.
  const pick = (v: string) => (Number(v) <= cap ? setPerAdvance(v) : undefined);

  return (
    <Columns ratio="3:2">
      <PrivateMark>
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
            <div className="border-t border-hairline pt-4">
              <SettingRow title="Pay my supplier directly" hint="Advances go straight to your supplier, in pesos.">
                <Switch checked={supplier} onCheckedChange={setSupplier} aria-label="Pay my supplier directly" />
              </SettingRow>
            </div>
          </Card>
        </Stack>
      </PrivateMark>

      <Stack gap="md" className="md:sticky md:top-24">
        <HeroBlock rule={false}>
          <HeroLabel>In plain words</HeroLabel>
          <p className="m-0 font-display text-h2 text-canvas">
            Your agent can draw up to <span className="text-lime">{formatMoney(Number(perAdvance))} at a time</span> and{" "}
            <span className="text-lime">{formatMoney(Number(perMonth))} a month</span>, for {purpose}
            {supplier ? ", paid straight to your supplier" : ""}.
          </p>
          <Text className="text-honeydew">Only when your sales can repay it. The contract blocks anything past these limits.</Text>
          <div className="grid grid-cols-2 gap-4 border-t border-honeydew/25 pt-4 font-body text-note">
            <div className="flex flex-col">
              <span className="text-honeydew">Paid back from</span>
              <span className="font-semibold text-canvas">A share of each sale</span>
            </div>
            <div className="flex flex-col">
              <span className="text-honeydew">Fee</span>
              <span className="font-semibold text-canvas">One flat fee</span>
            </div>
          </div>
        </HeroBlock>
        <ActionBar hint="One-time approval. Only you can turn the agent on.">
          <Button href={`${routes.agent.approve}?${new URLSearchParams({ perAdvance, perMonth, purpose })}`} width="full">
            Approve with World
          </Button>
        </ActionBar>
      </Stack>
    </Columns>
  );
}
