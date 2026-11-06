"use client";

import { useEffect, useId, useState, type ReactNode, type SVGProps } from "react";
import { AppHeader, CopyHash, JarBandStrip, Label, Page, type NavItem } from "@/final";
import { BlockBand, BlockWall } from "@/blocks";
import { ConnectWallet } from "@/components/connect-wallet";
import { cn } from "@/lib/cn";
import { MRA_ENV, getMRA, isMock } from "@/lib/mra";
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

const VerifyTabIcon = () => (
  <Svg>
    <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" />
    <path d="m9 12 2 2 4-4" />
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
  { key: "proof", label: "Verify", href: routes.proof, icon: <VerifyTabIcon /> },
  { key: "faucet", label: "Faucet", href: routes.faucet, icon: <DripTabIcon /> },
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

const ANON_NET_NAME: Record<string, string> = { nox: "Nox mixnet", "tor-js": "Tor", nym: "Nym mixnet", passthrough: "passthrough" };

/**
 * Where chain reads go: the Anon-RPC mode from lib/mra-browser (loaded lazily, like getMRA does), plus the
 * transport's routed / direct counters when the SDK module exposes them. Nothing in mock mode (no chain reads).
 */
export function PrivateReadsChip() {
  const [text, setText] = useState<string>();
  useEffect(() => {
    if (isMock) return;
    let alive = true;
    let unsub: (() => void) | undefined;
    void (async () => {
      try {
        await getMRA();
        const { MRA_BROWSER_STATUS, getAnonRpc } = await import("@/lib/mra-browser");
        if (!alive) return;
        const mode = MRA_BROWSER_STATUS.anonRpc;
        const net = ANON_NET_NAME[MRA_ENV.anonNetwork] ?? MRA_ENV.anonNetwork;
        const anon = getAnonRpc();
        if (mode !== "anon" || !anon) {
          setText(mode === "fail-closed" ? "Private reads: unavailable (blocked)" : mode === "direct-fallback" ? "Private reads: off (direct RPC)" : "Private reads: off");
          return;
        }
        const show = (c?: { routed: number; direct: number }) => {
          const ok = anon.status().phase === "ready" ? " ✓" : "";
          setText(c ? `Private reads: ${net}${ok} (${c.routed} routed · ${c.direct} direct)` : `Private reads: ${net}${ok}`);
        };
        show(anon.stats?.());
        unsub = anon.onStats?.((c) => alive && show(c));
        const unStatus = anon.onStatus(() => alive && show(anon.stats?.()));
        const prev = unsub;
        unsub = () => {
          prev?.();
          unStatus();
        };
      } catch {
        /* the chip is informational only */
      }
    })();
    return () => {
      alive = false;
      unsub?.();
    };
  }, []);
  if (!text) return null;
  return (
    <span className="mr-1 hidden rounded-chip bg-well px-3 py-1 font-ledger text-tag text-charcoal-muted xl:inline-flex" title={text}>
      {text}
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
      <AppHeader home={routes.home} nav={LEND_NAV} end={<><PrivateReadsChip />{isMock ? <WalletChip /> : <ConnectWallet />}</>} />
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
    <section aria-labelledby={id} className="relative -mx-4 -mt-6 overflow-hidden bg-hunter text-canvas md:mx-0 md:-mt-2 md:rounded-lg">
      {/* Block wall on the right, dimmed under Hunter and fading to solid Hunter toward the copy, so text never sits on tiles. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 motion-safe:animate-[fade-in_900ms_var(--ease-snappy)_both]">
        <BlockWall seed={11} cols={8} rows={8} fade="none" grain />
        <div className="absolute inset-0 bg-hunter/72" />
        <div className="absolute inset-0 bg-linear-to-r from-hunter from-35% to-transparent md:from-45%" />
      </div>
      <div
        className={cn(
          "relative flex flex-col gap-8 px-4 pt-8 pb-9 md:flex-row md:items-end md:justify-between md:gap-12 md:px-10 md:pt-12 md:pb-12",
          sweep && "md:bg-linear-110 md:from-hunter md:from-55% md:to-fern",
        )}
      >
        <div className="flex max-w-155 min-w-0 flex-col gap-4">
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

/**
 * A slim strip of block tiles under a Hunter dim, with a mono label on top: the one block-pattern moment on a
 * public or position screen. Decorative; the label states the fact the strip stands for.
 */
export function PublicBand({ children, seed = 3 }: { children: ReactNode; seed?: number }) {
  return (
    <div className="relative isolate overflow-hidden rounded-lg bg-hunter">
      <div aria-hidden className="pointer-events-none">
        <BlockBand seed={seed} cols={24} rows={1} grain />
        <div className="absolute inset-0 bg-hunter/78" />
      </div>
      <div className="absolute inset-0 flex items-center px-4 md:px-5">
        <Label className="text-lime">{children}</Label>
      </div>
    </div>
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
