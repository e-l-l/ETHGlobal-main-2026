import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { AdvanceDetailsScreen } from "./screen";

export default async function Page() {
  return <AdvanceDetailsScreen initial={await serverView(q.advance)} />;
}
