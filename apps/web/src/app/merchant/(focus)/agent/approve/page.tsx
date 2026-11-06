import { ActionBar, Button, Card, Heading, LockIcon, Page, Text } from "@/final";
import { capitalize, formatMoney, formatPercent } from "@/lib/format";
import { routes } from "@/lib/routes";
import { advance, agentLimits } from "@/lib/mock/shop";
import { ApproveMarks } from "./marks";

/** M08: outside the merchant nav. A centred, dialog-style card. */
export default function ApprovePage() {
  return (
    <Page width="narrow" className="justify-center">
      <Card padding="lg" className="shadow-lift">
        <span className="grid size-12 place-items-center rounded-full bg-honeydew text-hunter" aria-hidden>
          <LockIcon size={24} />
        </span>
        <Heading level={1} size="h2">
          Approve your agent once.
        </Heading>
        <Text>This is a one-time World Agent Pass approval. Only you can turn the agent on.</Text>
        <ApproveMarks
          rows={[
            ["Max per advance", formatMoney(agentLimits.perAdvance)],
            ["Max per month", formatMoney(agentLimits.perMonth)],
            ["Draws for", capitalize(agentLimits.purpose)],
          ]}
          publicRows={[["Repaid from", `${formatPercent(advance.holdback)} of each sale`]]}
        />
        <ActionBar>
          <Button href={routes.merchant}>Approve in World App</Button>
          <Button href={routes.agent.denied} variant="ghost">
            Not now
          </Button>
        </ActionBar>
      </Card>
    </Page>
  );
}
