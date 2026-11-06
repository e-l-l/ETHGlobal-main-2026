import type { Metadata } from "next";
import { WorldIdScreen } from "@/screens/onboarding-client";

export const metadata: Metadata = { title: "Verify with World ID" };

/**
 * Step 1, World ID FIRST (before any business step): `onboarding.checkHuman()`. Eligible → prove business.
 * `?bind=1`: the shop already exists but isn't linked (ticket expired / missing, or an offer came back
 * `human_not_verified`): `checkHuman()` again, then `onboarding.bindHumanTicket()`. No second shop.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ bind?: string }> }) {
  const { bind } = await searchParams;
  return <WorldIdScreen bind={bind === "1"} />;
}
