/**
 * Screen-specific mock data for the merchant app.
 * Shared shop / advance numbers live in ./shop.ts.
 */
import { appUrl } from "@/lib/brand";
import { formatMoney } from "@/lib/format";
import { routes } from "@/lib/routes";
import { advance, agentLimits, shop, toUsd } from "./shop";

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

/* --------------------------------------------------------- M07 agent setup */

export const perAdvanceOptions = [
  { value: 50 },
  { value: 100 },
  { value: 200, lockedReason: "$200 unlocks after 2 repaid advances" },
  { value: 300, lockedReason: "$300 unlocks after 3 repaid advances" },
] as const;

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
    "They pay in digital dollars (USDC). On this testnet demo it's test USDC.",
    `The contract splits each payment. While an advance is open, ${advance.holdback}% pays it back.`,
  ],
} as const;

/* ---------------------------------------------------------- P01 world view */

export const worldView = {
  public: [
    { k: "Shop", v: shop.id },
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
