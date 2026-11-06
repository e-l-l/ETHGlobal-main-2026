import { Page, PageHead } from "@/final";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { routes } from "@/lib/routes";
import { LimitsForm } from "./limits-form";

/** M07 Agent setup: `agent.setupOptions()` + the limits ladder (`merchant.repaid()`). */
export default async function AgentSetupPage() {
  const initial = await serverView(q.agentSetupPage);
  return (
    <Page width="narrow" tabs>
      <PageHead back={routes.merchant} backLabel="Home" label="Cash-flow agent" title="Set your agent's limits.">
        It can only draw inside these. You approve once with World.
      </PageHead>
      <LimitsForm initial={initial} />
    </Page>
  );
}
