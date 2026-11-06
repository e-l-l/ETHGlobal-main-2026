"use client";

import { useSyncExternalStore } from "react";
import { formatMoney } from "./format";

/**
 * The local currency shown next to dollars ("≈ ARS 10,100"). A setting, not data: a cookie the Settings dropdown
 * writes, read on the client. Rates are examples and every screen labels them that way.
 *
 * The SDK still computes its own local figures at ARS_PER_USD (lib/mra.ts); screens convert those back to dollars
 * and format them here, so the chosen currency is the only one the user sees.
 */
export const CURRENCIES = [
  { code: "ARS", name: "Argentine peso", perUsd: 1010 },
  { code: "NGN", name: "Nigerian naira", perUsd: 1550 },
  { code: "KES", name: "Kenyan shilling", perUsd: 129 },
  { code: "GHS", name: "Ghanaian cedi", perUsd: 15 },
  { code: "BRL", name: "Brazilian real", perUsd: 5.4 },
  { code: "MXN", name: "Mexican peso", perUsd: 18.5 },
  { code: "INR", name: "Indian rupee", perUsd: 88 },
  /** Dollars only: no local line anywhere. */
  { code: "USD", name: "US dollar", perUsd: 1 },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];
export const DEFAULT_CURRENCY: CurrencyCode = "USD";
export const CURRENCY_COOKIE = "dj-currency";

const isCode = (v: unknown): v is CurrencyCode => CURRENCIES.some((c) => c.code === v);

function read(): CurrencyCode {
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${CURRENCY_COOKIE}=([^;]+)`));
  const v = m?.[1];
  return isCode(v) ? v : DEFAULT_CURRENCY;
}

const listeners = new Set<() => void>();
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function setCurrency(code: CurrencyCode) {
  document.cookie = `${CURRENCY_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
  listeners.forEach((l) => l());
}

/** The chosen currency. Server render and hydration use the default; the cookie's value follows right after. */
export function useCurrency() {
  const code = useSyncExternalStore(subscribe, read, () => DEFAULT_CURRENCY);
  const c = CURRENCIES.find((x) => x.code === code) ?? CURRENCIES[0];
  const toLocal = (usd: number) => usd * c.perUsd;
  const format = (usd: number) => formatMoney(Math.round(toLocal(usd)), c.code);
  return {
    code: c.code,
    /** USD chosen: screens hide the local line instead of repeating the dollars. */
    dollarsOnly: c.code === "USD",
    name: c.name,
    perUsd: c.perUsd,
    toLocal,
    /** "ARS 10,100" */
    format,
    /** "≈ ARS 10,100" */
    approx: (usd: number) => `≈ ${format(usd)}`,
    /** "1 USD = 1,010 ARS" */
    rateLine: `1 USD = ${c.perUsd.toLocaleString("en-US")} ${c.code}`,
  };
}

/**
 * A dollar amount in the chosen local currency, for server components: `<LocalAmount usd={10} />` → "≈ ARS 10,100".
 * Renders nothing (wrapper included) when dollars only.
 */
export function LocalAmount({ usd, approx = true, className }: { usd: number; approx?: boolean; className?: string }) {
  const cur = useCurrency();
  if (cur.dollarsOnly) return null;
  return <span className={className}>{approx ? cur.approx(usd) : cur.format(usd)}</span>;
}

/** " Example rate 1 USD = 1,010 ARS.", for server components. Nothing when dollars only. */
export function ExampleRate() {
  const cur = useCurrency();
  return cur.dollarsOnly ? null : <> Example rate {cur.rateLine}.</>;
}
