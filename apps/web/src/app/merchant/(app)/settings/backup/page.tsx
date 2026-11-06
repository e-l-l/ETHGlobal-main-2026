import type { Metadata } from "next";
import { BackupScreen } from "./screen";

export const metadata: Metadata = { title: "Back up with World ID" };

/** Settings → Back up with World ID (`recovery.backup`). Runs on this device only; nothing to load on the server. */
export default function BackupPage() {
  return <BackupScreen />;
}
