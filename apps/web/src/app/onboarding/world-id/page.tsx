import type { Metadata } from "next";
import { WorldIdScreen } from "@/screens/onboarding-client";

export const metadata: Metadata = { title: "Verify with World ID" };

/** M06b: `onboarding.verifyHuman()` after the shop exists, before the first offer. */
export default function Page() {
  return <WorldIdScreen />;
}
