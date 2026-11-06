import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { jarViewport } from "@/lib/viewport";
import { TradeScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Trade JAR-J" };
export const viewport = jarViewport("light");

export default async function Page() {
  return <TradeScreen initial={await serverView(q.trade)} />;
}
