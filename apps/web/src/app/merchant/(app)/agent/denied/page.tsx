import { ActionBar, AlertIcon, Button, Card, Heading, KeyValue, Label, LockIcon, Page, Text } from "@/final";
import { routes } from "@/lib/routes";
import { CardTitle } from "../../../_ui";

/**
 * M09 Agent not set up: the World approval was declined, expired or turned off. Nothing moved.
 * `?reason=expired`: the World request timed out before it was answered.
 */
export default async function AgentDeniedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const expired = (await searchParams).reason === "expired";
  return (
    <Page width="narrow" tabs className="md:justify-center">
      <div className="flex flex-col gap-3">
        <span aria-hidden className="grid size-14 place-items-center rounded-full bg-caution-tint text-caution">
          {expired ? <AlertIcon size={26} /> : <LockIcon size={26} />}
        </span>
        <Label className="text-caution">{expired ? "World approval expired" : "World approval cancelled"}</Label>
        <Heading level={1}>{expired ? "Time ran out. Try again." : "No agent set up. Nothing will be drawn."}</Heading>
        <Text>
          {expired ? (
            <>
              World App didn&rsquo;t get an answer before the code expired. Your limits are saved, and no money moved. Start again and
              approve it in World App before the timer ends.
            </>
          ) : (
            <>
              The approval was declined or timed out. Nothing happened: your shop and QR still work, you just won&rsquo;t get advances until
              the agent is on.
            </>
          )}
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
