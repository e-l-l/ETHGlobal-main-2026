import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { AgentSetupScreen } from "./screen";

export default async function AgentSetupPage() {
  return <AgentSetupScreen initial={await serverView(q.agentSetup)} />;
}
