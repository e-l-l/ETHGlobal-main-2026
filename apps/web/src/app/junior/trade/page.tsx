import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { TradeScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Trade JAR-J" };

/** J03 Trade: `lender.junior.trade()`. */
export default async function Page() {
  return <TradeScreen initial={await serverView(q.trade)} />;
}
