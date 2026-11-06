import { Page, PageHead } from "@/final";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { routes } from "@/lib/routes";
import { ManageForm } from "./manage-form";

/** M15 Manage agent: `agent.status()`; turning it off is `agent.revoke()`. */
export default async function ManageAgentPage() {
  const initial = await serverView(q.agentStatus);
  return (
    <Page tabs dense>
      <PageHead back={routes.agent.log} backLabel="Agent activity" label="Cash-flow agent" title="Manage your agent" />
      <ManageForm initial={initial} />
    </Page>
  );
}
