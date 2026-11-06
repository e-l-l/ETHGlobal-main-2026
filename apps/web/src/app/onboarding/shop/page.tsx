import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { jarViewport } from "@/lib/viewport";
import { ShopScreen } from "@/screens/onboarding-client";

export const metadata: Metadata = { title: "Name your shop" };
export const viewport = jarViewport("dark");

export default async function Page() {
  const [lang, initial] = await Promise.all([getLang(), serverView(q.shopDraft)]);
  return <ShopScreen lang={lang} initial={initial} />;
}
