import type { Metadata } from "next";
import { TradeScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Trade JAR-J" };

export default function Page() {
  return <TradeScreen />;
}
