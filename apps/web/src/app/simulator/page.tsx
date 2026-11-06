import type { Metadata } from "next";
import { SimulatorScreen } from "@/screens/sim/simulator";

export const metadata: Metadata = { title: "Simulator" };

/** Judge-facing simulator: pick a shop archetype and watch it run on the public devnet. */
export default function Page() {
  return <SimulatorScreen />;
}
