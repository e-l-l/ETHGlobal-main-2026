import type { Metadata } from "next";
import { PortalLogin } from "@/screens/portal";

export const metadata: Metadata = { title: "Demo Seller Portal · Log in" };

export default function Page() {
  return <PortalLogin />;
}
