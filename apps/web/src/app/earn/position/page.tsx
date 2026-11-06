import type { Metadata } from "next";
import { jarViewport } from "@/lib/viewport";
import { PositionScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "My position" };
export const viewport = jarViewport("light");

export default function Page() {
  return <PositionScreen />;
}
