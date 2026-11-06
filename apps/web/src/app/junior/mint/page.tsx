import type { Metadata } from "next";
import { MintScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Mint or redeem JAR-J" };

export default function Page() {
  return <MintScreen />;
}
