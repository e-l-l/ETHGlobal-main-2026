import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { jarViewport } from "@/lib/viewport";
import { PositionScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "My position" };
export const viewport = jarViewport("light");

export default async function Page() {
  return <PositionScreen initial={await serverView(q.position)} />;
}
