"use client";

import { useEffect, useState } from "react";
import { Button } from "@/final";
import { cn } from "@/lib/cn";
import { getMRA, isMock } from "@/lib/mra";

/*
 * "Connect wallet": lets a judge use their own browser wallet (MetaMask, …) on Sepolia instead of this device's
 * burner. The choice is the localStorage flag `mra.walletMode` ("injected" | "device", default "device"), read once
 * per tab by lib/mra-browser.ts; switching sets it and reloads, since the MRA client is created once per tab.
 * Hidden in mock mode. lib/mra-browser is imported lazily (like PrivateReadsChip) so the SDK stays out of the
 * default bundle.
 */

const KEY = "mra.walletMode";
const ETHERSCAN = "https://sepolia.etherscan.io/address/";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function setMode(mode: "injected" | "device") {
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* private mode: stays on the device wallet */
  }
  window.location.reload();
}

type State = { kind: "burner" | "injected" | "none"; address?: string; name?: string; wanted: "injected" | "device"; hasInjected: boolean };

export function ConnectWallet({ compact, className }: { compact?: boolean; className?: string }) {
  const [s, setS] = useState<State>();

  useEffect(() => {
    if (isMock) return;
    let alive = true;
    void (async () => {
      try {
        await getMRA();
        const { MRA_BROWSER_STATUS, getWalletMode, injectedProvider } = await import("@/lib/mra-browser");
        if (!alive) return;
        setS({
          kind: MRA_BROWSER_STATUS.wallet,
          address: MRA_BROWSER_STATUS.address,
          name: MRA_BROWSER_STATUS.walletName,
          wanted: getWalletMode(),
          hasInjected: !!injectedProvider(),
        });
      } catch {
        /* informational only */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // The SDK client is built once per tab: any wallet-side account or chain change means a fresh start.
  useEffect(() => {
    if (s?.kind !== "injected") return;
    const eth = (window as unknown as { ethereum?: { on?: (e: string, f: () => void) => void; removeListener?: (e: string, f: () => void) => void } }).ethereum;
    const reload = () => window.location.reload();
    eth?.on?.("accountsChanged", reload);
    eth?.on?.("chainChanged", reload);
    return () => {
      eth?.removeListener?.("accountsChanged", reload);
      eth?.removeListener?.("chainChanged", reload);
    };
  }, [s?.kind]);

  if (isMock || !s) return null;

  const link = (label: string, title: string) =>
    s.address ? (
      <a
        href={`${ETHERSCAN}${s.address}`}
        target="_blank"
        rel="noreferrer"
        title={title}
        className="inline-flex min-h-9 items-center rounded-chip bg-well px-3 font-ledger text-ledger text-charcoal hover:text-hunter focus-visible:outline-2 focus-visible:outline-charcoal"
      >
        {label} ↗
      </a>
    ) : null;

  if (s.kind === "injected" && s.address) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        {link(`${short(s.address)} · ${s.name ?? "Wallet"}`, "Your browser wallet on Sepolia. Open on Etherscan.")}
        <button
          type="button"
          onClick={() => setMode("device")}
          className="min-h-9 cursor-pointer px-2 font-body text-tag text-charcoal-muted underline-offset-2 hover:text-hunter hover:underline"
        >
          Use device wallet
        </button>
      </span>
    );
  }

  // Device (burner) mode. If injected was asked for but failed, say so once and offer a retry.
  const failed = s.wanted === "injected";
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {!compact && s.address ? link(`Device ${short(s.address)}`, "Wallet on this device. Sepolia test funds only. Open on Etherscan.") : null}
      {s.hasInjected ? (
        <Button
          variant="secondary"
          size="sm"
          width="auto"
          onClick={() => setMode("injected")}
          title={failed ? "Couldn't connect your wallet last time (rejected or wrong network). Try again." : "Use MetaMask or another browser wallet on Sepolia"}
        >
          {failed ? "Retry wallet" : "Connect wallet"}
        </Button>
      ) : null}
      {failed ? (
        <button type="button" onClick={() => setMode("device")} className="sr-only focus:not-sr-only">
          Use device wallet
        </button>
      ) : null}
    </span>
  );
}
