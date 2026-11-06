import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { jarViewport } from "@/lib/viewport";
import { PassScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Business Pass" };
export const viewport = jarViewport("dark");

export default async function Page() {
  return <PassScreen lang={await getLang()} />;
}
