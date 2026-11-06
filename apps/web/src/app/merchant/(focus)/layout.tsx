import type { ReactNode } from "react";
import { AppHeader } from "@/final";
import { routes } from "@/lib/routes";

/** Focus screens sit outside the merchant nav: logo only. */
export default function FocusLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader home={routes.merchant} />
      {children}
    </>
  );
}
