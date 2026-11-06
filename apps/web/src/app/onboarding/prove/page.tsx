import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { jarViewport } from "@/lib/viewport";
import { ProveScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Prove your business" };
export const viewport = jarViewport("dark");

export default async function Page() {
  return <ProveScreen lang={await getLang()} />;
}
