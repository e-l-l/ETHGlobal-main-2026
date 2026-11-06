import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { ShopScreen } from "@/screens/onboarding-client";

export const metadata: Metadata = { title: "Name your shop" };

/** M06: `onboarding.nameIdeas()`, then `onboarding.createShop(name)`. */
export default async function Page() {
  const initial = await serverView(q.shopDraft);
  return <ShopScreen initial={initial} />;
}
