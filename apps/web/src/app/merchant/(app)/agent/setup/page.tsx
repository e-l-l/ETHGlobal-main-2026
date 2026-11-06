import { Page, PageHead } from "@/final";
import { routes } from "@/lib/routes";
import { LimitsForm } from "./limits-form";

export default function AgentSetupPage() {
  return (
    <Page width="narrow" tabs>
      <PageHead back={routes.merchant} backLabel="Home" label="Cash-flow agent" title="Set your agent's limits.">
        It can only draw inside these. You approve once with World.
      </PageHead>
      <LimitsForm />
    </Page>
  );
}
