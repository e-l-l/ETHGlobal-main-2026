import { ActionBar, Button, Card, Heading, KeyValue, Label, Page, Text } from "@/final";
import { routes } from "@/lib/routes";
import { CardTitle } from "../../../_ui";

/** M09 Agent not set up: the World approval was declined, expired or turned off. Nothing moved. */
export default function AgentDeniedPage() {
  return (
    <Page width="narrow" tabs className="md:justify-center">
      <div className="flex flex-col gap-2">
        <Label className="text-caution">World approval cancelled</Label>
        <Heading level={1}>No agent set up. Nothing will be drawn.</Heading>
        <Text>
          The approval was declined or timed out. Nothing happened: your shop and QR still work, you just won&rsquo;t get
          advances until the agent is on.
        </Text>
      </div>
      <Card padding="lg">
        <CardTitle>Where things stand</CardTitle>
        <KeyValue
          rows={[
            ["Agent", "Not active"],
            ["Advances", "Off"],
            ["Your QR", "Working"],
            ["Payments", "Still coming in"],
          ]}
        />
      </Card>
      <ActionBar>
        <Button href={routes.agent.approve}>Try again with World</Button>
        <Button href={routes.agent.setup} variant="secondary">
          Change limits
        </Button>
      </ActionBar>
    </Page>
  );
}
