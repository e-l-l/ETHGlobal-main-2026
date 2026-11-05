import { KeyValueList } from "@/components/data";
import { TwoColumn } from "@/components/layout";
import { Accent, Button, ButtonRow, Card, Eyebrow, Heading, StatusIcon, Text } from "@/components/ui";
import { routes } from "@/lib/routes";

export default function AgentDeniedPage() {
  return (
    <TwoColumn
      main={
        <>
          <StatusIcon kind="bad" />
          <div className="flex flex-col gap-3">
            <Heading level={1} size="md">
              No agent set up. Nothing will be <Accent tone="down">drawn</Accent>.
            </Heading>
            <Text size="lead">
              The approval was declined or expired after 10 minutes. Your shop and QR still work; you just
              won&rsquo;t get advances.
            </Text>
          </div>
          <ButtonRow>
            <Button href={routes.agent.approve}>Try approval again</Button>
            <Button href={routes.agent.setup} variant="outline">
              Change limits first
            </Button>
          </ButtonRow>
        </>
      }
      side={
        <Card>
          <Eyebrow tone="muted">Status</Eyebrow>
          <KeyValueList
            items={[
              { k: "Agent", v: "Not active" },
              { k: "Advances", v: "Off" },
              { k: "Your QR", v: "Working" },
              { k: "Sales", v: "Still 100% yours" },
            ]}
          />
        </Card>
      }
    />
  );
}
