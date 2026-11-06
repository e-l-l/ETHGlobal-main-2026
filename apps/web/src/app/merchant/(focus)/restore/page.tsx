import type { Metadata } from "next";
import { RestoreScreen } from "./screen";

export const metadata: Metadata = { title: "Restore with World ID" };

/** New device: `recovery.restore(passphrase)` → merchant home. Runs on this device only. */
export default function RestorePage() {
  return <RestoreScreen />;
}
