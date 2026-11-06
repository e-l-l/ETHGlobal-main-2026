import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { MintScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Mint or redeem DRIP" };

/** J02 Mint: `lender.junior.mintView()`, then `lender.junior.deposit / withdraw`. */
export default async function Page() {
  return <MintScreen initial={await serverView(q.mint)} />;
}
