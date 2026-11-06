import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { RepaidScreen } from "./screen";

/** M16 Repaid: `merchant.repaid()`. */
export default async function RepaidPage() {
  return <RepaidScreen initial={await serverView(q.repaid)} />;
}
