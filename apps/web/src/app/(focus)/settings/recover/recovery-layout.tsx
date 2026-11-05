import type { ReactNode } from "react";
import { Brand } from "@/components/layout";
import { Text } from "@/components/ui";

/**
 * Onboarding-style split for M20: ink rail on desktop, a compact top block on mobile.
 * Local to this route so it doesn't touch Person B's OnboardingShell.
 */
export function RecoveryLayout({ title, note, children }: { title: ReactNode; note: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper md:flex-row">
      <aside className="surface-ink hidden w-80 shrink-0 flex-col gap-6 p-7 md:flex">
        <Brand />
        <div className="flex flex-col gap-3">
          <h2 className="text-title text-fg">{title}</h2>
          <Text size="small">{note}</Text>
        </div>
      </aside>
      <div className="flex min-h-11 items-center px-4 pt-4 md:hidden">
        <Brand />
      </div>
      <main className="mx-auto flex w-full max-w-column flex-col gap-6 px-4 py-8 md:px-5 md:py-12">{children}</main>
    </div>
  );
}
