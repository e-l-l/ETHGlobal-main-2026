import { AgentPermissions } from "@/components/domain";
import { PageHeader, TwoColumn } from "@/components/layout";
import { Accent, Button, Card, Eyebrow, Heading } from "@/components/ui";
import { routes } from "@/lib/routes";
import { agentPermissions } from "@/lib/mock/merchant";
import { LimitsForm } from "./limits-form";

export default function AgentSetupPage() {
  return (
    <>
      <PageHeader
        eyebrow={<Eyebrow>Cash-flow agent</Eyebrow>}
        title={
          <Heading level={1} size="lg">
            Set your agent&rsquo;s <Accent>limits</Accent>.
          </Heading>
        }
      />

      <TwoColumn
        main={<LimitsForm />}
        side={
          <>
            <Card>
              <AgentPermissions
                canTitle="Your agent can"
                neverTitle="It can never"
                can={agentPermissions.can}
                never={agentPermissions.never}
              />
            </Card>
            <div>
              <Button href={routes.agent.approve}>Approve with World</Button>
            </div>
          </>
        }
      />
    </>
  );
}
