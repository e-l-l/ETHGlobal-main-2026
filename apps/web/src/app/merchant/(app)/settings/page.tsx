import type { Metadata } from "next";
import { SettingsScreen } from "./screen";

export const metadata: Metadata = { title: "Settings" };

/** Settings: local currency (this device), and a link to Back up with World ID. */
export default function SettingsPage() {
  return <SettingsScreen />;
}
