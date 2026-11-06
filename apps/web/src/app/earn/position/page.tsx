import type { Metadata } from "next";
import { PositionScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "My position" };

export default function Page() {
  return <PositionScreen />;
}
