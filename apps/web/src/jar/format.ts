/** Example rate for the demo (anay-design.md section 8). Always labelled as an example in the UI. */
export const ARS_PER_USD = 1010;

const usd = new Map<number, Intl.NumberFormat>();
function usdFormat(digits: number) {
  let f = usd.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    usd.set(digits, f);
  }
  return f;
}
const ars = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

/** "$46" or "$46.50". Dollars first, always. */
export function usdText(amount: number, digits?: number) {
  const d = digits ?? (Number.isInteger(amount) ? 0 : 2);
  return `${amount < 0 ? "-" : ""}$${usdFormat(d).format(Math.abs(amount))}`;
}

/** "≈ ARS 87.264": Argentine separators, prefixed with ≈. */
export function arsText(usdAmount: number) {
  return `≈ ARS ${ars.format(Math.round(usdAmount * ARS_PER_USD))}`;
}
