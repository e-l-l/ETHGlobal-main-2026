import { ActivityItem, ActivityLog, StatCard, StatGrid } from "@/components/data";
import { PageHeader } from "@/components/layout";
import { Accent, Button, ButtonRow, Card, Eyebrow, Heading, Pill } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { agentLimits } from "@/lib/mock/shop";
import { agentActivity, agentStats } from "@/lib/mock/merchant";

export default function AgentLogPage() {
  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>Agent activity</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Every decision, with its <Accent>reason</Accent>.
          </Heading>
        }
        aside={
          <ButtonRow className="flex-row items-center">
            <Pill tone="tint" dot>
              active
            </Pill>
            <Button href={routes.agent.manage} variant="outline" size="sm" fullWidth={false}>
              Manage agent
            </Button>
          </ButtonRow>
        }
      />

      <StatGrid>
        <StatCard
          label="This month"
          value={formatMoney(agentStats.monthUsed)}
          sub={`of ${formatMoney(agentLimits.perMonth)} limit`}
        />
        <StatCard label="Draws" value={agentStats.draws} sub={`since ${agentStats.drawsSince}`} />
        <StatCard label="Skipped" value={agentStats.skipped} sub={agentStats.skippedReason} />
      </StatGrid>

      <Card padding="md" gap="none" className="py-0">
        <ActivityLog>
          {agentActivity.map((a) => (
            <ActivityItem key={a.id} time={a.time} kind={a.kind} title={a.title} reason={a.reason} />
          ))}
        </ActivityLog>
      </Card>
    </>
  );
}
