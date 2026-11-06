import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { jarViewport } from "@/lib/viewport";
import { ExplorerScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Explorer" };
export const viewport = jarViewport("light");

export default async function Page() {
  return <ExplorerScreen initial={await serverView(q.explorer)} />;
}
