import type { Metadata } from "next";
import { WelcomeScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Dollars for stock, today" };

export default async function Page({ searchParams }: { searchParams: Promise<{ mockWorld?: string }> }) {
  const { mockWorld } = await searchParams;
  return <WelcomeScreen mockWorld={mockWorld} />;
}
