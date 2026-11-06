"use client";

import { useState } from "react";
import type { AgentSetupView } from "@repo/sdk";
import { AgentPermissions } from "@/components/domain";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Button, Card, Eyebrow, Heading } from "@/components/ui";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";
import { LimitsForm, type LimitsDraft } from "./limits-form";

function approveHref(d: LimitsDraft, fallbackPurpose: string) {
  const sp = new URLSearchParams({
    perAdvance: String(d.perAdvance),
    perMonth: String(d.perMonth),
    purpose: d.purposes[0] ?? fallbackPurpose,
  });
  return `${routes.agent.approve}?${sp}`;
}

/** M07 Agent setup: `agent.setupOptions()`. The chosen limits go to M08 in the URL. */
export function AgentSetupScreen({ initial }: { initial: AgentSetupView | null }) {
  const { data, error } = useMRA(q.agentSetup, { initial });
  const [draft, setDraft] = useState<LimitsDraft | undefined>(
    initial
      ? { perAdvance: initial.agentLimits.perAdvance, perMonth: initial.agentLimits.perMonth, purposes: [initial.agentLimits.purpose] }
      : undefined,
  );
  if (!data) return <MRAState error={error} />;
  const value = draft ?? {
    perAdvance: data.agentLimits.perAdvance,
    perMonth: data.agentLimits.perMonth,
    purposes: [data.agentLimits.purpose],
  };

  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>Cash-flow agent</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Set your agent&rsquo;s <Accent>limits</Accent>.
          </Heading>
        }
      />

      <TwoColumn
        main={<LimitsForm options={data} value={value} onChange={setDraft} />}
        side={
          <>
            <Card>
              <AgentPermissions
                canTitle="Your agent can"
                neverTitle="It can never"
                can={data.permissions.can}
                never={data.permissions.never}
              />
            </Card>
            <div>
              <Button href={approveHref(value, data.agentLimits.purpose)}>Approve with World</Button>
            </div>
          </>
        }
      />
    </>
  );
}
