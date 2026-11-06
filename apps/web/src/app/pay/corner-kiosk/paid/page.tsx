import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { PaidScreen } from "@/screens/pay";

export const metadata: Metadata = { title: "Paid" };

type Search = { amt?: string; tok?: string; tx?: string; shop?: string; name?: string };

/** C02: the receipt of `pay.pay(...)` arrives in the URL from C01. */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const amount = Number(sp.amt);
  const token = "USDC";
  const target = { ...(sp.shop ? { shopId: sp.shop } : {}), ...(sp.name ? { name: sp.name } : {}) };
  const [lang, initial] = await Promise.all([getLang(), serverView(q.payShop(target.shopId, target.name))]);
  return (
    <PaidScreen
      lang={lang}
      amount={Number.isFinite(amount) && amount > 0 ? amount : 10}
      token={token}
      initial={initial}
      target={target}
      tx={sp.tx && /^0x[0-9a-fA-F]{64}$/.test(sp.tx) ? sp.tx : undefined}
    />
  );
}
