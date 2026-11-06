import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { EarnScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Vault" };

/** L01 Vault: `lender.overview()` + `lender.riskPanel()` + `lender.waterfall()`. */
export default async function Page() {
  const [initial, initialRisk] = await Promise.all([serverView(q.earn), serverView(q.earnRisk)]);
  return <EarnScreen initial={initial} initialRisk={initialRisk} />;
}
