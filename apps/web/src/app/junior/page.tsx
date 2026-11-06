import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { JuniorScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Junior" };

/** J01 Junior: `lender.junior.overview()`. */
export default async function Page() {
  return <JuniorScreen initial={await serverView(q.junior)} />;
}
