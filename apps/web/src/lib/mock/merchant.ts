/**
 * Screen-specific mock data for the merchant app (Person A).
 * Shared shop / advance numbers live in ./shop.ts.
 */
import type { ActivityKind } from "@/components/data";
import { advance, agentLimits, shop } from "./shop";

/* ------------------------------------------------------------- M10 home */

export const today = {
  label: "Thursday 5 Nov",
  /** Sold today, in local currency. */
  soldLocal: 142500,
  soldUsd: 95,
  salesCount: 18,
  toRepayment: 9.5,
  weekUsd: 475,
} as const;

export const agentSummary = {
  lastDraw: 100,
  lastDrawWhen: "today",
  monthUsed: 100,
} as const;

/** What the speaker said for the last sale. */
export const lastAnnouncement = "You received 10 dollars, 1 went to your advance";

/** Today's sales, local currency. The split is derived from advance.holdback. */
export const sales = [
  { id: "s4", total: 15000, time: "4:20 pm" },
  { id: "s3", total: 4500, time: "4:02 pm" },
  { id: "s2", total: 22000, time: "3:41 pm" },
  { id: "s1", total: 7500, time: "3:10 pm" },
] as const;

export function splitSale(total: number) {
  const repay = (total * advance.holdback) / 100;
  return { you: total - repay, repay };
}

/* ---------------------------------------------------- M11 advance arrived */

export const drawReasons = [
  "Sales are up 12% this week, so repayment is quick",
  "You usually restock on Mondays",
  `$${advance.drawn} is inside your $${agentLimits.perAdvance} per-advance limit`,
  `This month: $${agentSummary.monthUsed} of your $${agentLimits.perMonth} limit used`,
] as const;

/* ---------------------------------------------------- M12 advance details */

export const repaymentCurve = {
  /** Cumulative USD repaid per day. */
  points: [0, 4, 10, 13, 20, 24, 29, 34, 38, 42, 46],
  ariaLabel: "Repayment growing from $0 to $46 over 9 days",
} as const;

export const daysLeftEstimates = [
  { label: "Slow week", days: 46 },
  { label: "Normal", days: 23 },
  { label: "Busy week", days: 14 },
] as const;

/* ------------------------------------------------------------ M13 bad week */

export const week = {
  dayLabels: ["M", "T", "W", "T", "F", "S", "S"],
  /** USD per day: kept by the shop vs sent to repayment. */
  days: [
    { you: 99, repay: 11 },
    { you: 79, repay: 9 },
    { you: 50, repay: 6 },
    { you: 36, repay: 4 },
    { you: 43, repay: 5 },
    { you: 25, repay: 3 },
    { you: 20, repay: 2 },
  ],
  ariaLabel: "Daily sales this week, falling from Monday to Sunday, split between you and repayment",
  newEstimateDays: 31,
} as const;

/* --------------------------------------------------------- M14 agent log */

export const agentStats = {
  monthUsed: agentSummary.monthUsed,
  draws: 2,
  drawsSince: "5 Oct",
  skipped: 1,
  skippedReason: "sales too low",
} as const;

export const agentActivity: { id: string; time: string; kind: ActivityKind; title: string; reason: string }[] = [
  {
    id: "a5",
    time: "today",
    kind: "accent",
    title: "Drew $100 for stock",
    reason: "Sales up 12% this week; usual Monday restock; inside your limits.",
  },
  {
    id: "a4",
    time: "2 Nov",
    kind: "neutral",
    title: "Skipped a draw",
    reason: "Sales were 40% below normal. Waiting so repayment stays easy.",
  },
  {
    id: "a3",
    time: "28 Oct",
    kind: "warn",
    title: "Limit lowered by risk agent",
    reason: "Pool-wide max advance cut 20% after a market signal. Your $100 limit still fits.",
  },
  {
    id: "a2",
    time: "22 Oct",
    kind: "neutral",
    title: "Advance fully repaid",
    reason: "$57.50 repaid in 17 days. Standing Pass updated privately.",
  },
  {
    id: "a1",
    time: "5 Oct",
    kind: "neutral",
    title: "Agent approved",
    reason: "You approved with World. Limits: $100 per advance, $200 per month.",
  },
];

/* --------------------------------------------------------- M07 agent setup */

export const perAdvanceOptions = [
  { value: 50 },
  { value: 100 },
  { value: 250, lockedReason: "$250 unlocks after 2 repaid advances" },
] as const;

export const perMonthStepper = { step: 50, min: 50, max: 500 } as const;

export const purposes = ["stock", "rent", "repairs"] as const;

export const agentPermissions = {
  can: [
    `Draw up to $${agentLimits.perAdvance} at a time for ${agentLimits.purpose}`,
    `Draw up to $${agentLimits.perMonth} in a month`,
    "Only when your sales can repay it",
  ],
  never: ["Go past these limits: the contract blocks it", "Move money anywhere but to you or your supplier"],
};

/* ------------------------------------------------------------ M18 cash out */

export const cashOut = {
  amount: 100,
  available: 100,
  destinations: [
    { value: "supplier", title: "My supplier · Distribuidora Sur", description: "paid directly, in pesos" },
    { value: "mercado-pago", title: "Mercado Pago", description: "local pesos to your account" },
    { value: "usd", title: "Keep in dollars", description: "move it later" },
  ],
  defaultDestination: "supplier",
} as const;

/* ---------------------------------------------------------- P01 world view */

export const worldView = {
  public: [
    { k: "Shop", v: shop.pseudonym },
    { k: "Sale amounts", v: "15,000 · 4,500 …" },
    { k: "Advance drawn", v: "$100 · 9:12" },
    { k: "Repayments", v: `${advance.holdback}% per sale` },
    { k: "Nullifier", v: "0x9c1e…a7" },
  ],
  private: [
    { k: "Your name", v: "never collected" },
    { k: "Business facts", v: "AR · band 2 · 6m+" },
    { k: "Standing Pass", v: "1 repaid" },
    { k: "Who paid you", v: "hashed, never shown" },
    { k: "Backup key", v: "this device only" },
  ],
};
