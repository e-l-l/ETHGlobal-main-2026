import { serverView } from "@/lib/mra";
import { limitsFrom, q } from "@/lib/mra-queries";
import { ApproveScreen } from "./screen";

type Search = { perAdvance?: string; perMonth?: string; purpose?: string; outcome?: string };

/** M08: outside the merchant nav. `agent.approveView(limits)`, then `agent.setup(limits)`. */
export default async function ApprovePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const limits = limitsFrom(sp);
  const outcome = sp.outcome === "deny" || sp.outcome === "expire" ? sp.outcome : undefined;
  return <ApproveScreen initial={await serverView(q.agentApprove(limits))} limits={limits} outcome={outcome} />;
}
