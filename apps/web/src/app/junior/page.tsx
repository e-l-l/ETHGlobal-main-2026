import type { Metadata } from "next";
import { jarViewport } from "@/lib/viewport";
import { JuniorScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Junior" };
export const viewport = jarViewport("light");

export default function Page() {
  return <JuniorScreen />;
}
