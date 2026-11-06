import type { Metadata } from "next";
import { DepositScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Deposit or withdraw" };

export default async function Page({ searchParams }: { searchParams: Promise<{ side?: string }> }) {
  const { side } = await searchParams;
  return <DepositScreen side={side} />;
}
