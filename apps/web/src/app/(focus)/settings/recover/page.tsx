import { Accent, Button, Card, Heading, Mono, ProgressBar, ProgressSteps, Text } from "@/components/ui";
import { formatPercent } from "@/lib/format";
import { routes } from "@/lib/routes";
import { recovery } from "@/lib/mock/merchant";
import { RecoveryLayout } from "./recovery-layout";

export default function RecoverPage() {
  return (
    <RecoveryLayout title="Recovery" note="Your limit and history come back. Nobody else learns anything.">
      <div className="flex flex-col gap-3">
        <Heading level={1} size="md">
          Bring your shop to this{" "}
          <Accent>
            <span className="md:hidden">phone</span>
            <span className="hidden md:inline">device</span>
          </Accent>
          .
        </Heading>
        <Text size="lead">Prove it&rsquo;s you with World ID, then load your encrypted backup.</Text>
      </div>
      <Card>
        <ProgressSteps steps={recovery.steps.map((s) => ({ label: s.label, status: s.status }))} />
      </Card>
      <div className="flex flex-col gap-3">
        <ProgressBar value={recovery.progress} label="Recovery progress" />
        <Mono>{formatPercent(recovery.progress)} · keep this page open</Mono>
      </div>
      <div>
        <Button href={routes.settings.index} variant="outline">
          Cancel recovery
        </Button>
      </div>
    </RecoveryLayout>
  );
}
