import type { Metadata } from "next";
import { ExplorerScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Explorer" };

export default function Page() {
  return <ExplorerScreen />;
}
