"use client";

import type { ReactNode, SVGProps } from "react";
import { AppHeader, Banner, CopyHash, Page, WorldMark, type NavItem } from "@/final";
import { MRA_ENV, isMock } from "@/lib/mra";
import { routes } from "@/lib/routes";
import { WALLET } from "@/lib/mock/shop";
import { useMRA } from "@/lib/use-mra";
import { useWorldView } from "@/lib/world-view";

/* Small stroke icons for the phone tab bar (the kit has none for these sections). */
function Svg({ children, ...p }: SVGProps<SVGSVGElement>) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...p}>
      {children}
    </svg>
  );
}
const EarnTabIcon = () => (
  <Svg>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
);
const JuniorTabIcon = () => (
  <Svg>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="m3 13 9 5 9-5" />
  </Svg>
);
const ProtocolTabIcon = () => (
  <Svg>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </Svg>
);
const RiskTabIcon = () => (
  <Svg>
    <path d="M3 12h4l3-7 4 14 3-7h4" />
  </Svg>
);
const ExplorerTabIcon = () => (
  <Svg>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Svg>
);

/** Lender and public nav: one set for every page here. Becomes the phone tab bar. */
export const LEND_NAV: NavItem[] = [
  { key: "earn", label: "Earn", href: routes.earn, icon: <EarnTabIcon /> },
  { key: "junior", label: "Junior", href: routes.junior, icon: <JuniorTabIcon /> },
  { key: "protocol", label: "Protocol", href: routes.protocol, icon: <ProtocolTabIcon /> },
  { key: "risk", label: "Risk", href: routes.risk, icon: <RiskTabIcon /> },
  { key: "explorer", label: "Explorer", href: routes.explorer, icon: <ExplorerTabIcon /> },
];

const burnerAddress = async (m: { wallet: { address(): string | undefined } }) => m.wallet.address() ?? null;

/** The wallet, shortened, with copy. Mock: the demo wallet. Live: this device's burner wallet (or the read-only account). */
export function WalletChip() {
  const { data: burner } = useMRA(burnerAddress, { enabled: !isMock });
  const wallet = isMock ? WALLET : (burner ?? MRA_ENV.account);
  return (
    <span
      className="mr-1 inline-flex items-center gap-1 rounded-chip bg-well pl-3"
      title={isMock ? "Demo wallet. Transfers are simulated." : "Wallet on this device. Sepolia test funds only."}
    >
      <span className="sr-only">{isMock ? "Demo wallet" : "Wallet on this device"}</span>
      {wallet ? <CopyHash value={wallet} short /> : <span className="pr-3 font-ledger text-ledger text-charcoal-muted">No wallet</span>}
    </span>
  );
}

/**
 * Chrome shared by every lender and public page: header with nav, wallet chip and world toggle,
 * then the page container. `note` is what the world-view legend says about this screen.
 */
export function LendShell({ width = "wide", note, children }: { width?: "wide" | "narrow"; note?: string; children: ReactNode }) {
  const wv = useWorldView();
  return (
    <>
      <AppHeader home={routes.home} nav={LEND_NAV} end={<WalletChip />} />
      <Page width={width} tabs>
        {wv && note ? <Banner>{note}</Banner> : null}
        {children}
      </Page>
    </>
  );
}

/** Public onchain content: dashed ONCHAIN outline when "what the world sees" is on. */
export function Pub({ children, className }: { children: ReactNode; className?: string }) {
  const wv = useWorldView();
  return (
    <WorldMark kind="pub" show={wv} className={className}>
      {children}
    </WorldMark>
  );
}
