import type { Metadata } from "next";
import { jarViewport } from "@/lib/viewport";
import { MintScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Mint or redeem JAR-J" };
export const viewport = jarViewport("light");

export default function Page() {
  return <MintScreen />;
}
