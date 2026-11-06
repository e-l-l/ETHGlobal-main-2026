import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { jarViewport } from "@/lib/viewport";
import { MintScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Mint or redeem JAR-J" };
export const viewport = jarViewport("light");

export default async function Page() {
  return <MintScreen initial={await serverView(q.mint)} />;
}
