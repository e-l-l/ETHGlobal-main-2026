import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { jarViewport } from "@/lib/viewport";
import { EarnScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Earn" };
export const viewport = jarViewport("light");

export default async function Page() {
  return <EarnScreen initial={await serverView(q.earn)} />;
}
