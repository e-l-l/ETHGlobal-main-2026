"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AgentStatusView } from "@repo/sdk";
import { ActionBar, Banner, Button, Card, Label, ListRow, RowList, SettingRow, Stack, Switch, Text } from "@/final";
import { capitalize, formatMoney } from "@/lib/format";
import { isMock } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";
import { PrivateMark } from "../_parts";

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
    <Stack gap="lg">
      <Stack gap="sm">
        <Label>Limits</Label>
        <PrivateMark>
          <RowList label="Agent limits">
            <ListRow href={routes.agent.setup} title="Max per advance" end={formatMoney(agentLimits.perAdvance)} />
            <ListRow href={routes.agent.setup} title="Max per month" end={formatMoney(agentLimits.perMonth)} />
            <ListRow href={routes.agent.setup} title="Draws for" end={capitalize(agentLimits.purpose)} />
          </RowList>
        </PrivateMark>
      </Stack>
      <Card padding="sm">
        <SettingRow title="Pause agent" hint="No new draws. Your current advance keeps repaying.">
          <Switch checked={paused} onCheckedChange={setPaused} aria-label="Pause agent" />
        </SettingRow>
      </Card>
      {paused ? <Banner tone="caution">Paused. Save to stop new draws.</Banner> : null}
      <Card tone="well" gap="sm">
        <Text className="font-semibold text-charcoal">Turn off agent</Text>
        <Text size="note">Turns the agent off for good. Setting it up again needs a new World approval.</Text>
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
      </Card>
      <ActionBar>
        <Button href={routes.agent.log}>Save changes</Button>
      </ActionBar>
    </Stack>
  );
}
