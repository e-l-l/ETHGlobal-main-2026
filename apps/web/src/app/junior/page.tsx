import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { jarViewport } from "@/lib/viewport";
import { JuniorScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Junior" };
export const viewport = jarViewport("light");

export default async function Page() {
  return <JuniorScreen initial={await serverView(q.junior)} />;
}
