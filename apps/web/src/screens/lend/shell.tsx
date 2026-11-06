import { TabBar, type Tab } from "@/jar/app";
import { I } from "@/jar/app-icons";
import { Lockup } from "@/jar/mark";
import { WALLET as DEMO_WALLET } from "@repo/sdk/mock";
import { MRA_ENV, isMock } from "@/lib/mra";
import { routes } from "@/lib/routes";

/** Mock: the SDK's demo wallet. Real modes: the read-only lender account (NEXT_PUBLIC_LENDER_ACCOUNT), if set. */
const WALLET = MRA_ENV.account ?? (isMock ? DEMO_WALLET : undefined);

/* Lender / public bottom nav (anay-design.md section 7): Earn, Junior, Protocol, Risk. */
export const LEND_TABS: Tab[] = [
  { key: "earn", label: "Earn", href: routes.earn, icon: <I.earn /> },
  { key: "junior", label: "Junior", href: routes.junior, icon: <I.layers /> },
  { key: "protocol", label: "Protocol", href: routes.protocol, icon: <I.grid /> },
  { key: "risk", label: "Risk", href: routes.risk, icon: <I.pulse /> },
];

export function LendTabs({ active }: { active: "earn" | "junior" | "protocol" | "risk" }) {
  return <TabBar tabs={LEND_TABS} active={active} label="Lend and public" />;
}

export const lendBrand = <Lockup size={24} />;

export function WalletChip() {
  return (
    <span className="app-chip" style={{ cursor: "default" }} title="Demo wallet. Transfers are simulated.">
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)" }} />
      <span className="sr-only-dj">Demo wallet</span>
      {WALLET ? `${WALLET.slice(0, 6)}…${WALLET.slice(-4)}` : "No wallet"}
    </span>
  );
}
