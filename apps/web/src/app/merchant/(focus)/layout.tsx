import type { ReactNode } from "react";

/** Focus screens sit outside the merchant nav. Split screens carry the logo in their BrandPanel; others render their own logo-only AppHeader. */
export default function FocusLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
