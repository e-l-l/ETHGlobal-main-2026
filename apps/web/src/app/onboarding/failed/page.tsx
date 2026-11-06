import type { Metadata } from "next";
import { FailedScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Not verified" };

export default async function Page({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return <FailedScreen reason={reason} />;
}
