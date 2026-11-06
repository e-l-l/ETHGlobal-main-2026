"use client";

import { useId } from "react";
import type { AgentSetupView } from "@repo/sdk";
import { Card, ChoiceChips, Label, NumberStepper, SegmentedControl } from "@/components/ui";
import { formatMoney } from "@/lib/format";

export type LimitsDraft = { perAdvance: number; perMonth: number; purposes: string[] };

/** The three limits, from `agent.setupOptions()`. Controlled, so the choice can go on to M08. */
export function LimitsForm({
  options,
  value,
  onChange,
}: {
  options: AgentSetupView;
  value: LimitsDraft;
  onChange: (next: LimitsDraft) => void;
}) {
  const perAdvanceId = useId();
  const purposeId = useId();
  const perAdvanceChoices = options.perAdvanceOptions.map((o) => ({
    value: String(o.value),
    label: formatMoney(o.value),
    disabled: !!o.lockedReason,
    disabledReason: o.lockedReason,
  }));
  const purposeChoices = options.purposes.map((p) => ({ value: p, label: p }));
  const { step, min, max } = options.perMonthStepper;

  return (
    <>
      <Card>
        <Label id={perAdvanceId}>Max per advance</Label>
        <SegmentedControl
          aria-labelledby={perAdvanceId}
          value={String(value.perAdvance)}
          onValueChange={(v) => onChange({ ...value, perAdvance: Number(v) })}
          options={perAdvanceChoices}
        />
      </Card>
      <Card>
        <NumberStepper
          label="Max per month"
          value={value.perMonth}
          onValueChange={(perMonth) => onChange({ ...value, perMonth })}
          step={step}
          min={min}
          max={max}
          format={formatMoney}
          decrementLabel="Less"
          incrementLabel="More"
        />
      </Card>
      <Card>
        <Label id={purposeId}>What it can draw for</Label>
        <ChoiceChips
          aria-labelledby={purposeId}
          defaultValue={value.purposes}
          onValueChange={(purposes) => onChange({ ...value, purposes })}
          options={purposeChoices}
        />
      </Card>
    </>
  );
}
