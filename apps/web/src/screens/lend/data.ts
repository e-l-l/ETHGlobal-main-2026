/**
 * Lender, risk-taker and public numbers for the phone screens. One example world, consistent
 * across L01–P04: a shop stopped selling, DripCoin absorbed a $100 write-off, and the Risk agent
 * lowered the tier 3 cap. Numbers are numbers here, so the keypad screens can do arithmetic.
 */

import { limitsLadder } from "@/lib/mock/shop";

export const VAULT = {
  apy: "8.2%",
  totalLent: "$310,000",
  advancesOut: "1,284",
  defaultRate: "1.8%",
  sharePrice: 1.024,
  outstanding: "$248,000",
  repaid30d: "$61,400",
  writtenOff: "$1,100",
  junior: "$42,000",
  reserve: "$8,400",
  coverage: "20.3%",
  feeShareJunior: "30%",
  juniorPrice: 0.982,
  juniorTwap: 0.986,
  juniorBook: 1.0,
  shopsActive: "1,912",
  walletUsdc: 2500,
  walletJarJ: 420,
  availableToWithdraw: 1840,
  positionShares: 2441.4,
  positionValue: 2541.4,
  positionEarned: 41.4,
} as const;

/** Share value, calm, then a write-off that DRIP eats. The vault's line barely moves. */
export const seniorSeries = [100, 100.4, 100.8, 101.1, 101.6, 102, 102.2, 102.4, 102.4, 102.5, 102.9, 103.2];

/** DRIP price falls when a shop stops selling. Index 7 is the write-off. */
export const juniorSeries = [1, 0.998, 1.002, 0.997, 0.994, 0.991, 0.988, 0.962, 0.968, 0.974, 0.979, 0.982];
export const JUNIOR_WRITE_OFF_INDEX = 7;

export const positionActivity = [
  { when: "Today", what: "Advance written off · DRIP took the loss", amount: "$0 to you" },
  { when: "Nov 4", what: "Fees earned", amount: "+$18.20" },
  { when: "Nov 2", what: "Deposited", amount: "$2,500" },
];

/** Tier caps come from the shop's limits ladder. Tier 3 is currently lowered by the Risk agent. */
const LOWERED_TIER = 3;
const LOWERED_CAP = 250;
export const TIER_CAPS: { tier: number; cap: string; was?: string }[] = limitsLadder.map((l, tier) =>
  tier === LOWERED_TIER ? { tier, cap: `$${LOWERED_CAP}`, was: `$${l.cap}` } : { tier, cap: `$${l.cap}` },
);

export const signals = [
  { name: "DRIP price (TWAP)", value: "$0.986", state: "watch" as const, note: "Fell through $0.97 after the write-off, recovering" },
  { name: "Repayment speed", value: "−40%", state: "watch" as const, note: "One shop is selling slower than its usual week" },
  { name: "Coverage", value: "20.3%", state: "ok" as const, note: "DRIP + reserve vs advances out. Above the 15% floor" },
];

export const riskLog = [
  {
    time: "14:41",
    title: "Lowered the tier 3 cap, $500 → $250",
    kind: "down" as const,
    reasons: [
      "DRIP TWAP fell through $0.97 after a $100 write-off.",
      "Tier 3 advances are the largest, so they move first.",
      "Limits only move down, inside the preset band. A person raises them back.",
    ],
  },
  {
    time: "11:05",
    title: "Watching one shop's repayment speed",
    kind: "watch" as const,
    reasons: ["Sales on one shop ran 40% below its usual week.", "No limit change. DRIP still covers it."],
  },
  {
    time: "Mon",
    title: "Hook fee added to the reserve",
    kind: "ok" as const,
    reasons: ["The Uniswap v4 hook on DRIP/USDC skimmed a small fee into the reserve."],
  },
  {
    time: "Sep 3",
    title: "Wrote off an advance",
    kind: "down" as const,
    reasons: ["No sales for 30 days.", "DripCoin took the loss. The vault was not touched."],
  },
];

export type ExplorerKind = "Sale" | "Draw" | "Pass" | "Proof" | "Shop";
export const explorerEvents: { kind: ExplorerKind; title: string; detail: string; hash: string; when: string }[] = [
  { kind: "Sale", title: "$10.00 to shop_7f3a", detail: "$9.00 to the shop · $1.00 to its advance", hash: "0x3b91c2e07d4a55f8a1c0e922b7d4416f0ae3c9d2", when: "2m ago" },
  { kind: "Draw", title: "Vault → supplier, $100", detail: "For stock. Paid to the supplier, not to cash", hash: "0x91c27a3e0b5f4c88d21e7a9f30c64b1d2e8f7a3e", when: "1h ago" },
  { kind: "Pass", title: "Business Pass on shop_7f3a", detail: "Commitment only. No name, no sales figures", hash: "0x4c1e9a88b2d04f17c6aa0912e77b33d0a15f8c21", when: "Today" },
  { kind: "Proof", title: "Standing Pass used by shop_b19c", detail: "Nullifier spent. No onchain link to any earlier shop", hash: "0x11de90aa47c2b8193044ee12aa90817263bc4410", when: "Today" },
  { kind: "Shop", title: "shop_b19c created", detail: "A pseudonym and a payout address. Nothing else", hash: "0x88aa01c2e91d44b7083319aa77c0de12f4b6e901", when: "Today" },
];
