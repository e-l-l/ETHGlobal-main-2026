import { Page, PageHead } from "@/final";
import { routes } from "@/lib/routes";
import { ManageForm } from "./manage-form";

export default function ManageAgentPage() {
  return (
    <Page width="narrow" tabs>
      <PageHead back={routes.agent.log} backLabel="Agent activity" label="Manage agent" title="Your agent, your rules." />
      <ManageForm />
    </Page>
  );
}
