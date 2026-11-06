import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { PositionScreen } from "@/screens/lend/screens";

export const metadata: Metadata = { title: "My position" };

/** L03 Position: `lender.position()`. */
export default async function Page() {
  return <PositionScreen initial={await serverView(q.position)} />;
}
