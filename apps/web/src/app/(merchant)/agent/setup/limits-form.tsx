"use client";

import { useId, useState } from "react";
import { Card, ChoiceChips, Label, NumberStepper, SegmentedControl } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { agentLimits } from "@/lib/mock/shop";
import { perAdvanceOptions, perMonthStepper, purposes } from "@/lib/mock/merchant";

const perAdvanceChoices = perAdvanceOptions.map((o) => ({
  value: String(o.value),
  label: formatMoney(o.value),
  disabled: "lockedReason" in o,
  disabledReason: "lockedReason" in o ? o.lockedReason : undefined,
}));

const purposeChoices = purposes.map((p) => ({ value: p, label: p }));

/** Local-only state: nothing is saved yet. */
export function LimitsForm() {
  const perAdvanceId = useId();
  const purposeId = useId();
  const [perMonth, setPerMonth] = useState<number>(agentLimits.perMonth);

  return (
    <>
      <Card>
        <Label id={perAdvanceId}>Max per advance</Label>
        <SegmentedControl
          aria-labelledby={perAdvanceId}
          defaultValue={String(agentLimits.perAdvance)}
          options={perAdvanceChoices}
        />
      </Card>
      <Card>
        <NumberStepper
          label="Max per month"
          value={perMonth}
          onValueChange={setPerMonth}
          step={perMonthStepper.step}
          min={perMonthStepper.min}
          max={perMonthStepper.max}
          format={formatMoney}
          decrementLabel="Less"
          incrementLabel="More"
        />
      </Card>
      <Card>
        <Label id={purposeId}>What it can draw for</Label>
        <ChoiceChips
          aria-labelledby={purposeId}
          defaultValue={[agentLimits.purpose]}
          options={purposeChoices}
        />
      </Card>
    </>
  );
}
