"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentLogView, AgentStatusView } from "@repo/sdk";
import { ActionBar, AgentStop, Banner, Button, Card, Heading, Page, PageHead, Pill, StatGrid, Text } from "@/final";
import { formatMoney } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";
import { DecisionLog } from "./decision-log";
import { decisions as demoDecisions, decisionsFrom } from "./_data";

type AgentPage = { status: AgentStatusView; log: AgentLogView | null };

const STATUS_PILL: Partial<Record<AgentStatusView["status"], string>> = {
  pending_approval: "Waiting for approval",
  approved: "Approved",
  denied: "Not approved",
  revoked: "Turned off",
  expired: "Expired",
};

/** M14 Agent activity: `agent.status()` + `agent.log()`. Live modes add the demo's "Run agent now". */
export function AgentLogScreen({ initial }: { initial: AgentPage | null }) {
  const { data, error, reload } = useMRA(q.agentPage, { initial });
  if (!data) return <MRAState error={error} />;
  const { status, log } = data;

  if (!log) {
    return (
      <Page width="narrow" tabs>
        <PageHead label="Agent activity" title="No agent yet." />
        <Text>Your agent draws small advances for stock, only inside limits you set. Set it up once, approve it with World.</Text>
        <ActionBar>
          <Button href={routes.agent.setup}>Set up your agent</Button>
        </ActionBar>
      </Page>
    );
  }

  // Mock: the team's example decisions. Live: the agent's real log in the same cards.
  const decisions = isMock ? demoDecisions : decisionsFrom(log.activity, log.agentLimits);
  const drew = isMock ? decisions.filter((d) => d.kind === "drew").length : log.stats.draws;
  const skipped = isMock ? decisions.length - drew : log.stats.skipped;
  const { agentLimits } = log;

  return (
    <Page tabs>
      <PageHead
        label="Agent activity"
        title="Every decision, with its reason."
        actions={
          <>
            {status.active ? (
              <Pill tone="saving" dot>
                Active
              </Pill>
            ) : (
              <Pill tone="locked">{STATUS_PILL[status.status] ?? status.status}</Pill>
            )}
            <Button href={routes.agent.manage} variant="secondary">
              Manage
            </Button>
          </>
        }
      />
      <StatGrid
        items={[
          { label: "Limit per month", value: formatMoney(agentLimits.perMonth), sub: `${formatMoney(agentLimits.perAdvance)} per advance` },
          { label: "Drew", value: drew, sub: "advances" },
          { label: "Held back", value: skipped, sub: "declined, waited or paused" },
        ]}
      />
      <Text>Remaining allowance: {status.remainingAllowance === undefined ? "Unavailable" : formatMoney(status.remainingAllowance)} · Expiry: {status.expiry ? new Date(status.expiry * 1000).toLocaleDateString() : "unavailable"}</Text>
      {status.active ? <AgentStop onDone={reload} /> : null}
      {!isMock && status.active ? <RunAgentNow onDone={reload} /> : null}
      <Heading level={2} size="h2" className="mt-2">
        Decisions
      </Heading>
      {decisions.length > 0 ? (
        <DecisionLog decisions={decisions} />
      ) : (
        <Text size="note" tone="muted">
          No decisions yet. The agent checks your sales on a schedule.
        </Text>
      )}
    </Page>
  );
}

/**
 * Demo only (local / sepolia): make the agent decide now instead of on its schedule,
 * `agent.trigger({ runNow: true })` → POST /agents/{id}/trigger {run_now: true}. A draw sends you Home, where the
 * advance shows up; any other outcome is explained in place.
 */
function RunAgentNow({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [summary, setSummary] = useState<string | undefined>();
  const run = useMRAAction((m) => m.agent.trigger({ runNow: true }));
  return (
    <Card tone="well" gap="sm">
      <Text className="font-semibold text-charcoal">Demo: run the agent now</Text>
      <Text size="note">It normally checks on a schedule. This asks it to decide right away, inside the same limits.</Text>
      <div>
        <Button
          type="button"
          variant="secondary"
          width="auto"
          loading={run.pending}
          onClick={() => {
            setSummary(undefined);
            run.run().then(
              (r) => {
                if (r.action === "drew") router.push(routes.merchant);
                else {
                  setSummary(r.summary ?? (r.triggered ? "The agent will check on its next run." : "Nothing happened."));
                  onDone();
                }
              },
              () => undefined,
            );
          }}
        >
          Run agent now
        </Button>
      </div>
      {summary ? <Banner>{summary}</Banner> : null}
      {run.error ? <Banner tone="caution">Couldn&rsquo;t run the agent ({run.error}).</Banner> : null}
    </Card>
  );
}
