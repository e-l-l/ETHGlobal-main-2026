"use client";

import { WALLET as DEMO_WALLET } from "@repo/sdk/mock";
import { MRA_ENV, isMock } from "@/lib/mra";
import { useMRA } from "@/lib/use-mra";

/** Mock: the SDK's demo wallet. Real modes: this device's burner wallet, else the read-only lender account. */
const STATIC_WALLET = MRA_ENV.account ?? (isMock ? DEMO_WALLET : undefined);
const burnerAddress = async (m: { wallet: { address(): string | undefined } }) => m.wallet.address() ?? null;

export function WalletChip() {
  const { data: burner } = useMRA(burnerAddress, { enabled: !isMock });
  const wallet = burner ?? STATIC_WALLET;
  return (
    <span
      className="app-chip"
      style={{ cursor: "default" }}
      title={burner ? "Wallet on this device. Sepolia test funds only." : "Demo wallet. Transfers are simulated."}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)" }} />
      <span className="sr-only-dj">{burner ? "Wallet on this device" : "Demo wallet"}</span>
      {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "No wallet"}
    </span>
  );
}
