"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentApproveView, AgentSetupStep } from "@repo/sdk";
import { ActionBar, Banner, Button, DemoBadge, Ledger, LockIcon, OfferDisclosure, Page, Text } from "@/final";
import { BlockPanel } from "@/blocks";
import { HeroLabel } from "../../../_ui";
import { capitalize, formatMoney, formatPercent } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q, type AgentLimitsInput } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { agentDeniedHref, routes } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";
import { WORLD_MODE, useWorldPrompt } from "@/lib/world-prompt";
import { AgentPassWait } from "../../../_world";
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
 * relayed registerMandate. `active` → M10 Home, `denied` → M09, `expired` → M09 ?reason=expired. Mock mode keeps the
 * plain link. NEXT_PUBLIC_WORLD_MODE=real shows the World QR, user code and countdown while `awaiting_agent_pass`.
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
  /* NEXT_PUBLIC_WORLD_MODE=real: the device-flow QR / code / deadline, published by lib/mra-browser. */
  const worldPrompt = useWorldPrompt("agent-pass");
  if (!data) return <MRAState error={error} />;
  const { advance, agentLimits } = data;
  const worldReal = WORLD_MODE === "real";
  const waitingOnWorld = setup.pending && step === "awaiting_agent_pass" && worldPrompt;

  const approve = () => {
    setup.run(limits ?? agentLimits).then(
      (r) =>
        router.push(r.status === "active" ? routes.merchant : r.status === "expired" ? agentDeniedHref("expired") : routes.agent.denied),
      () => undefined,
    );
  };

  return (
    <Page dense className="justify-center">
      <section className="mx-auto flex w-full max-w-140 flex-col overflow-hidden rounded-lg border border-hairline bg-surface shadow-lift lg:max-w-250 lg:grid lg:grid-cols-[5fr_7fr]">
        <BlockPanel seed={5} dim={76} cols={6} rows={8} className="rounded-none" bodyClassName="gap-4 p-5 md:gap-5 md:p-7 lg:justify-center">
          <span className="grid size-12 place-items-center rounded-full bg-lime text-charcoal" aria-hidden>
            <LockIcon size={24} />
          </span>
          <HeroLabel>World Agent Pass · one time</HeroLabel>
          <h1 className="m-0 font-display text-h1-sm text-canvas md:text-h1">Approve your agent once.</h1>
          <Text className="text-honeydew">
            Only you can turn the agent on. It can never draw past these limits. The recipient is your registered payout address; the
            purpose is not enforced onchain.
          </Text>
        </BlockPanel>
        <div className="flex flex-col gap-4 p-5 md:p-6 lg:gap-3">
          {worldReal ? null : <DemoBadge>World test mode</DemoBadge>}
          <Text size="note">Illustrative terms at your maximum per-draw limit; future offers may differ. Mandate expires after 90 days.</Text>
          <OfferDisclosure
            principal={advance.drawn}
            maxFeeBps={advance.maxFeeBps}
            feeIfRepaidIn2Weeks={advance.feeIfRepaidIn2Weeks}
            annualizedCostPercent={advance.annualizedCostPercent}
            holdback={advance.holdback}
            estimates={[100, 200, 400].map((sales, i) => ({
              label: ["Slow ($100/day)", "Normal ($200/day)", "Busy ($400/day)"][i]!,
              days: Math.ceil(advance.owedNow / ((sales * advance.holdback) / 100)),
            }))}
          />
          <ApproveMarks
            rows={[
              ["Max per advance", formatMoney(agentLimits.perAdvance)],
              ["Max per month", formatMoney(agentLimits.perMonth)],
              ["Draws for", capitalize(agentLimits.purpose)],
            ]}
            publicRows={[["Paid back from", `${formatPercent(advance.holdback)} of each payment`]]}
          />
          {waitingOnWorld ? <AgentPassWait prompt={waitingOnWorld} /> : null}
          {setup.pending && step ? <Ledger role="status">{STEP_LABEL[step]}…</Ledger> : null}
          {setup.error ? <Banner tone="risk">Not approved ({setup.error}). Nothing was drawn.</Banner> : null}
          <ActionBar>
            {isMock ? (
              <Button href={routes.merchant}>Approve in World test mode</Button>
            ) : (
              <Button onClick={approve} loading={setup.pending}>
                {worldReal ? "Continue with World" : "Approve in World test mode"}
              </Button>
            )}
            <Button href={routes.agent.denied} variant="ghost">
              Not now
            </Button>
          </ActionBar>
        </div>
      </section>
    </Page>
  );
}
