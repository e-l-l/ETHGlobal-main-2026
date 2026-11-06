/** COPIED from apps/web/src/lib/mock/lend.ts (imports rewritten, values untouched). */
import type { LossTier, RiskPanelView, WaterfallView } from "../viewmodels.js";
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
  feeSplit: "40% senior · 30% junior/DRIP · 20% reserve · 10% protocol",
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
  { k: "Senior", v: "40%" },
  { k: "Junior / DRIP", v: "30%" },
  { k: "Reserve", v: "20%" },
  { k: "Protocol", v: "10%" },
] as const;

/** Share value, calm, then a write-off that junior eats. Senior's line barely moves. */
export const seniorSeries = [100, 100.4, 100.8, 101.1, 101.6, 102, 102.2, 102.4, 102.4, 102.5, 102.9, 103.2];

/** Junior price falls when a shop stops selling. Index 7 is the write-off. */
export const juniorSeries = [1, 0.998, 1.002, 0.997, 0.994, 0.991, 0.988, 0.962, 0.968, 0.974, 0.979, 0.982];
export const JUNIOR_WRITE_OFF_INDEX = 7;

export const positionActivity = [
  { when: "Today", what: "Advance written off · DRIP took the loss", amount: "$0 to you" },
  { when: "Nov 4", what: "Fees earned", amount: "+$18.20" },
  { when: "Nov 2", what: "Deposited", amount: "$2,500" },
];

export const TIER_CAPS = [
  { tier: 0, cap: "$50" },
  { tier: 1, cap: "$100" },
  { tier: 2, cap: "$200" },
  { tier: 3, cap: "$300", was: "$300" },
] as const;

export const signals = [
  { name: "DRIP price (TWAP)", value: "$0.986", state: "watch" as const, note: "Fell through $0.97 after the write-off, recovering" },
  { name: "Repayment speed", value: "−40%", state: "watch" as const, note: "One shop is selling slower than its usual week" },
  { name: "Coverage", value: "20.3%", state: "ok" as const, note: "DRIP cover vs advances out. Above the 20% cover rule" },
];

export const riskLog = [
  {
    time: "14:41",
    title: "Limits reviewed at the $300 tier cap",
    kind: "down" as const,
    reason: "DRIP TWAP fell through $0.97 after a $100 write-off. Tier 3 advances are the largest, so they move first. Limits only move down, inside the preset band. A person raises them back.",
    reasons: [
      "DRIP TWAP fell through $0.97 after a $100 write-off.",
      "Tier 3 advances are the largest, so they move first.",
      "Limits only move down, inside the preset band. A person raises them back.",
    ],
  },
  {
    time: "11:05",
    title: "Watching one shop's repayment speed",
    kind: "warn" as const,
    reason: "Sales on one shop ran 40% below its usual week. No limit change. DRIP still covers it.",
    reasons: ["Sales on one shop ran 40% below its usual week.", "No limit change. DRIP still covers it."],
  },
  {
    time: "Mon",
    title: "Hook fee added to the reserve",
    kind: "accent" as const,
    reason: "The Uniswap v4 hook on DRIP/USDC skimmed a small fee into the reserve.",
    reasons: ["The Uniswap v4 hook on DRIP/USDC skimmed a small fee into the reserve."],
  },
  {
    time: "Sep 3",
    title: "Wrote off an advance",
    kind: "down" as const,
    reason: "No sales for 30 days. DripCoin took the loss. The vault was not touched.",
    reasons: ["No sales for 30 days.", "DripCoin took the loss. The vault was not touched."],
  },
];

export const explorerEvents = [
  {
    kind: "Sale",
    title: "$10.00 to shop_7f3a",
    detail: "$9.00 to the shop · $1.00 to its advance",
    hash: "0x3b91c2e07d4a55f8a1c0e922b7d4416f0ae3c9d2",
    when: "2m ago",
  },
  {
    kind: "Draw",
    title: "Vault → shop, $100",
    detail: "For stock. Paid to the shop's payout address",
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
  { id: "writeoff", when: "Today", action: "Advance written off · DRIP took the loss", amount: "$0 to you", shares: "2,441.4" },
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
    note: "A sale and an advance. No name attached.",
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

/* ------------------------------------------------------------------------------------------------------------------
 * Lender risk panel + live loss waterfall (SDK-only mock: apps/web reads it through `lender.riskPanel()` /
 * `lender.waterfall()`). Every overlapping number matches VAULT / TIER_CAPS above (test/lender-risk.test.ts checks):
 * junior $42,000 + reserve $8,400 against $248,000 outstanding = 20.3% coverage; $1,100 written off; 23 write-offs
 * of 1,284 advances = the "1.8%" count rate on Earn; DRIP $0.982 spot, $0.986 TWAP against a $1.000 book.
 * ---------------------------------------------------------------------------------------------------------------- */

const SEPOLIA_SCAN = "https://sepolia.etherscan.io/address/";
const contract = (label: string, address: string) => ({ label, address, href: `${SEPOLIA_SCAN}${address}` });

export const RISK_PANEL: RiskPanelView = {
  defaultRate: {
    value: "0.2%",
    pct: 0.18,
    lost: "$1,100",
    advanced: "$612,000",
    writeOffs: 23,
    advances: 1284,
    note: "$1,100 of $612,000 principal lost · 23 of 1,284 advances written off (1.8% by count)",
    tone: "ok",
  },
  repayment: {
    open: 1061,
    buckets: [
      { key: "on_track", label: "On track", rule: "a repaying sale in the last 7 days", count: 1012, principal: "$236,900", tone: "ok" },
      { key: "slow", label: "Slow", rule: "last repaying sale 7–30 days ago", count: 41, principal: "$9,300", tone: "watch" },
      { key: "quiet", label: "30+ days quiet", rule: "no repaying sale for 30 days: write-off eligible", count: 8, principal: "$1,800", tone: "risk" },
    ],
    eligibleNow: 8,
    note: "Counted from each advance's last repaying sale, or its draw if it has none yet. The contract lets anyone write an advance off after 30 days without a qualifying sale: 8 can be written off now.",
  },
  cohort: {
    points: [
      { day: 7, pct: 21, value: "21%", advances: 1190 },
      { day: 14, pct: 43, value: "43%", advances: 1105 },
      { day: 30, pct: 78, value: "78%", advances: 940 },
    ],
    enough: true,
    note: "Share of principal repaid by each day since draw. Only advances at least that old count (day 7: 1190 · day 14: 1105 · day 30: 940).",
  },
  coverage: {
    value: VAULT.coverage,
    pct: 20.3,
    cushion: "$50,400",
    outstanding: VAULT.outstanding,
    note: "$50,400 of DRIP and reserve against $248,000 lent out.",
    tone: "ok",
  },
  market: {
    spot: VAULT.juniorPrice,
    twap1h: VAULT.juniorTwap,
    twap24h: "$0.998",
    book: "$1.000",
    vsBook: "1.4% under book",
    change1hVs24h: "−1.2%",
    ratio: 0.988,
    trigger: { threshold: 0.9, state: "armed", note: "Armed: it fires if the 1h price drops under 0.90× the 24h price." },
    read: "Traders price DRIP 1.4% under its book value: they expect losses beyond the $1,100 written off so far.",
    tone: "ok",
  },
  agent: {
    tierCaps: [
      { tier: 0, cap: "$50", floor: "$25", atFloor: false },
      { tier: 1, cap: "$100", floor: "$50", atFloor: false },
  { tier: 2, cap: "$200", floor: "$100", atFloor: false },
  { tier: 3, cap: "$300", floor: "$100", was: "$300", atFloor: false },
    ],
    recentlyLowered: true,
    lastChange: "Lowered today, 2:41 pm",
    lastCheck: "today, 2:41 pm · DRIP price drop",
    triggers: ["junior_twap_drop"],
    from: "api",
  },
  contracts: [
    contract("AdvanceBook", "0x82cd71d8eefa47492be6b8dcf596a18a7753a0b1"),
    contract("Vault", "0xc2286c564bde614ca1414518d02cacec77f3e297"),
    contract("DripCoin (DRIP)", "0x5998b918db6edaccde4ce3fc282b9b057ab8d81c"),
    contract("RiskHook", "0xf5174b8f8642aef786e6bb1c1facac6d0f201044"),
  ],
  approximations: [],
  source: "mock",
};

export const WATERFALL: WaterfallView = {
  layers: [
    {
      key: "jar",
      title: "Shops' holdback",
      description: "Fees still owed on open advances, paid from future sales. Not set aside: an estimate, and it only counts while shops keep selling.",
      amount: "$37,200",
      usd: 37200,
      estimated: true,
    },
    { key: "junior", title: "DripCoin (DRIP)", description: "Cash backing DRIP. Takes the first write-off.", amount: VAULT.junior, usd: 42000, estimated: false },
    { key: "reserve", title: "Reserve", description: "Fees and hook fees held back. Pays what DRIP can't.", amount: VAULT.reserve, usd: 8400, estimated: false },
    {
      key: "senior",
      title: "Vault",
      description: "Lenders. Loses only after DRIP and the reserve run out.",
      amount: VAULT.senior,
      usd: 310000,
      estimated: false,
      yours: `Yours ${VAULT.positionValue}`,
    },
  ],
  protection: "$50,400",
  protectionUsd: 50400,
  headline: "$50,400 of protection ahead of every vault dollar",
  sub: "DRIP $42,000 + reserve $8,400: 20.3% of the $248,000 lent out.",
  source: "mock",
};
