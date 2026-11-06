"use client";

import type { AgentLogView } from "@repo/sdk";
import { ActivityItem, ActivityLog, StatCard, StatGrid } from "@/components/data";
import { PageHeader } from "@/components/layout";
import { Accent, Button, ButtonRow, Card, Eyebrow, Heading, Pill } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { q } from "@/lib/mra-queries";
import { MRAState } from "@/lib/mra-state";
import { routes } from "@/lib/routes";
import { useMRA } from "@/lib/use-mra";

/** M14 Agent log: `agent.log()`. */
export function AgentLogScreen({ initial }: { initial: AgentLogView | null }) {
  const { data, error } = useMRA(q.agentLog, { initial });
  if (!data) return <MRAState error={error} />;
  const { agentLimits, agentSummary, stats, activity } = data;
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
          value={formatMoney(agentSummary.monthUsed)}
          sub={`of ${formatMoney(agentLimits.perMonth)} limit`}
        />
        <StatCard label="Draws" value={stats.draws} sub={`since ${stats.drawsSince}`} />
        <StatCard label="Skipped" value={stats.skipped} sub={stats.skippedReason} />
      </StatGrid>

      <Card padding="md" gap="none" className="py-0">
        <ActivityLog>
          {activity.map((a) => (
            <ActivityItem key={a.id} time={a.time} kind={a.kind} title={a.title} reason={a.reason} />
          ))}
        </ActivityLog>
      </Card>
    </>
  );
}
