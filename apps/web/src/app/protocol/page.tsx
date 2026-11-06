import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { jarViewport } from "@/lib/viewport";
import { ProtocolScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Protocol" };
export const viewport = jarViewport("light");

export default async function Page() {
  return <ProtocolScreen initial={await serverView(q.protocol)} />;
}
