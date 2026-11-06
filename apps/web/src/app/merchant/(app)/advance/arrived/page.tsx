import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { AdvanceArrivedScreen } from "./screen";

/** M11 Advance arrived: `merchant.arrived()`. */
export default async function AdvanceArrivedPage() {
  return <AdvanceArrivedScreen initial={await serverView(q.arrived)} />;
}
