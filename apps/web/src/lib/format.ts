const CRYPTO_LIKE = new Set(["USDC", "USDT", "DAI"]);

function fractionDigits(currency: string, amount: number) {
  if (CRYPTO_LIKE.has(currency) || currency === "USD") return Number.isInteger(amount) ? 0 : 2;
  return 0;
}

/** "$1,234" / "$12.50" for USD; "1,234 USDC"; "ARS 150,000" for other fiat. */
export function formatMoney(amount: number, currency = "USD", locale = "en-US"): string {
  const digits = fractionDigits(currency, amount);
  const num = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
  if (currency === "USD") return `${amount < 0 ? "-" : ""}$${num.replace("-", "")}`;
  if (CRYPTO_LIKE.has(currency)) return `${num} ${currency}`;
  return `${currency} ${num}`;
}

/** Local-currency approximation line: "≈ ARS 150,000". */
export function formatLocal(amount: number, currency: string, locale = "en-US"): string {
  return `≈ ${formatMoney(amount, currency, locale)}`;
}

/** "0x7a3e…91c2". Short strings (pseudonyms like "shop_7f3a") pass through unchanged. */
export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}
