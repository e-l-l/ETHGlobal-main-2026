import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { jarViewport } from "@/lib/viewport";
import { RiskScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Risk" };
export const viewport = jarViewport("light");

export default async function Page() {
  return <RiskScreen initial={await serverView(q.risk)} />;
}
