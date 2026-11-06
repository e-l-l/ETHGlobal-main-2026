"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { Button } from "@/final";
import { cn } from "@/lib/cn";
import { getMRA, isMock } from "@/lib/mra";

/*
 * "Connect wallet": RainbowKit's modal (MetaMask, Rabby, Coinbase, WalletConnect when configured) on Sepolia, with
 * this device's burner as the default. The SDK client is created once per tab and reads the localStorage flag
 * `mra.walletMode` ("injected" | "device") at load (lib/mra-browser.ts), so a switch sets the flag and reloads:
 *   wagmi connected on Sepolia, but the client isn't using that account  -> mode "injected", reload
 *   the client uses the browser wallet, but wagmi no longer has it there -> mode "device" (on disconnect), reload
 * Hidden in mock mode. lib/mra-browser is imported lazily so the SDK stays out of the default bundle.
 */

const ETHERSCAN = "https://sepolia.etherscan.io/address/";
const SEPOLIA_ID = 11_155_111;
const RELOAD_GUARD = "mra.walletReload";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const lc = (a?: string) => a?.toLowerCase();

type State = { kind: "burner" | "injected" | "none"; address?: string; name?: string };

/** Reload at most once per target state, so a wallet that keeps failing to load can't cause a reload loop. */
function reloadOnce(key: string) {
  try {
    if (window.sessionStorage.getItem(RELOAD_GUARD) === key) return;
    window.sessionStorage.setItem(RELOAD_GUARD, key);
  } catch {
    return;
  }
  window.location.reload();
}

export function ConnectWallet(props: { compact?: boolean; className?: string }) {
  if (isMock) return null;
  return <ConnectWalletLive {...props} />;
}

function ConnectWalletLive({ compact, className }: { compact?: boolean; className?: string }) {
  const [s, setS] = useState<State>();
  const account = useAccount();

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await getMRA();
        const { MRA_BROWSER_STATUS } = await import("@/lib/mra-browser");
        if (!alive) return;
        setS({ kind: MRA_BROWSER_STATUS.wallet, address: MRA_BROWSER_STATUS.address, name: MRA_BROWSER_STATUS.walletName });
      } catch {
        /* informational only */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Keep the SDK client's wallet in step with wagmi. Only once both have settled (no reconnect in flight).
  useEffect(() => {
    if (!s || account.status === "reconnecting" || account.status === "connecting") return;
    const want = account.status === "connected" && account.chainId === SEPOLIA_ID ? account.address : undefined;
    const have = s.kind === "injected" ? s.address : undefined;
    if (lc(want) === lc(have)) {
      try {
        window.sessionStorage.removeItem(RELOAD_GUARD);
      } catch {
        /* ignore */
      }
      return;
    }
    void import("@/lib/mra-browser").then(({ WALLET_MODE_KEY, getWalletMode }) => {
      const set = (m: "injected" | "device") => {
        try {
          if (getWalletMode() !== m) window.localStorage.setItem(WALLET_MODE_KEY, m);
        } catch {
          /* private mode: stays on the device wallet */
        }
      };
      if (want) {
        set("injected");
        reloadOnce(`in:${lc(want)}`);
      } else if (have) {
        if (account.status === "disconnected") set("device");
        reloadOnce(`out:${account.status}:${account.chainId ?? "-"}`);
      }
    });
  }, [s, account.status, account.address, account.chainId]);

  if (!s) return null;

  const link = (address: string, label: string, title: string) => (
    <a
      href={`${ETHERSCAN}${address}`}
      target="_blank"
      rel="noreferrer"
      title={title}
      className="inline-flex min-h-9 items-center rounded-chip bg-well px-3 font-ledger text-ledger text-charcoal hover:text-hunter focus-visible:outline-2 focus-visible:outline-charcoal"
    >
      {label} ↗
    </a>
  );
  const textButton =
    "min-h-9 cursor-pointer px-2 font-body text-tag text-charcoal-muted underline-offset-2 hover:text-hunter hover:underline";

  return (
    <ConnectButton.Custom>
      {({ account: rk, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        if (!mounted) return null;

        if (rk && chain?.unsupported) {
          return (
            <span className={cn("inline-flex items-center gap-1", className)}>
              <Button variant="secondary" size="sm" width="auto" onClick={openChainModal}>
                Switch to Sepolia
              </Button>
            </span>
          );
        }

        if (rk && s.kind === "injected" && s.address) {
          return (
            <span className={cn("inline-flex items-center gap-1", className)}>
              {link(s.address, `${short(s.address)} · ${s.name ?? "Wallet"}`, "Your browser wallet on Sepolia. Open on Etherscan.")}
              <button type="button" onClick={openAccountModal} className={textButton}>
                Account
              </button>
            </span>
          );
        }

        // Device (burner) wallet in use.
        return (
          <span className={cn("inline-flex items-center gap-1", className)}>
            {!compact && s.address
              ? link(s.address, `Device ${short(s.address)}`, "Wallet on this device. Sepolia test funds only. Open on Etherscan.")
              : null}
            <Button
              variant="secondary"
              size="sm"
              width="auto"
              onClick={rk ? openAccountModal : openConnectModal}
              title="Use MetaMask, Rabby, Coinbase or another wallet on Sepolia"
            >
              {rk ? short(rk.address) : "Connect wallet"}
            </Button>
          </span>
        );
      }}
    </ConnectButton.Custom>
  );
}
