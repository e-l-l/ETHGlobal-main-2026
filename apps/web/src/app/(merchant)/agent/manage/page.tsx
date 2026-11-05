import { KeyValueList } from "@/components/data";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Button, Card, Eyebrow, Heading, Label, SettingRow, Switch, Text } from "@/components/ui";
import { capitalize, formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { agentLimits } from "@/lib/mock/shop";

export default function ManageAgentPage() {
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
                <Button href={routes.agent.denied} variant="danger">
                  Revoke agent
                </Button>
              </div>
            </Card>
          </>
        }
      />
    </>
  );
}
