import { jarViewport } from "@/lib/viewport";

export const viewport = jarViewport("portal");

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
