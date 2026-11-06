"use client";

import { useState } from "react";
import { ActionBar, Banner, Button, Card, Label, ListRow, RowList, SettingRow, Stack, Switch, Text } from "@/final";
import { capitalize, formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { agentLimits } from "@/lib/mock/shop";
import { PrivateMark } from "../_parts";

export function ManageForm() {
  const [paused, setPaused] = useState(false);
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
          <Button href={routes.agent.denied} variant="danger" width="auto">
            Turn off agent
          </Button>
        </div>
      </Card>
      <ActionBar>
        <Button href={routes.agent.log}>Save changes</Button>
      </ActionBar>
    </Stack>
  );
}
