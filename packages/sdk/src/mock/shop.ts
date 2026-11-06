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
    holdback: "10%",
  },
  limits: [
    { label: "First advance · now", cap: "$100" },
    { label: "1 repaid", cap: "$250" },
    { label: "2 repaid", cap: "$500" },
    { label: "3 or more", cap: "$500" },
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
