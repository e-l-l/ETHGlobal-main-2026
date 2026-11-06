import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { ProofScreen } from "@/screens/proof";

export const metadata: Metadata = { title: "Verify it yourself" };

/** Proof center: `protocol.proofCenter()`. Checks, contracts, ZK proofs, transactions, AI decisions and privacy, each with a link. */
export default async function Page() {
  return <ProofScreen initial={await serverView(q.proofCenter)} />;
}
