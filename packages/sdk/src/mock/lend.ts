/** COPIED from apps/web/src/lib/mock/lend.ts (imports rewritten, values untouched). */
import type { LossTier } from "../viewmodels.js";
import { routes } from "./routes.js";

/**
 * Lender, risk-taker and public numbers. One example world, consistent across L01–P04:
 * a shop stopped selling, junior absorbed a $100 write-off, the Risk agent lowered the tier 3 cap.
 */

export const VAULT = {
  apy: "8.2%",
  totalLent: "$310,000",
  tvl: "$310,000",
  senior: "$310,000",
  advancesOut: "1,284",
  defaultRate: "1.8%",
  sharePrice: "$1.024",
  outstanding: "$248,000",
  repaid30d: "$61,400",
  writtenOff: "$1,100",
  junior: "$42,000",
  juniorCushion: "$42,000",
  juniorBalance: "420 jUSD",
  reserve: "$8,400",
  coverage: "20.3%",
  feeShareJunior: "30%",
  feeSplit: "60% senior · 30% junior · 10% reserve",
  receivedShares: "2,441.4 sUSD",
  juniorPrice: "$0.982",
  juniorTwap: "$0.986",
  juniorBook: 1.0,
  shopsActive: "1,912",
  walletUsdc: "$2,500",
  walletJarJ: 420,
  availableToWithdraw: "$1,840",
  positionShares: "2,441.4",
  positionValue: "$2,541.40",
  positionEarned: "+$41.40",
} as const;

/** Of each fee. Senior earns most, junior earns more for its size, reserve keeps a slice. */
export const FEE_SPLIT = [
  { k: "Senior", v: "60%" },
  { k: "Junior", v: "30%" },
  { k: "Reserve", v: "10%" },
] as const;

/** Share value, calm, then a write-off that junior eats. Senior's line barely moves. */
export const seniorSeries = [100, 100.4, 100.8, 101.1, 101.6, 102, 102.2, 102.4, 102.4, 102.5, 102.9, 103.2];

/** Junior price falls when a shop stops selling. Index 7 is the write-off. */
export const juniorSeries = [1, 0.998, 1.002, 0.997, 0.994, 0.991, 0.988, 0.962, 0.968, 0.974, 0.979, 0.982];
export const JUNIOR_WRITE_OFF_INDEX = 7;

export const positionActivity = [
  { when: "Today", what: "Write-off absorbed by junior", amount: "$0 to you" },
  { when: "Nov 4", what: "Fees earned", amount: "+$18.20" },
  { when: "Nov 2", what: "Deposited", amount: "$2,500" },
];

export const TIER_CAPS = [
  { tier: 0, cap: "$50" },
  { tier: 1, cap: "$100" },
  { tier: 2, cap: "$250" },
  { tier: 3, cap: "$250", was: "$500" },
] as const;

export const signals = [
  { name: "Junior price (TWAP)", value: "$0.986", state: "watch" as const, note: "Fell through $0.97 after the write-off, recovering" },
  { name: "Repayment speed", value: "−40% · 1 shop", state: "watch" as const, note: "One shop is selling slower than its usual week" },
  { name: "Junior coverage", value: "20.3%", state: "ok" as const, note: "Above the 15% floor" },
];

export const riskLog = [
  {
    time: "14:41",
    title: "Lowered the tier 3 cap, $500 → $250",
    kind: "down" as const,
    reason: "Junior TWAP fell through $0.97 after a $100 write-off. Tier 3 advances move first. Limits only move down.",
  },
  {
    time: "11:05",
    title: "Watching one shop's repayment speed",
    kind: "warn" as const,
    reason: "Sales on one shop ran 40% below its usual week. No limit change. Junior still covers it.",
  },
  {
    time: "Mon",
    title: "Hook fee added to the reserve",
    kind: "accent" as const,
    reason: "The Uniswap v4 hook on JAR-J/USDC skimmed a small fee into the reserve.",
  },
  {
    time: "Sep 3",
    title: "Wrote off an advance",
    kind: "down" as const,
    reason: "No sales for 30 days. The shop's jar and junior took the loss. Senior was not touched.",
  },
];

export const explorerEvents = [
  {
    kind: "Sale",
    title: "$10.00 to shop_7f3a",
    detail: "$9.00 to the shop · $1.00 to its jar",
    hash: "0x3b91c2e07d4a55f8a1c0e922b7d4416f0ae3c9d2",
    when: "2m ago",
  },
  {
    kind: "Draw",
    title: "Vault → supplier, $100",
    detail: "For stock. Paid to the supplier, not to cash",
    hash: "0x91c27a3e0b5f4c88d21e7a9f30c64b1d2e8f7a3e",
    when: "1h ago",
  },
  {
    kind: "Pass",
    title: "Business Pass on shop_7f3a",
    detail: "Commitment only. No name, no sales figures",
    hash: "0x4c1e9a88b2d04f17c6aa0912e77b33d0a15f8c21",
    when: "Today",
  },
  {
    kind: "Proof",
    title: "Standing Pass used by shop_b19c",
    detail: "Nullifier spent. No onchain link to any earlier shop",
    hash: "0x11de90aa47c2b8193044ee12aa90817263bc4410",
    when: "Today",
  },
  {
    kind: "Shop",
    title: "shop_b19c created",
    detail: "A pseudonym and a payout address. Nothing else",
    hash: "0x88aa01c2e91d44b7083319aa77c0de12f4b6e901",
    when: "Today",
  },
];

/** Junior takes the first loss, then the reserve, then senior. */
export const waterfall: [LossTier, LossTier, LossTier] = [
  { title: "Junior", description: "Takes the first write-off", amount: VAULT.junior },
  { title: "Reserve", description: "Fees held back", amount: VAULT.reserve },
  { title: "Senior", description: "Paid back before junior", amount: VAULT.senior },
];

export const positionRows = [
  { id: "writeoff", when: "Today", action: "Write-off absorbed by junior", amount: "$0 to you", shares: "2,441.4" },
  { id: "fees", when: "Nov 4", action: "Fees earned", amount: "+$18.20", shares: "2,441.4" },
  { id: "deposit", when: "Nov 2", action: "Deposited", amount: "$2,500", shares: "2,441.4" },
];

export const tradeRows = [
  { id: "t1", time: "14:02", side: "Sell", amount: "80 jUSD", price: "$0.982" },
  { id: "t2", time: "11:40", side: "Buy", amount: "200 USDC", price: "$0.979" },
  { id: "t3", time: "09:15", side: "Sell", amount: "40 jUSD", price: "$0.974" },
];

/** Public shops. A name here is a status, never a person. */
export const explorerShops = [
  {
    id: "shop_7f3a",
    name: "active",
    commitment: "0x4c1e9a88b2d04f17c6aa0912e77b33d0a15f8c21",
    nullifier: "—",
    note: "A sale and a draw to a supplier. No name attached.",
  },
  {
    id: "shop_b19c",
    name: "rotated",
    commitment: "0x11de90aa47c2b8193044ee12aa90817263bc4410",
    nullifier: "0x88aa01c2e91d44b7083319aa77c0de12f4b6e901",
    note: "Standing Pass spent. No link to the shop it replaced.",
  },
];

export const lenderLinks = [
  { key: "earn", label: "Earn", href: routes.earn },
  { key: "deposit", label: "Deposit", href: routes.deposit },
  { key: "position", label: "My position", href: routes.position },
  { key: "junior", label: "Junior", href: routes.junior },
  { key: "trade", label: "Trade", href: routes.trade },
  { key: "protocol", label: "Protocol", href: routes.protocol },
  { key: "risk", label: "Risk", href: routes.risk },
  { key: "explorer", label: "Explorer", href: routes.explorer },
] as const;

export type LenderKey = (typeof lenderLinks)[number]["key"];
