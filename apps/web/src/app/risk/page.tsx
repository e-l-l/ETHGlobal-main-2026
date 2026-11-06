import type { Metadata } from "next";
import { RiskScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Risk" };

export default function Page() {
  return <RiskScreen />;
}
