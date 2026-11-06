import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { ShopScreen } from "@/screens/onboarding-client";

export const metadata: Metadata = { title: "Name your shop" };

export default async function Page() {
  return <ShopScreen lang={await getLang()} />;
}
