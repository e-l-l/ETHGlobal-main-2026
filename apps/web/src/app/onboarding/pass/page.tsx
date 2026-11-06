import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { jarViewport } from "@/lib/viewport";
import { PassScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Business Pass" };
export const viewport = jarViewport("dark");

export default async function Page() {
  const [lang, pass] = await Promise.all([getLang(), serverView(q.pass)]);
  return <PassScreen lang={lang} pass={pass} />;
}
