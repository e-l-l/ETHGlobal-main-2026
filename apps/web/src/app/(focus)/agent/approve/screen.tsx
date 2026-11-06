"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentApproveView, AgentSetupStep } from "@repo/sdk";
import { KeyValueList } from "@/components/data";
import { Accent, Button, ButtonRow, Dialog, Mono, StatusIcon } from "@/components/ui";
import { capitalize, formatMoney, formatPercent } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q, type AgentLimitsInput } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";

const STEP_LABEL: Record<AgentSetupStep, string> = {
  creating_agent: "Creating your agent",
  awaiting_agent_pass: "Waiting for World approval",
  proving_credential: "Proving your pass privately",
  registering_mandate: "Registering your limits",
  activating: "Turning it on",
  done: "Done",
};

/**
 * M08 Approve: `agent.approveView(limits)`, then `agent.setup(limits, { onStep })`.
 * The result routes: `active` → M10 Home, `denied` / `expired` → M09.
 * Mock demo of M09: `/agent/approve?outcome=deny` (or `expire`).
 */
export function ApproveScreen({
  initial,
  limits,
  outcome,
}: {
  initial: AgentApproveView | null;
  limits: AgentLimitsInput | undefined;
  outcome: "deny" | "expire" | undefined;
}) {
  const router = useRouter();
  const { data, error } = useMRA(q.agentApprove(limits), { initial });
  const [step, setStep] = useState<AgentSetupStep | undefined>();
  const setup = useMRAAction((m, l: AgentLimitsInput) =>
    m.agent.setup(l, { onStep: setStep, ...(isMock && outcome ? { mockOutcome: outcome } : {}) }),
  );
  if (!data) return <MRAState error={error} />;
  const { advance, agentLimits } = data;

  const approve = () => {
    setup.run(limits ?? agentLimits).then(
      (r) => router.push(r.status === "active" ? routes.home : routes.agent.denied),
      () => undefined,
    );
  };

  return (
    <div className="min-h-dvh bg-line-strong">
      <Dialog
        open
        icon={<StatusIcon kind="lock" />}
        title={
          <>
            Approve your agent <Accent>once</Accent>.
          </>
        }
        description="This is a one-time World Agent Pass approval. Only you can turn the agent on."
        actions={
          <ButtonRow>
            <Button onClick={approve} loading={setup.pending} loadingLabel={step ? STEP_LABEL[step] : "Loading"}>
              Approve in World App
            </Button>
            <Button href={routes.agent.denied} variant="outline">
              Not now
            </Button>
          </ButtonRow>
        }
      >
        <KeyValueList
          items={[
            { k: "Max per advance", v: formatMoney(agentLimits.perAdvance) },
            { k: "Max per month", v: formatMoney(agentLimits.perMonth) },
            { k: "Draws for", v: capitalize(agentLimits.purpose) },
            { k: "Repaid from", v: `${formatPercent(advance.holdback)} of each sale` },
          ]}
        />
        {setup.pending && step ? <Mono role="status">{STEP_LABEL[step]}</Mono> : null}
        {setup.error ? <Mono role="alert">Not approved ({setup.error})</Mono> : null}
      </Dialog>
    </div>
  );
}
