import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { AdvanceDetailsScreen } from "./screen";

/** M12 Advance details: `merchant.advance()`. */
export default async function AdvanceDetailsPage() {
  return <AdvanceDetailsScreen initial={await serverView(q.advance)} />;
}
