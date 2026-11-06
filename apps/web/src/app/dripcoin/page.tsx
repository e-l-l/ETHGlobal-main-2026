import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { DripCoinScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "DripCoin" };

/** J01 DripCoin: `lender.junior.overview()` + the market's view from `lender.riskPanel()` + the fee split from `lender.earn()`. */
export default async function Page() {
  const [initial, initialPanel, initialEarn] = await Promise.all([serverView(q.junior), serverView(q.riskPanel), serverView(q.earn)]);
  return <DripCoinScreen initial={initial} initialPanel={initialPanel} initialEarn={initialEarn} />;
}
