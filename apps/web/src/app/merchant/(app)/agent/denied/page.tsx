import { BlockPanel } from "@/blocks";
import { ActionBar, Button, Card, Heading, KeyValue, Label, Page, Text } from "@/final";
import { routes } from "@/lib/routes";
import { CardTitle } from "../../../_ui";

/**
 * M09 Agent not set up: the World approval was declined, expired or turned off. Nothing moved.
 * `?reason=expired`: the World request timed out before it was answered.
 */
export default async function AgentDeniedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const expired = (await searchParams).reason === "expired";
  return (
    <Page width="narrow" tabs dense className="md:justify-center">
      <BlockPanel seed={9} dim={78} cols={6} rows={5} bodyClassName="gap-2 p-5 md:p-6">
        <Label className="text-lime">{expired ? "World approval expired" : "World approval cancelled"}</Label>
        <Heading level={1} className="text-canvas">{expired ? "Time ran out. Try again." : "No agent set up. Nothing will be drawn."}</Heading>
        <Text className="text-honeydew">
          {expired ? (
            <>
              The World request expired before it was approved. Nothing happened: no agent, no limits. Start again and approve it in
              World App before the timer ends.
            </>
          ) : (
            <>
              The approval was declined or timed out. Nothing happened: your shop and QR still work, you just won&rsquo;t get
              advances until the agent is on.
            </>
          )}
        </Text>
      </BlockPanel>
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
