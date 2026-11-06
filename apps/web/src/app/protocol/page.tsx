import type { Metadata } from "next";
import { ProtocolScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Protocol" };

export default function Page() {
  return <ProtocolScreen />;
}
