import type { Metadata } from "next";
import { jarViewport } from "@/lib/viewport";
import { RiskScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Risk" };
export const viewport = jarViewport("light");

export default function Page() {
  return <RiskScreen />;
}
