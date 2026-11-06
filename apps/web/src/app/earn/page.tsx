import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { EarnScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Earn" };

/** L01 Earn: `lender.overview()`. */
export default async function Page() {
  return <EarnScreen initial={await serverView(q.earn)} />;
}
