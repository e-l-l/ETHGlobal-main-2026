import { TabBar, type Tab } from "@/jar/app";
import { I } from "@/jar/app-icons";
import { Lockup } from "@/jar/mark";
import { routes } from "@/lib/routes";

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

export { WalletChip } from "./wallet-chip";
