/**
 * Shared mock data (Person A + Person B). Static until the real data layer lands;
 * keep every number here so screens agree with each other.
 */

export const shop = {
  name: "Corner Kiosk",
  pseudonym: "shop_7f3a",
  localCurrency: "ARS",
  /** 1 USD ≈ 1,500 ARS */
  usdToLocal: 1500,
} as const;

const drawn = 100;
const fee = 15;
const repaid = 46;
const total = drawn + fee;

export const advance = {
  purpose: "stock",
  drawn,
  /** Fee wording is undecided ("Flat fee" vs interest): change the label here only. */
  feeLabel: "Flat fee",
  fee,
  total,
  repaid,
  left: total - repaid,
  /** Percent of the total already repaid. */
  pct: Math.round((repaid / total) * 100),
  /** Percent of each sale that goes to repayment. */
  holdback: 10,
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
  { label: "2 repaid", cap: 250 },
  { label: "3 or more", cap: 500 },
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
