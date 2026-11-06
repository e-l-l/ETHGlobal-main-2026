import type { Account } from "./accounts";

/**
 * Revenue bands, as a monthly average over the last 90 days (USD cents per month).
 *   band 1: >= $500/mo   band 2: >= $2,000/mo   band 3: >= $10,000/mo
 * "Monthly average over 90 days" = revenue_90d / 3, so we compare revenue_90d >= 3 * threshold
 * in integer cents (no floating point at the boundary).
 */
export const BAND_MONTHLY_THRESHOLDS_CENTS = [50_000, 200_000, 1_000_000] as const;
export const MIN_AGE_MONTHS = 6;

export function bandGe(band: 1 | 2 | 3, revenue90dCents: number): boolean {
  return revenue90dCents >= 3 * BAND_MONTHLY_THRESHOLDS_CENTS[band - 1];
}

export function revenueBand(revenue90dCents: number): 0 | 1 | 2 | 3 {
  if (bandGe(3, revenue90dCents)) return 3;
  if (bandGe(2, revenue90dCents)) return 2;
  if (bandGe(1, revenue90dCents)) return 1;
  return 0;
}

/** Whole calendar months elapsed between `from` and `to` (UTC), never negative. */
export function monthsBetween(from: Date, to: Date): number {
  let m = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  const fromRest = ((from.getUTCDate() * 24 + from.getUTCHours()) * 60 + from.getUTCMinutes()) * 60 + from.getUTCSeconds();
  const toRest = ((to.getUTCDate() * 24 + to.getUTCHours()) * 60 + to.getUTCMinutes()) * 60 + to.getUTCSeconds();
  if (toRest < fromRest) m -= 1;
  return Math.max(0, m);
}

export function ageOk(ageMonths: number): boolean {
  return ageMonths >= MIN_AGE_MONTHS;
}

/** Subtract whole months, clamping the day (e.g. Mar 31 - 1 month = Feb 28/29). */
export function subtractMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth() - months;
  const target = new Date(Date.UTC(y, mo, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target;
}

/**
 * Opening date of an account. Seeds use `opened_months_ago` (relative, so the demo never drifts:
 * "New Shop" stays 2 months old forever) and land 9 days past the month mark so the whole-month
 * count is stable. An absolute `created_at` overrides it.
 */
export function accountCreatedAt(a: Account, now: Date): Date {
  if (a.created_at) return new Date(a.created_at);
  const d = subtractMonths(now, a.opened_months_ago ?? 0);
  d.setUTCDate(d.getUTCDate() - 9);
  return d;
}

/**
 * The zkTLS response body. KEY ORDER IS PART OF THE CONTRACT: the Reclaim regexes match exact
 * byte sequences, so never reorder, rename or pretty-print. Booleans come first; the values that
 * must never be revealed (exact numbers, id, name) come last.
 */
export interface Summary {
  v: 1;
  status: Account["status"];
  country: string;
  age_ok: boolean;
  band_ge_1: boolean;
  band_ge_2: boolean;
  band_ge_3: boolean;
  account_age_months: number;
  revenue_90d_cents: number;
  currency: "USD";
  account_id: string;
  business_name: string;
}

export function buildSummary(a: Account, now: Date = new Date()): Summary {
  const months = monthsBetween(accountCreatedAt(a, now), now);
  const rev = a.revenue_90d_cents;
  // Object literal order == JSON key order (ES2015+ insertion order for string keys).
  return {
    v: 1,
    status: a.status,
    country: a.country,
    age_ok: ageOk(months),
    band_ge_1: bandGe(1, rev),
    band_ge_2: bandGe(2, rev),
    band_ge_3: bandGe(3, rev),
    account_age_months: months,
    revenue_90d_cents: rev,
    currency: "USD",
    account_id: a.id,
    business_name: a.business_name,
  };
}

/** Compact JSON (no whitespace). JSON.stringify escapes every `"` inside strings as `\"`, so a
 *  business name can never forge a `"key":value` sequence that the matches would accept. */
export function serializeSummary(s: Summary): string {
  return JSON.stringify(s);
}
