"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentApproveView, AgentSetupStep } from "@repo/sdk";
import { ActionBar, Banner, Button, Card, DemoBadge, Heading, Ledger, LockIcon, OfferDisclosure, Page, Text } from "@/final";
import { capitalize, formatMoney, formatPercent } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q, type AgentLimitsInput } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";
import { ApproveMarks } from "./marks";

const STEP_LABEL: Record<AgentSetupStep, string> = {
  creating_agent: "Creating your agent",
  awaiting_agent_pass: "Waiting for World approval",
  proving_credential: "Proving your pass privately",
  registering_mandate: "Registering your limits onchain",
  activating: "Turning it on",
  done: "Done",
};

/**
 * M08 Approve: `agent.approveView(limits)`, then (live modes) `agent.setup(limits, { onStep })`: World Agent Pass
 * (mock adapter with the backend's WORLD_MOCK=1), a private credential proof, the owner's mandate signature and the
 * relayed registerMandate. `active` → M10 Home, `denied` / `expired` → M09. Mock mode keeps the plain link.
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
  const setup = useMRAAction((m, l: AgentLimitsInput) => m.agent.setup(l, { onStep: setStep, ...(outcome ? { mockOutcome: outcome } : {}) }));
  if (!data) return <MRAState error={error} />;
  const { advance, agentLimits } = data;

  const approve = () => {
    setup.run(limits ?? agentLimits).then(
      (r) => router.push(r.status === "active" ? routes.merchant : routes.agent.denied),
      () => undefined,
    );
  };

  return (
    <Page width="narrow" className="justify-center">
      <Card padding="lg" className="shadow-lift">
        <span className="grid size-12 place-items-center rounded-full bg-honeydew text-hunter" aria-hidden>
          <LockIcon size={24} />
        </span>
        <Heading level={1} size="h2">
          Approve your agent once.
        </Heading>
        <DemoBadge>World test mode</DemoBadge>
        <Text>This is a one-time World Agent Pass approval. Only you can turn the agent on. The recipient is your registered payout address; the purpose is not enforced onchain.</Text>
        <Text size="note">Illustrative terms at your maximum per-draw limit; future offers may differ. Mandate expires after 90 days.</Text>
        <OfferDisclosure principal={advance.drawn} fee={advance.fee} total={advance.total} holdback={advance.holdback} estimates={[100, 200, 400].map((sales, i) => ({ label: ["Slow ($100/day)", "Normal ($200/day)", "Busy ($400/day)"][i]!, days: Math.ceil(advance.total / (sales * advance.holdback / 100)) }))} />
        <ApproveMarks
          rows={[
            ["Max per advance", formatMoney(agentLimits.perAdvance)],
            ["Max per month", formatMoney(agentLimits.perMonth)],
            ["Draws for", capitalize(agentLimits.purpose)],
          ]}
          publicRows={[["Repaid from", `${formatPercent(advance.holdback)} of each sale`]]}
        />
        {setup.pending && step ? <Ledger role="status">{STEP_LABEL[step]}…</Ledger> : null}
        {setup.error ? <Banner tone="risk">Not approved ({setup.error}). Nothing was drawn.</Banner> : null}
        <ActionBar>
          {isMock ? (
            <Button href={routes.merchant}>Approve in World test mode</Button>
          ) : (
            <Button onClick={approve} loading={setup.pending}>
              Approve in World test mode
            </Button>
          )}
          <Button href={routes.agent.denied} variant="ghost">
            Not now
          </Button>
        </ActionBar>
      </Card>
    </Page>
  );
}
