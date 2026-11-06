/**
 * The demo shop. One source for every screen (onboarding, merchant app, customer, lender)
 * so the same number never shows two ways. Static until the real data layer lands.
 */

/** Example rate, anay-design.md section 8. Always labelled as an example in the UI. */
export const ARS_PER_USD = 1010;

export const shop = {
  name: "Corner Kiosk",
  /** Public pseudonym. The only thing onchain that names the shop. */
  id: "shop_7f3a",
  initials: "CK",
  country: "Argentina",
  band: "2",
  bandRange: "$2,000–5,000 a month",
  months: "6+ months",
  localCurrency: "ARS",
  usdToLocal: ARS_PER_USD,
} as const;

export const WALLET = "0x7a3e5b2c4d1f9e8a7b6c5d4e3f2a1b0c9d8e91c2";

/** Ordinary names offered on Create shop. Neutral on purpose: nothing about the owner. */
export const SHOP_NAME_IDEAS = ["Corner Kiosk", "Kiosco Sol", "La Esquina", "Stall 14"] as const;

/** Max advance per tier, unlocked by repaid advances. */
export const limitsLadder = [
  { label: "First advance", cap: 50 },
  { label: "1 repaid", cap: 100 },
  { label: "2 repaid", cap: 200 },
  { label: "3 or more", cap: 300 },
] as const;

/** Index into limitsLadder: Corner Kiosk has repaid one advance, so its limit is $100. */
export const currentTier = 1;

const drawn = limitsLadder[currentTier].cap;
/** Fee so far: 0.5% a week on the original advance, never more than 3%. */
const fee = 2;
const repaid = 46;
const total = drawn + fee;

/** The advance currently being repaid. Same values as packages/sdk/src/mock/shop.ts. */
export const advance = {
  purpose: "stock",
  drawn,
  feeLabel: "Fee so far",
  /** Deprecated aliases: `fee` = feeSoFar, `total` = owedNow. */
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
  /** Simple annualized maximum, not an APR: 0.5% a week × 52. */
  annualizedCostPercent: 26,
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
  perAdvance: limitsLadder[currentTier].cap,
  perMonth: 200,
  purpose: "stock",
} as const;

/** Local-currency value of a USD amount at the example rate. */
export function toLocal(usd: number) {
  return usd * shop.usdToLocal;
}

/** USD value of a local-currency amount at the example rate. */
export function toUsd(local: number) {
  return local / shop.usdToLocal;
}
