/**
 * The time-based fee, as the contract charges it (AdvanceBook.accruedFee): it accrues on the ORIGINAL advance,
 * linearly per second at `rateBpsPerWeek`, and stops at `capBps`. It is paid before principal and stops growing once
 * the advance is paid off, so paying early saves fee. Fall behind the 1% weekly minimum and the rate doubles to 1% a week
 * (max 6% total) until the merchant catches up; the extra goes to the safety reserve.
 *
 * These helpers are for illustrations (limits form, approve screen). Live balances come from the SDK
 * (`AdvanceVM.owedNow`, `feeSoFar`, `feeIfRepaidIn…`), never from here.
 */

/** Default signed terms: 0.5% a week, never more than 3%. */
export const FEE_TERMS = { rateBpsPerWeek: 50, capBps: 300 } as const;
/** Pilot holdback: 8% of each sale repays the advance. */
export const HOLDBACK_PCT = 8;

/** The on-time / late rule (same text as `AdvanceVM.feeRule`), for screens without an advance yet. */
export const FEE_RULE =
  "Paying on time keeps your fee at 0.5% a week, max 3%. If you fall behind the minimum, the fee doubles to 1% a week (max 6% total) until you catch up; the extra goes to the safety reserve.";

/** The one line every merchant surface uses. */
export const FEE_LINE = "Fee 0.5% per week while you owe, never more than 3%.";

export type FeeTerms = { rateBpsPerWeek: number; capBps: number };

/** Fee in USD if the advance is fully repaid after `days`. */
export function feeAfterDays(principal: number, days: number, t: FeeTerms = FEE_TERMS): number {
  const bps = Math.min(t.capBps, (t.rateBpsPerWeek * Math.max(0, days)) / 7);
  return Math.round(principal * bps) / 10_000;
}

/** The most the fee can ever be. */
export function maxFee(principal: number, t: FeeTerms = FEE_TERMS): number {
  return Math.round(principal * t.capBps) / 10_000;
}

/**
 * Days to pay off `principal` (plus the fee that accrues meanwhile) when `holdbackPct` of `dailySales` goes to it.
 * Two passes are enough: the fee is at most 3%, so it moves the answer by a day or two.
 */
export function payoffDays(principal: number, dailySales: number, holdbackPct: number, t: FeeTerms = FEE_TERMS): number {
  const perDay = (dailySales * holdbackPct) / 100;
  if (!(perDay > 0)) return 0;
  let days = principal / perDay;
  for (let i = 0; i < 2; i++) days = (principal + feeAfterDays(principal, days, t)) / perDay;
  return Math.ceil(days);
}

/**
 * Simple annualized maximum (not an APR): the weekly rate times 52. The cap limits the total fee, not this rate, so
 * at 0.5% a week it is 26%/yr. Matches the SDK's `AdvanceVM.annualizedCostPercent`; prefer that when you have one.
 */
export function annualizedMaxPercent(t: FeeTerms = FEE_TERMS): number {
  return (t.rateBpsPerWeek * 52) / 100;
}
