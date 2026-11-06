import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { JuniorScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Junior" };

/** J01 Junior: `lender.junior.overview()` + the market's view from `lender.riskPanel()`. */
export default async function Page() {
  const [initial, initialPanel] = await Promise.all([serverView(q.junior), serverView(q.riskPanel)]);
  return <JuniorScreen initial={initial} initialPanel={initialPanel} />;
}
