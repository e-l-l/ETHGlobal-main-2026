import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { jarViewport } from "@/lib/viewport";
import { PayScreen } from "@/screens/pay";

export const metadata: Metadata = { title: "Pay Corner Kiosk" };
export const viewport = jarViewport("light");

export default async function Page() {
  return <PayScreen lang={await getLang()} />;
}
