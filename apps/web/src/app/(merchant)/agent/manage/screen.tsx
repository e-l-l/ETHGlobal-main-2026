"use client";

import { useRouter } from "next/navigation";
import type { AgentStatusView } from "@repo/sdk";
import { KeyValueList } from "@/components/data";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Button, Card, Eyebrow, Heading, Label, Mono, SettingRow, Switch, Text } from "@/components/ui";
import { capitalize, formatMoney } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA, useMRAAction } from "@/lib/use-mra";

/** M15 Manage agent: `agent.status()`; the danger button is `agent.revoke()`. */
export function ManageAgentScreen({ initial }: { initial: AgentStatusView | null }) {
  const router = useRouter();
  const { data, error } = useMRA(q.agentStatus, { initial });
  const revoke = useMRAAction((m) => m.agent.revoke());
  if (!data) return <MRAState error={error} />;
  const { agentLimits } = data;

  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>Manage agent</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Your agent, your <Accent>rules</Accent>.
          </Heading>
        }
      />

      <TwoColumn
        main={
          <>
            <Card>
              <Label>Limits</Label>
              <KeyValueList
                items={[
                  { k: "Max per advance", v: formatMoney(agentLimits.perAdvance), href: routes.agent.setup },
                  { k: "Max per month", v: formatMoney(agentLimits.perMonth), href: routes.agent.setup },
                  { k: "Draws for", v: capitalize(agentLimits.purpose), href: routes.agent.setup },
                ]}
              />
            </Card>
            <div>
              <Button href={routes.agent.log}>Save changes</Button>
            </div>
          </>
        }
        side={
          <>
            <Card className="py-1 md:py-2">
              {/* No SDK call for pause yet: UI only. */}
              <SettingRow
                title="Pause agent"
                description="No new draws. Current advance keeps repaying."
                control={({ labelId, descriptionId }) => (
                  <Switch aria-labelledby={labelId} aria-describedby={descriptionId} defaultChecked={false} />
                )}
              />
            </Card>
            <Card>
              <h2 className="text-body font-semibold text-fg">Revoke agent</h2>
              <Text size="small">
                Turns the agent off for good. Setting it up again needs a new World approval.
              </Text>
              <div>
                <Button
                  variant="danger"
                  loading={revoke.pending}
                  onClick={() => {
                    revoke.run().then(
                      () => router.push(routes.agent.denied),
                      () => undefined,
                    );
                  }}
                >
                  Revoke agent
                </Button>
              </div>
              {revoke.error ? <Mono role="alert">Not revoked ({revoke.error})</Mono> : null}
            </Card>
          </>
        }
      />
    </>
  );
}
