import { ActionBar, Button, Card, Heading, KeyValue, Page, Text } from "@/final";
import { routes } from "@/lib/routes";

export default function AgentDeniedPage() {
  return (
    <Page width="narrow" tabs>
      <Heading level={1}>No agent set up. Nothing was drawn.</Heading>
      <Text>
        The approval was declined or expired. Nothing happened: your shop and QR still work, you just won&rsquo;t get
        advances until the agent is on.
      </Text>
      <Card>
        <KeyValue
          rows={[
            ["Agent", "Not active"],
            ["Advances", "Off"],
            ["Your QR", "Working"],
            ["Sales", "Still 100% yours"],
          ]}
        />
      </Card>
      <ActionBar>
        <Button href={routes.agent.approve}>Try again</Button>
        <Button href={routes.agent.setup} variant="secondary">
          Change limits
        </Button>
      </ActionBar>
    </Page>
  );
}
