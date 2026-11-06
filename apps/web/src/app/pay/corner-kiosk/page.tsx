import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { PayScreen } from "@/screens/pay";

export const metadata: Metadata = { title: "Pay Corner Kiosk" };

export default async function Page() {
  return <PayScreen lang={await getLang()} />;
}
