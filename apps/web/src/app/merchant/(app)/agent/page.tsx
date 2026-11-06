import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { AgentLogScreen } from "./screen";

/** M14 Agent activity: `agent.status()` + `agent.log()`. */
export default async function AgentLogPage() {
  return <AgentLogScreen initial={await serverView(q.agentPage)} />;
}
