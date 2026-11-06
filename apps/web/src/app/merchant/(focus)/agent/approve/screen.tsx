"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { AgentApproveView, AgentSetupStep } from "@repo/sdk";
import { Accent, ActionBar, Banner, BrandPanel, Button, Card, Heading, OfferDisclosure, SplitPage, Steps, Text, TextLink } from "@/final";
import { CardTitle } from "../../../_ui";
import { UnlockMeter } from "../../../_unlock";
import { capitalize, formatMoney, formatPercent } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q, type AgentLimitsInput } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { agentDeniedHref, blockedHref, redlineHref, routes, worldIdHref } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";
import { WORLD_MODE, useWorldPrompt } from "@/lib/world-prompt";
import { AgentPassWait } from "../../../_world";
import { ApproveMarks } from "./marks";

/** The setup steps after "Continue with World", in order; the SDK's `onStep` moves the highlight. */
const SETUP_STEPS: { step: AgentSetupStep; label: string }[] = [
  { step: "awaiting_agent_pass", label: "Approve in World App" },
  { step: "proving_credential", label: "Private credential proof" },
  { step: "registering_mandate", label: "Limits registered onchain" },
  { step: "activating", label: "Agent active" },
];
const STEP_INDEX: Record<AgentSetupStep, number> = {
  creating_agent: 0,
  awaiting_agent_pass: 0,
  proving_credential: 1,
  registering_mandate: 2,
  activating: 3,
  done: 4,
};

/**
 * M08 Approve: `agent.approveView(limits)`, then (live modes) `agent.setup(limits, { onStep })`: World Agent Pass,
 * a private credential proof, the owner's mandate signature and the relayed registerMandate. `active` → Home,
 * `denied` → M09, `expired` → M09 ?reason=expired. World ID red lines route first: banned → blocked,
 * not verified → the onboarding World ID step. NEXT_PUBLIC_WORLD_MODE=real shows the World QR, user code and
 * countdown while `awaiting_agent_pass`.
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
    m.agent.setup(l, {
      onStep: setStep,
      ...(outcome ? { mockOutcome: outcome } : {}),
    }),
  );
  const worldPrompt = useWorldPrompt("agent-pass");

  const redirect = data ? (data.banned ? blockedHref("banned") : data.humanVerified ? undefined : worldIdHref({ bind: true })) : undefined;
  const errorHref = redlineHref(setup.error);
  useEffect(() => {
    const to = redirect ?? errorHref;
    if (to) router.replace(to);
  }, [redirect, errorHref, router]);

  if (!data) return <MRAState error={error} />;
  const { advance, agentLimits } = data;
  const worldReal = WORLD_MODE === "real";
  const waiting = setup.pending && step !== undefined;
  const passPrompt = setup.pending && step === "awaiting_agent_pass" ? worldPrompt : undefined;
  // The first draw is capped by the gradual unlock: suggest at most `availableNow`, and price the offer at that size.
  const firstDraw = data.availableNow > 0 ? Math.min(agentLimits.perAdvance, data.availableNow) : agentLimits.perAdvance;
  const capped = firstDraw < agentLimits.perAdvance;
  const scale = advance.drawn > 0 ? firstDraw / advance.drawn : 1;
  const owed = advance.owedNow * scale;
  const maxFee = (firstDraw * advance.maxFeeBps) / 10_000;

  const approve = () => {
    setup.run(limits ?? agentLimits).then(
      (r) =>
        router.push(r.status === "active" ? routes.merchant : r.status === "expired" ? agentDeniedHref("expired") : routes.agent.denied),
      () => undefined,
    );
  };

  const at = step ? STEP_INDEX[step] : 0;
  const steps = SETUP_STEPS.map((s, i) => ({
    label: s.label,
    state: (i < at ? "done" : i === at ? "current" : "next") as "done" | "current" | "next",
  }));

  return (
    <SplitPage
      panel={
        <BrandPanel
          home={routes.merchant}
          eyebrow={waiting ? (worldReal ? "World Agent Pass · awaiting approval" : "World Agent Pass · test mode") : "Your agent's first advance"}
          title={
            waiting ? (
              <>
                {worldReal ? (
                  <>
                    Approve in <Accent>World App.</Accent>
                  </>
                ) : (
                  <>
                    Approved <Accent>automatically.</Accent>
                  </>
                )}
              </>
            ) : (
              <>
                {formatMoney(firstDraw).replace(/\.00$/, "")} for {agentLimits.purpose}, <Accent>repaid as you sell.</Accent>
              </>
            )
          }
          body={
            waiting
              ? worldReal
                ? "World checks that a real person stands behind this agent. Your name never leaves World App."
                : "Test mode skips the World App check, so there is nothing to scan. In live mode World confirms a real person stands behind this agent."
              : "Your agent asks for an advance when stock runs low, inside the limits you set. The money lands in your account."
          }
        >
          {waiting ? null : (
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {[
                `Advance ${formatMoney(firstDraw)}`,
                `${formatPercent(advance.holdback)} of each payment`,
                `Max fee ${formatMoney(maxFee)}`,
              ].map((chip) => (
                <li key={chip} className="rounded-md border border-honeydew/25 bg-honeydew/10 px-3 py-2 font-body text-note text-honeydew">
                  {chip}
                </li>
              ))}
            </ul>
          )}
        </BrandPanel>
      }
    >
      {waiting ? (
        <>
          <div className="flex flex-col gap-2">
            <Heading level={2} size="h1">
              {worldReal ? "Scan with World App" : "Test mode: approved automatically"}
            </Heading>
            <Text>
              {worldReal ? "Approve the request in World App. This page moves on by itself." : "No World App needed. This page moves on by itself."}
            </Text>
          </div>
          {passPrompt ? <AgentPassWait prompt={passPrompt} /> : null}
          <Card>
            <Steps items={steps} />
          </Card>
          <p role="status" className="sr-only">
            {steps.find((s) => s.state === "current")?.label ?? ""}
          </p>
        </>
      ) : (
        <>
          <TextLink href={routes.agent.setup} className="w-fit text-note">
            ‹ Change limits
          </TextLink>
          <div className="flex flex-col gap-2">
            <Heading level={2} size="h1">
              Approve your agent
            </Heading>
            <Text>Check the terms, then approve with World App. No money moves until you do.</Text>
          </div>
          <Card padding="lg">
            <UnlockMeter
              availableNow={data.availableNow}
              limit={data.limit}
              unlockSteps={data.unlockSteps}
              nextUnlockAt={data.nextUnlockAt}
            />
            {capped ? (
              <Text size="note">
                Your first advance is up to {formatMoney(firstDraw)}. The rest of your {formatMoney(agentLimits.perAdvance)} per-advance limit unlocks as you pay on time.
              </Text>
            ) : null}
          </Card>
          <Card padding="lg">
            <CardTitle>The offer</CardTitle>
            <OfferDisclosure
              principal={firstDraw}
              maxFeeBps={advance.maxFeeBps}
              feeIfRepaidIn2Weeks={advance.feeIfRepaidIn2Weeks * scale}
              annualizedCostPercent={advance.annualizedCostPercent}
              holdback={advance.holdback}
              {...(advance.feeRule ? { feeRule: advance.feeRule } : {})}
              estimates={[100, 200, 400].map((sales, i) => ({
                label: ["Slow ($100/day)", "Normal ($200/day)", "Busy ($400/day)"][i]!,
                days: Math.ceil(owed / ((sales * advance.holdback) / 100)),
              }))}
            />
            <ApproveMarks
              rows={[
                ["Max per advance", capped ? `${formatMoney(agentLimits.perAdvance)} (${formatMoney(firstDraw)} available now)` : formatMoney(agentLimits.perAdvance)],
                ["Max per month", formatMoney(agentLimits.perMonth)],
                ["Draws for", capitalize(agentLimits.purpose)],
              ]}
              publicRows={[["Paid back from", `${formatPercent(advance.holdback)} of each payment`]]}
            />
            <Text size="note">
              Illustrative terms at your maximum per-draw limit; future offers may differ. Mandate expires after 90 days.
            </Text>
          </Card>
          {setup.error && !errorHref ? <Banner tone="risk">Not approved ({setup.error}). Nothing was drawn.</Banner> : null}
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
        </>
      )}
    </SplitPage>
  );
}
