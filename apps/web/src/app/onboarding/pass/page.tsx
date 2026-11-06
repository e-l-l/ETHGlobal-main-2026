import type { Metadata } from "next";
import { serverView } from "@/lib/mra";
import { q } from "@/lib/mra-queries";
import { PassScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Business Pass" };

/** M04: `onboarding.pass()`. */
export default async function Page() {
  const initial = await serverView(q.pass);
  return <PassScreen initial={initial} />;
}
