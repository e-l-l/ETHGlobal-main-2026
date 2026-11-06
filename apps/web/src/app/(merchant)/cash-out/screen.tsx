"use client";

import { useState } from "react";
import type { CashOutView } from "@repo/sdk";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Eyebrow, Heading, Label, Mono, OptionCard, OptionGroup } from "@/components/ui";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { useMRA } from "@/lib/use-mra";
import { AmountCard } from "./amount-card";

/** M18 Cash out: `merchant.cashOutView()`, then `merchant.cashOut(amount, destination)`. */
export function CashOutScreen({ initial }: { initial: CashOutView | null }) {
  const { data, error } = useMRA(q.cashOut, { initial });
  const [destination, setDestination] = useState<string | undefined>(initial?.defaultDestination);
  if (!data) return <MRAState error={error} />;
  const selected = destination ?? data.defaultDestination;
  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>Cash out</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Move your <Accent>dollars</Accent>.
          </Heading>
        }
      />

      <TwoColumn
        ratio="2:3"
        main={<AmountCard view={data} destination={selected} />}
        side={
          <div className="flex flex-col gap-3">
            <Label id="send-to">Send to</Label>
            <OptionGroup aria-labelledby="send-to" value={selected} onValueChange={setDestination}>
              {data.destinations.map((d) => (
                <OptionCard
                  key={d.value}
                  value={d.value}
                  title={d.title}
                  description={d.description}
                  selectedLabel="selected"
                />
              ))}
            </OptionGroup>
            <Mono>demo: transfers are simulated</Mono>
          </div>
        }
      />
    </>
  );
}
