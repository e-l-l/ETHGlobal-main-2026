import type { Metadata } from "next";
import { getLang } from "@/lib/lang";
import { jarViewport } from "@/lib/viewport";
import { VerifyingScreen } from "@/screens/onboarding-client";

export const metadata: Metadata = { title: "Checking privately" };
export const viewport = jarViewport("dark");

export default async function Page({ searchParams }: { searchParams: Promise<{ outcome?: string }> }) {
  const { outcome } = await searchParams;
  return <VerifyingScreen lang={await getLang()} outcome={outcome} />;
}
