"use client";

import { useId, type ReactNode, type SVGProps } from "react";
import { AppHeader, CopyHash, JarBandStrip, Label, Page, type NavItem } from "@/final";
import { cn } from "@/lib/cn";
import { MRA_ENV, isMock } from "@/lib/mra";
import { routes } from "@/lib/routes";
import { WALLET } from "@/lib/mock/shop";
import { useMRA } from "@/lib/use-mra";

/* Small stroke icons for the phone tab bar (the kit has none for these sections). */
function Svg({ children, ...p }: SVGProps<SVGSVGElement>) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" {...p}>
      {children}
    </svg>
  );
}
const VaultTabIcon = () => (
  <Svg>
    <path d="M3 17l6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
);
const DripTabIcon = () => (
  <Svg>
    <path d="M12 3s-6.5 7-6.5 11.5a6.5 6.5 0 0 0 13 0C18.5 10 12 3 12 3Z" />
    <path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5" />
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

const SimulatorTabIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5v7l6-3.5z" />
  </Svg>
);

/** Lender and public nav: one set for every page here. Becomes the phone tab bar. */
export const LEND_NAV: NavItem[] = [
  { key: "earn", label: "Vault", href: routes.earn, icon: <VaultTabIcon /> },
  { key: "dripcoin", label: "DripCoin", href: routes.dripcoin, icon: <DripTabIcon /> },
  { key: "protocol", label: "Protocol", href: routes.protocol, icon: <ProtocolTabIcon /> },
  { key: "risk", label: "Risk", href: routes.risk, icon: <RiskTabIcon /> },
  { key: "explorer", label: "Explorer", href: routes.explorer, icon: <ExplorerTabIcon /> },
  { key: "simulator", label: "Simulator", href: routes.simulator, icon: <SimulatorTabIcon /> },
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
 * Chrome shared by every lender and public page: header with nav and wallet chip,
 * then the page container.
 */
export function LendShell({ width = "wide", children }: { width?: "wide" | "narrow"; children: ReactNode }) {
  return (
    <>
      <AppHeader home={routes.home} nav={LEND_NAV} end={<WalletChip />} />
      <Page width={width} tabs>
        {children}
      </Page>
    </>
  );
}

/**
 * The top band on Vault and DripCoin: a Hunter field (a Hunter → Fern sweep on desktop), lime only on the solid
 * Hunter side, and the lime band under it. Full-bleed on phones, a rounded panel in the page column on desktop.
 * `aside` is the one big number (APY, price); it sits on the right, so it stays canvas-coloured.
 */
export function LendHero({
  label,
  title,
  children,
  actions,
  aside,
  sweep,
}: {
  label: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  sweep?: boolean;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="-mx-4 -mt-6 overflow-hidden bg-hunter text-canvas md:mx-0 md:-mt-2 md:rounded-lg">
      <div
        className={cn(
          "flex flex-col gap-8 px-4 pt-8 pb-9 md:flex-row md:items-end md:justify-between md:gap-12 md:px-10 md:pt-12 md:pb-12",
          sweep && "md:bg-linear-110 md:from-hunter md:from-55% md:to-fern",
        )}
      >
        <div className="flex max-w-[620px] min-w-0 flex-col gap-4">
          <Label className="text-lime">{label}</Label>
          <h1 id={id} className="font-display text-hero-sm text-balance text-canvas md:text-hero">
            {title}
          </h1>
          {children ? <p className="max-w-[54ch] font-body text-read text-honeydew">{children}</p> : null}
          {actions ? <div className="mt-2 flex flex-col gap-2 sm:flex-row">{actions}</div> : null}
        </div>
        {aside ? <div className="flex shrink-0 flex-col gap-1 md:items-end md:text-right">{aside}</div> : null}
      </div>
      <JarBandStrip className="rounded-none" />
    </section>
  );
}

/** The dark "your position" card: Charcoal ground, lime figure accents. */
export function DarkCard({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={cn("flex min-w-0 flex-col gap-4 rounded-lg bg-charcoal p-5 text-canvas md:p-6", className)}>
      {children}
    </section>
  );
}
