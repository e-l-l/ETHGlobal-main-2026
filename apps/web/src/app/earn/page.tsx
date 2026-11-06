import type { Metadata } from "next";
import { jarViewport } from "@/lib/viewport";
import { EarnScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Earn" };
export const viewport = jarViewport("light");

export default function Page() {
  return <EarnScreen />;
}
