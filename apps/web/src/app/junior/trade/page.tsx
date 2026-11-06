import type { Metadata } from "next";
import { TradeScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Trade DRIP-J" };

export default function Page() {
  return <TradeScreen />;
}
