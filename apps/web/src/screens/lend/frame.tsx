import type { ReactNode } from "react";
import { DevNotice, LenderHeader, LenderShell, WalletButton } from "@/components/layout";
import { lenderLinks, type LenderKey } from "@/lib/mock/lend";
import { WALLET } from "@/lib/mock/shop";

export function LenderFrame({ active, children }: { active: LenderKey; children: ReactNode }) {
  return (
    <LenderShell
      notice={<DevNotice>demo: transfers are simulated</DevNotice>}
      header={<LenderHeader links={[...lenderLinks]} active={active} wallet={<WalletButton address={WALLET} />} />}
    >
      {children}
    </LenderShell>
  );
}
