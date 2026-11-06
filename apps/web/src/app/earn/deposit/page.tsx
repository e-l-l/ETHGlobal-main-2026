import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { DepositScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Deposit or withdraw" };

/** L02 Deposit: `lender.depositView()`, then `lender.deposit / withdraw`. */
export default async function Page({ searchParams }: { searchParams: Promise<{ side?: string }> }) {
  const [{ side }, initial] = await Promise.all([searchParams, serverView(q.deposit)]);
  return <DepositScreen side={side} initial={initial} />;
}
