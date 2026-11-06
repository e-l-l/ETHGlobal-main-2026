import type { Metadata } from "next";
import { JuniorScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "Junior" };

export default function Page() {
  return <JuniorScreen />;
}
