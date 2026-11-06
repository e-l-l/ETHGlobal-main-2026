import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { RiskScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Risk" };

/** P03 Risk: `protocol.risk()`. */
export default async function Page() {
  return <RiskScreen initial={await serverView(q.risk)} />;
}
