import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { PassScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Business Pass" };

/** M04: `onboarding.pass()`. */
export default async function Page() {
  const [lang, initial] = await Promise.all([getLang(), serverView(q.pass)]);
  return <PassScreen lang={lang} initial={initial} />;
}
