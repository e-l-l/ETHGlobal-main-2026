import type { Metadata } from "next";
import { PortalDashboard } from "@/screens/portal";

export const metadata: Metadata = { title: "Demo Seller Portal" };

export default async function Page({ searchParams }: { searchParams: Promise<{ acct?: string }> }) {
  const { acct } = await searchParams;
  return <PortalDashboard acct={acct} />;
}
