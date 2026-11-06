/**
 * The SDK's VaultVM uses display strings ("$1.024", "$2,500", "+$41.40"), exactly like lib/mock/lend.ts. The
 * keypad screens need numbers to do arithmetic, so they parse them here, once. This replaces the numeric copy
 * that used to live in ./data.ts (the numbers-vs-strings mismatch noted in packages/sdk/README.md).
 */
import type { VaultVM } from "@repo/sdk";

/** "$2,541.40" → 2541.4, "+$41.40" → 41.4, "2,441.4" → 2441.4, "−40%" → -40. */
export function num(display: string | number): number {
  if (typeof display === "number") return display;
  const n = Number(display.replace(/−/g, "-").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function vaultNumbers(v: VaultVM) {
  return {
    sharePrice: num(v.sharePrice),
    juniorPrice: num(v.juniorPrice),
    juniorTwap: num(v.juniorTwap),
    juniorBook: v.juniorBook,
    junior: num(v.junior),
    walletUsdc: num(v.walletUsdc),
    walletJarJ: v.walletJarJ,
    availableToWithdraw: num(v.availableToWithdraw),
    positionShares: num(v.positionShares),
    positionValue: num(v.positionValue),
    positionEarned: num(v.positionEarned),
  };
}

/** Split an SDK reason ("A. B. C.") into the bullet lines the Risk screen shows. */
export function reasonLines(reason: string): string[] {
  return reason.split(/(?<=\.)\s+/).filter(Boolean);
}
