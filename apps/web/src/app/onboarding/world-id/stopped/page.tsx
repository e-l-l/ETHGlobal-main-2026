import type { Metadata } from "next";
import { WorldStoppedScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Can't borrow with this World ID" };

/** M01b: `checkHuman()` → `eligible: false` with `human_banned` or `human_has_open_advance`. No business steps after it. */
export default async function Page({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return <WorldStoppedScreen reason={reason} />;
}
