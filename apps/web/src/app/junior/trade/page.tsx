import type { Metadata } from "next";
import { jarViewport } from "@/lib/viewport";
import { TradeScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Trade JAR-J" };
export const viewport = jarViewport("light");

export default function Page() {
  return <TradeScreen />;
}
