import { Page, PageHead } from "@/final";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { routes } from "@/lib/routes";
import { ManageForm } from "./manage-form";

/** M15 Manage agent: `agent.status()`; turning it off is `agent.revoke()`. */
export default async function ManageAgentPage() {
  const initial = await serverView(q.agentStatus);
  return (
    <Page width="narrow" tabs>
      <PageHead back={routes.agent.log} backLabel="Agent activity" label="Manage agent" title="Your agent, your rules." />
      <ManageForm initial={initial} />
    </Page>
  );
}
