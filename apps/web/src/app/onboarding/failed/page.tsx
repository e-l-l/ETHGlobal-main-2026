import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { FailedScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Not verified" };

export default async function Page({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return <FailedScreen lang={await getLang()} reason={reason} />;
}
