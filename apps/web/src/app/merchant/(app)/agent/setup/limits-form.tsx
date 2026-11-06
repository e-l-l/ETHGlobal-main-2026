"use client";

import { useState } from "react";
import { ActionBar, Button, Card, Chips, Label, SettingRow, Stack, Switch, Text } from "@/final";
import { formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { agentLimits, currentTier, limitsLadder } from "@/lib/mock/shop";
import { PrivateMark } from "../_parts";
import { perMonthOptions, purposes } from "../_data";

const lockedCaps = limitsLadder.filter((_, i) => i > currentTier);
const cap = limitsLadder[currentTier].cap;

/** Local-only state: nothing is saved yet. */
export function LimitsForm() {
  const [perAdvance, setPerAdvance] = useState(String(agentLimits.perAdvance));
  const [perMonth, setPerMonth] = useState(String(agentLimits.perMonth));
  const [purpose, setPurpose] = useState<string>(agentLimits.purpose);
  const [supplier, setSupplier] = useState(true);

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
              {lockedCaps.map((l) => formatMoney(l.cap)).join(" and ")} unlock as you repay. Your limit is{" "}
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
          <Card padding="sm">
            <SettingRow title="Pay my supplier directly" hint="Advances go straight to your supplier, in pesos.">
              <Switch checked={supplier} onCheckedChange={setSupplier} aria-label="Pay my supplier directly" />
            </SettingRow>
          </Card>
        </Stack>
      </PrivateMark>
      <Card tone="tint" gap="sm">
        <Label>In plain words</Label>
        <Text className="text-charcoal">
          Your agent can draw up to {formatMoney(Number(perAdvance))} at a time, and {formatMoney(Number(perMonth))} in a
          month, for {purpose}
          {supplier ? ", paid straight to your supplier" : ""}. Only when your sales can repay it. It can never go past
          these limits: the contract blocks it.
        </Text>
      </Card>
      <ActionBar hint="One-time approval. Only you can turn the agent on.">
        <Button href={routes.agent.approve}>Approve with World</Button>
      </ActionBar>
    </Stack>
  );
}
