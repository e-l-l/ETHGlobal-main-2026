/** COPIED from apps/web/src/lib/mock/shop.ts. Values must stay identical: test/mock-parity.test.ts checks them. */
/**
 * Shared mock data (Person A + Person B). Static until the real data layer lands;
 * keep every number here so screens agree with each other.
 */

/** Example rate (apps/web's ARS_PER_USD, anay-design.md section 8). Also the SDK's default `fx` in every mode. */
export const ARS_PER_USD = 1010;

/* ------------------------------------------------------- Person B screens */

export const SHOP = {
  name: "Corner Kiosk",
  id: "shop_7f3a",
  initials: "CK",
  country: "Argentina",
  band: "2",
  bandRange: "$2,000–5,000 a month",
  months: "6+ months",
  /** Example rate, anay-design.md section 8. Same value as ARS_PER_USD in jar/format.ts. */
  arsPerUsd: 1010,
  advance: {
    drawn: 100,
    fee: 15,
    total: 115,
    repaid: 46,
    percentRepaid: 40,
    holdback: "8%",
  },
  limits: [
    { label: "First advance · now", cap: "$50" },
    { label: "1 repaid", cap: "$100" },
    { label: "2 repaid", cap: "$200" },
    { label: "3 or more", cap: "$300" },
  ],
} as const;

export const WALLET = "0x7a3e5b2c4d1f9e8a7b6c5d4e3f2a1b0c9d8e91c2";

/** Ordinary names offered on Create shop. Neutral on purpose: nothing about the owner. */
export const SHOP_NAME_IDEAS = ["Corner Kiosk", "Kiosco Sol", "La Esquina", "Stall 14"] as const;

/* ------------------------------------------------------- Person A screens */

export const shop = {
  name: "Corner Kiosk",
  pseudonym: "shop_7f3a",
  localCurrency: "ARS",
  /** 1 USD ≈ 1,010 ARS (apps/web's ARS_PER_USD). */
  usdToLocal: ARS_PER_USD,
} as const;

const drawn = 100;
const fee = 2;
const repaid = 46;
const total = drawn + fee;

export const advance = {
  purpose: "stock",
  drawn,
  feeLabel: "Fee so far",
  fee,
  total,
  /** Current debt still to pay back (same as `left`). */
  owedNow: total - repaid,
  feeSoFar: fee,
  feeIfRepaidIn1Week: drawn * 0.005,
  feeIfRepaidIn2Weeks: drawn * 0.01,
  feeIfRepaidIn4Weeks: drawn * 0.02,
  feeIfRepaidIn6Weeks: drawn * 0.03,
  maxFeeBps: 300,
  annualizedCostPercent: 26,
  /** Late-fee step-up: 0 / false for an on-time merchant (the fee doubles only while behind the minimum). */
  lateFee: 0,
  lateFeePaid: 0,
  isBehind: false,
  lateFeeRateBpsPerWeek: 50,
  maxLateFeeBps: 300,
  feeRule:
    "Paying on time keeps your fee at 0.5% a week, max 3%. If you fall behind the minimum, the fee doubles to 1% a week (max 6% total) until you catch up; the extra goes to the safety reserve.",
  lateFeeHint: null as string | null,
  repaid,
  left: total - repaid,
  /** Percent of the total already repaid. */
  pct: Math.round((repaid / total) * 100),
  /** Percent of each sale that goes to repayment. */
  holdback: 8,
  drawnOn: "5 Nov",
  drawnAt: "today 9:12 am",
  /** Days to go at the current pace. */
  etaDays: 23,
} as const;

export const agentLimits = {
  perAdvance: 100,
  perMonth: 200,
  purpose: "stock",
} as const;

/** Max advance per tier, unlocked by repaid advances. */
export const limitsLadder = [
  { label: "First advance", cap: 50 },
  { label: "1 repaid", cap: 100 },
  { label: "2 repaid", cap: 200 },
  { label: "3 or more", cap: 300 },
] as const;

/** Index into limitsLadder for this shop. */
export const currentTier = 1;

/** Local-currency value of a USD amount at the mock rate. */
export function toLocal(usd: number) {
  return usd * shop.usdToLocal;
}

/** USD value of a local-currency amount at the mock rate. */
export function toUsd(local: number) {
  return local / shop.usdToLocal;
}
