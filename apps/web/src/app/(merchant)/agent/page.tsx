import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { AgentLogScreen } from "./screen";

export default async function Page() {
  return <AgentLogScreen initial={await serverView(q.agentLog)} />;
}
