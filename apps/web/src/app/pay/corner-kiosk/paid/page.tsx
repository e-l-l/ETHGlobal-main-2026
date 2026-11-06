import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { PaidScreen } from "@/screens/pay";

export const metadata: Metadata = { title: "Paid" };

export default async function Page({ searchParams }: { searchParams: Promise<{ amt?: string; tok?: string }> }) {
  const q = await searchParams;
  const amount = Number(q.amt);
  const token = q.tok === "USDC" || q.tok === "DAI" ? q.tok : "USDT";
  return <PaidScreen lang={await getLang()} amount={Number.isFinite(amount) && amount > 0 ? amount : 10} token={token} />;
}
