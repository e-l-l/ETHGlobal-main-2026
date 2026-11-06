import type { Metadata } from "next";
import { EarnScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Earn" };

export default function Page() {
  return <EarnScreen />;
}
