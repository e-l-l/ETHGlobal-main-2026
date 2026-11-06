import type { Metadata } from "next";
import { jarViewport } from "@/lib/viewport";
import { ExplorerScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Explorer" };
export const viewport = jarViewport("light");

export default function Page() {
  return <ExplorerScreen />;
}
