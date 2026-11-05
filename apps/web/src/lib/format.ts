const CRYPTO_LIKE = new Set(["USDC", "USDT", "DAI"]);

/* Intl.NumberFormat construction is the expensive part; cache one per locale/precision. */
const formatters = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: string, digits: number) {
  const key = `${locale}|${digits}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(key, f);
  }
  return f;
}

function fractionDigits(currency: string, amount: number) {
  if (CRYPTO_LIKE.has(currency) || currency === "USD") return Number.isInteger(amount) ? 0 : 2;
  return 0;
}

/** "$1,234" / "$12.50" for USD; "1,234 USDC"; "ARS 150,000" for other fiat. */
export function formatMoney(amount: number, currency = "USD", locale = "en-US"): string {
  const num = numberFormat(locale, fractionDigits(currency, amount)).format(Math.abs(amount));
  const sign = amount < 0 ? "-" : "";
  if (currency === "USD") return `${sign}$${num}`;
  if (CRYPTO_LIKE.has(currency)) return `${sign}${num} ${currency}`;
  return `${currency} ${sign}${num}`;
}

/** Local-currency approximation line: "≈ ARS 150,000". */
export function formatLocal(amount: number, currency: string, locale = "en-US"): string {
  return `≈ ${formatMoney(amount, currency, locale)}`;
}

/** "13,500": plain grouped number, no currency. */
export function formatNumber(value: number, locale = "en-US"): string {
  return numberFormat(locale, Number.isInteger(value) ? 0 : 2).format(value);
}

/** "40%". */
export function formatPercent(value: number): string {
  return `${value}%`;
}

/** "~23 days". */
export function formatDays(days: number, approx = true): string {
  return `${approx ? "~" : ""}${days} ${days === 1 ? "day" : "days"}`;
}

/** "0x7a3e…91c2". Short strings (pseudonyms like "shop_7f3a") pass through unchanged. */
export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
