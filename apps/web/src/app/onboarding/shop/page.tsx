import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { jarViewport } from "@/lib/viewport";
import { ShopScreen } from "@/screens/onboarding-client";

export const metadata: Metadata = { title: "Name your shop" };
export const viewport = jarViewport("dark");

export default async function Page() {
  return <ShopScreen lang={await getLang()} />;
}
