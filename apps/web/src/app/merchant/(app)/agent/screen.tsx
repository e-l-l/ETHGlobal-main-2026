"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentLogView, AgentStatusView } from "@repo/sdk";
import { AgentStop, Banner, Button, Card, Columns, Heading, KeyValue, Label, Page, PageHead, Pill, Stack, StatGrid, Text, TextLink } from "@/final";
import { capitalize, formatMoney } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";
import { BigFigure, CardTitle, HeroBlock, HeroLabel, PlainWords } from "../../_ui";
import { PrivateMark } from "./_parts";
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
      <Page tabs>
        <HeroBlock>
          <HeroLabel>Cash-flow agent</HeroLabel>
          <BigFigure as="h1">No agent yet.</BigFigure>
          <Text className="max-w-[56ch] text-honeydew md:text-[17px]">
            Your agent draws small advances for stock, only inside limits you set. Set it up once, approve it with World.
          </Text>
          <div>
            <Button href={routes.agent.setup} variant="lime">
              Set up your agent
            </Button>
          </div>
        </HeroBlock>
        <PlainWords>
          A flat fee, no interest. Each advance is paid back from a small share of your payments, so a slow week just
          takes longer.
        </PlainWords>
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
        label="Cash-flow agent"
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
            <Button href={routes.agent.manage} variant="secondary" size="sm" width="auto">
              Manage
            </Button>
          </>
        }
      />
      <StatGrid
        items={[
          { label: "Limit per month", value: formatMoney(agentLimits.perMonth), sub: `${formatMoney(agentLimits.perAdvance)} per advance` },
          { label: "Drew", value: drew, sub: drew === 1 ? "advance" : "advances" },
          { label: "Held back", value: skipped, sub: "declined, waited or paused" },
        ]}
      />
      <Columns ratio="3:2">
        <Stack>
          <Heading level={2} size="h2">
            Decisions
          </Heading>
          {decisions.length > 0 ? (
            <DecisionLog decisions={decisions} />
          ) : (
            <Card>
              <Text size="note" tone="muted">
                No decisions yet. The agent checks your sales on a schedule.
              </Text>
            </Card>
          )}
        </Stack>
        <Stack gap="lg">
          {status.active ? <AgentStop onDone={reload} /> : null}
          {!isMock && status.active ? <RunAgentNow onDone={reload} /> : null}
          <PrivateMark>
            <Card padding="lg">
              <CardTitle end={<TextLink href={routes.agent.setup}>Edit</TextLink>}>Your limits</CardTitle>
              <KeyValue
                rows={[
                  ["Per advance", formatMoney(agentLimits.perAdvance)],
                  ["Per month", formatMoney(agentLimits.perMonth)],
                  ["For", capitalize(agentLimits.purpose)],
                  ["Remaining allowance", status.remainingAllowance === undefined ? "Unavailable" : formatMoney(status.remainingAllowance)],
                  ["Mandate expiry", status.expiry ? new Date(status.expiry * 1000).toLocaleDateString() : "Unavailable"],
                ]}
              />
            </Card>
          </PrivateMark>
          <PlainWords>
            Your agent only draws when your payments can pay it back, and never past these limits. The contract blocks
            anything else.
          </PlainWords>
        </Stack>
      </Columns>
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
    <Card tone="well" gap="sm" padding="lg">
      <Label>Demo</Label>
      <CardTitle>Run the agent now</CardTitle>
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
