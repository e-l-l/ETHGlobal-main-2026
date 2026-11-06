import { cache } from "react";
import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { PayScreen } from "@/screens/pay";

/** One read per request, shared by the tab title and the page. */
const loadShop = cache((shop?: string, name?: string) => serverView(q.payShop(shop, name)));

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ shop?: string; name?: string }> }): Promise<Metadata> {
  const { shop, name } = await searchParams;
  const view = await loadShop(shop, name);
  const shopName = view?.name ?? name;
  return { title: shopName ? `Pay ${shopName}` : "Pay" };
}

/** C01: `?shop=0x…&name=…` is the shop's bytes32 id from its QR (local / sepolia). Mock mode ignores it. */
export default async function Page({ searchParams }: { searchParams: Promise<{ shop?: string; name?: string }> }) {
  const { shop, name } = await searchParams;
  const target = { ...(shop ? { shopId: shop } : {}), ...(name ? { name } : {}) };
  const initial = await loadShop(target.shopId, target.name);
  return <PayScreen initial={initial} target={target} />;
}
