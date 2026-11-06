import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { ManageAgentScreen } from "./screen";

export default async function ManageAgentPage() {
  return <ManageAgentScreen initial={await serverView(q.agentStatus)} />;
}
