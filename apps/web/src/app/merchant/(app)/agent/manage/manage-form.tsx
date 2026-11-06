"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentStatusView } from "@repo/sdk";
import { ActionBar, Banner, Button, Card, Columns, KeyValue, SettingRow, Stack, Switch, Text, TextLink } from "@/final";
import { CardTitle } from "../../../_ui";
import { capitalize, formatMoney } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";

/** M15: `agent.status()`. "Turn off agent" is `agent.revoke()` in live modes. Pause has no SDK call yet: UI only. */
export function ManageForm({ initial }: { initial: AgentStatusView | null }) {
  const router = useRouter();
  const { data, error } = useMRA(q.agentStatus, { initial });
  const revoke = useMRAAction((m) => m.agent.revoke());
  const [paused, setPaused] = useState(false);
  if (!data) return <MRAState error={error} />;
  const { agentLimits } = data;
  const canRevoke = !isMock && data.status !== "none" && data.status !== "revoked";

  return (
    <Columns ratio="3:2">
      <Stack gap="md">
        <Card padding="md">
          <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
          <SettingRow
            title={paused ? "Agent is paused" : "Agent is on"}
            hint={paused ? "No new draws. Your current advance keeps repaying." : "It can draw advances inside your limits."}
          >
            <Switch checked={!paused} onCheckedChange={(on) => setPaused(!on)} aria-label="Agent on" />
          </SettingRow>
          </div>
          </div>
        </Card>
        {paused ? <Banner tone="caution">Paused. Save to stop new draws.</Banner> : null}
        <div>
          <Card padding="md">
            <CardTitle
              end={
                <TextLink href={routes.agent.setup} arrow>
                  Edit limits
                </TextLink>
              }
            >
              Limits
            </CardTitle>
            <KeyValue
              rows={[
                ["Max per advance", formatMoney(agentLimits.perAdvance)],
                ["Max per month", formatMoney(agentLimits.perMonth)],
                ["What it can draw for", capitalize(agentLimits.purpose)],
              ]}
            />
          </Card>
        </div>
        <Text size="note" tone="muted">
          Lowering a limit works right away. Raising one needs a new approval with World.
        </Text>
        <ActionBar>
          <Button href={routes.agent.log}>Save changes</Button>
        </ActionBar>
      </Stack>

      <section className="flex flex-col gap-3 rounded-lg bg-risk-tint p-5 md:p-6 lg:self-start">
        <h2 className="m-0 font-display text-h2 text-risk">Turn off for good</h2>
        <Text size="note" className="text-charcoal-soft">
          Stops all future advances. Your current advance still gets paid back from payments as usual. Setting it up again
          needs a new World approval.
        </Text>
        <div>
          {isMock ? (
            <Button href={routes.agent.denied} variant="danger" width="auto">
              Turn off agent
            </Button>
          ) : (
            <Button
              variant="danger"
              width="auto"
              loading={revoke.pending}
              disabled={!canRevoke}
              onClick={() => {
                revoke.run().then(
                  () => router.push(routes.agent.denied),
                  () => undefined,
                );
              }}
            >
              {data.status === "revoked" ? "Agent is off" : "Turn off agent"}
            </Button>
          )}
        </div>
        {revoke.error ? <Banner tone="risk">Not turned off ({revoke.error}).</Banner> : null}
      </section>
    </Columns>
  );
}
