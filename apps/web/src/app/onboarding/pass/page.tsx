import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { PassScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Business Pass" };

export default async function Page() {
  return <PassScreen lang={await getLang()} />;
}
