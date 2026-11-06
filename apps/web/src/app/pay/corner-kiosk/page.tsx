import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { PayScreen } from "@/screens/pay";

export const metadata: Metadata = { title: "Pay Corner Kiosk" };

/** C01: `?shop=0x…&name=…` is the shop's bytes32 id from its QR (local / sepolia). Mock mode ignores it. */
export default async function Page({ searchParams }: { searchParams: Promise<{ shop?: string; name?: string }> }) {
  const { shop, name } = await searchParams;
  const target = { ...(shop ? { shopId: shop } : {}), ...(name ? { name } : {}) };
  const [lang, initial] = await Promise.all([getLang(), serverView(q.payShop(target.shopId, target.name))]);
  return <PayScreen lang={lang} initial={initial} target={target} />;
}
