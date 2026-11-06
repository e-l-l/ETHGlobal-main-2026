import type { Metadata } from "next";
import { jarViewport } from "@/lib/viewport";
import { ProtocolScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Protocol" };
export const viewport = jarViewport("light");

export default function Page() {
  return <ProtocolScreen />;
}
