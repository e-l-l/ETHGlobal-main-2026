import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { jarViewport } from "@/lib/viewport";
import { DepositScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Deposit or withdraw" };
export const viewport = jarViewport("light");

export default async function Page({ searchParams }: { searchParams: Promise<{ side?: string }> }) {
  const [{ side }, initial] = await Promise.all([searchParams, serverView(q.deposit)]);
  return <DepositScreen side={side} initial={initial} />;
}
