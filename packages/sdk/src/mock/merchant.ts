/** COPIED from apps/web/src/lib/mock/merchant.ts (imports rewritten, values untouched). */
/**
 * Screen-specific mock data for the merchant app (Person A).
 * Shared shop / advance numbers live in ./shop.ts.
 */
import type { ActivityKind } from "../viewmodels.js";
import { appUrl } from "./brand.js";
import { routes } from "./routes.js";
import { formatMoney } from "../format.js";
import { advance, agentLimits, shop, toUsd } from "./shop.js";

/* ------------------------------------------------------------- M10 home */

/** Sold today, in local currency. */
const soldLocal = 142500;
const soldUsd = toUsd(soldLocal);

export const today = {
  label: "Thursday 5 Nov",
  soldLocal,
  soldUsd,
  salesCount: 18,
  toRepayment: (soldUsd * advance.holdback) / 100,
  weekUsd: 475,
} as const;

export const agentSummary = {
  lastDraw: 100,
  lastDrawWhen: "today",
  monthUsed: 100,
} as const;

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
  "Payments are up 12% this week, so paying back will be quick",
  "You usually restock on Mondays",
  `${formatMoney(advance.drawn)} is inside your ${formatMoney(agentLimits.perAdvance)} per-advance limit`,
  `This month: ${formatMoney(agentSummary.monthUsed)} of your ${formatMoney(agentLimits.perMonth)} limit used`,
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
  { value: 200, lockedReason: "$200 unlocks after 2 repaid advances" },
  { value: 300, lockedReason: "$300 unlocks after 3 repaid advances" },
] as const;

export const perMonthStepper = { step: 50, min: 50, max: 500 } as const;

export const purposes = ["stock", "rent", "repairs"] as const;

export const agentPermissions = {
  can: [
    `Draw up to ${formatMoney(agentLimits.perAdvance)} at a time for ${agentLimits.purpose}`,
    `Draw up to ${formatMoney(agentLimits.perMonth)} in a month`,
    "Only when your sales can repay it",
  ],
  never: ["Go past these limits: the contract blocks it", "Move money anywhere but to you"],
};

/* ------------------------------------------------------------ M18 cash out */

export const cashOut = {
  available: 100,
  destinations: [
    { value: "bank", title: "Local bank account", description: "local currency to your account" },
    { value: "usd", title: "Keep in dollars", description: "move it later" },
  ],
  defaultDestination: "bank",
} as const;

/* --------------------------------------------------------------- M21 my QR */

export const myQr = {
  /** Shown under the QR; also the encoded value until real pay links exist. */
  payLink: appUrl(routes.pay),
  howToPay: [
    "They scan with any phone camera. No app needed.",
    "They pay in any token. You always get dollars.",
    `The contract splits each payment. While an advance is open, ${advance.holdback}% pays it back.`,
  ],
} as const;

/* ---------------------------------------------------------- P01 world view */

export const worldView = {
  public: [
    { k: "Shop", v: shop.pseudonym },
    { k: "Sales", v: "payer addresses and amounts" },
    { k: "Advance", v: "amount and tier" },
    { k: "Payout and owner addresses", v: "public on registration" },
    { k: "Repayments", v: `${advance.holdback}% per sale` },
    { k: "Nullifier", v: "0x9c1e…a7" },
  ],
  private: [
    { k: "Your name", v: "never collected" },
    { k: "Business facts", v: "AR · band 2 · 6m+" },
    { k: "Standing Pass", v: "1 repaid" },
    { k: "Pass secrets", v: "held on this device" },
    { k: "Backup key", v: "this device only" },
  ],
};

/* ------------------------------------------ World ID + gradual unlock (SDK-only, not in apps/web) */

/**
 * Mock World ID / gradual-unlock state: a verified human at the $100 level, first advance capped at 50% ($50).
 * Step amounts are the allowed size drawable at that step (75% of $100 rounds down to $50). The domain adds
 * `nextUnlockAt` = now + 7 days.
 */
export const humanLimit = {
  humanVerified: true,
  banned: false,
  limit: 100,
  availableNow: 50,
  unlockSteps: [
    { pct: 50, amount: 50, unlocked: true },
    { pct: 75, amount: 50, unlocked: false },
    { pct: 100, amount: 100, unlocked: false },
  ],
};
