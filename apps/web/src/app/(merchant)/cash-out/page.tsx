import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { CashOutScreen } from "./screen";

export default async function CashOutPage() {
  return <CashOutScreen initial={await serverView(q.cashOut)} />;
}
