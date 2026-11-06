import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { AdvanceArrivedScreen } from "./screen";

export default async function Page() {
  return <AdvanceArrivedScreen initial={await serverView(q.arrived)} />;
}
