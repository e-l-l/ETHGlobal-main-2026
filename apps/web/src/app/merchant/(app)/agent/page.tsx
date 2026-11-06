import { Button, Heading, Page, PageHead, Pill, StatGrid } from "@/final";
import { formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { agentLimits } from "@/lib/mock/shop";
import { DecisionLog } from "./decision-log";
import { decisions } from "./_data";

export default function AgentLogPage() {
  const drew = decisions.filter((d) => d.kind === "drew").length;
  const skipped = decisions.length - drew;
  return (
    <Page tabs>
      <PageHead
        label="Agent activity"
        title="Every decision, with its reason."
        actions={
          <>
            <Pill tone="saving" dot>
              Active
            </Pill>
            <Button href={routes.agent.manage} variant="secondary">
              Manage
            </Button>
          </>
        }
      />
      <StatGrid
        items={[
          { label: "Limit per month", value: formatMoney(agentLimits.perMonth), sub: `${formatMoney(agentLimits.perAdvance)} per advance` },
          { label: "Drew", value: drew, sub: "advances" },
          { label: "Held back", value: skipped, sub: "declined, waited or paused" },
        ]}
      />
      <Heading level={2} size="h2" className="mt-2">
        Decisions
      </Heading>
      <DecisionLog />
    </Page>
  );
}
