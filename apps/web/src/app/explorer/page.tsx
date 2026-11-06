import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { ExplorerScreen } from "@/screens/lend/client";

export const metadata: Metadata = { title: "Explorer" };

/** P04 Explorer: `protocol.explorer()`. */
export default async function Page() {
  return <ExplorerScreen initial={await serverView(q.explorer)} />;
}
