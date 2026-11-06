import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { ProtocolScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Protocol" };

/** P02 Protocol: `protocol.stats()`. */
export default async function Page() {
  return <ProtocolScreen initial={await serverView(q.protocol)} />;
}
