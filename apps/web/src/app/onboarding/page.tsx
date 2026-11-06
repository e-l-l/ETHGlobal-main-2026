import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { WelcomeScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Dollars for stock, today" };

export default async function Page() {
  return <WelcomeScreen lang={await getLang()} />;
}
