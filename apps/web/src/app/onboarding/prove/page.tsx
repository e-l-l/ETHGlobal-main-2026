import type { Metadata } from "next";
import { ProveScreen } from "@/screens/onboarding";

export const metadata: Metadata = { title: "Prove your business" };

export default async function Page() {
  return <ProveScreen />;
}
