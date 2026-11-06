import { formatMoney } from "../format.js";
import { APP_NAME } from "../mock/brand.js";

export const USDC = 1_000_000;
/** USDC base units → dollars (number). */
export const usd = (base: bigint | number) => Number(base) / USDC;
export const toBase = (dollars: number) => BigInt(Math.round(dollars * USDC));
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => formatMoney(round2(n));
export const pctStr = (n: number, digits = 1) => `${(Number.isFinite(n) ? n : 0).toFixed(digits)}%`;
export const num = (n: number, digits = 1) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
export const int = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "5 Nov" */
export function shortDate(unix: number) {
  const d = new Date(unix * 1000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
/** "Thursday 5 Nov" */
export function longDate(unix: number) {
  return `${DAYS[new Date(unix * 1000).getDay()]} ${shortDate(unix)}`;
}
/** "4:20 pm" */
export function clock(unix: number) {
  const d = new Date(unix * 1000);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
export function sameDay(a: number, b: number) {
  return new Date(a * 1000).toDateString() === new Date(b * 1000).toDateString();
}
/** "today" or "5 Oct" (agent log style). */
export function dayLabel(unix: number, now: number) {
  return sameDay(unix, now) ? "today" : shortDate(unix);
}
/** "2m ago" / "1h ago" / "Today" / "Nov 4" (explorer style). */
export function ago(unix: number, now: number) {
  const s = Math.max(0, now - unix);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 6 * 3600) return `${Math.round(s / 3600)}h ago`;
  if (sameDay(unix, now)) return "Today";
  const d = new Date(unix * 1000);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Public pseudonym for a bytes32 shop id: "shop_7f3a". Carries no identity. */
export const pseudonymOf = (shopId: string) => `shop_${shopId.slice(2, 6).toLowerCase()}`;
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "S";
export const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "shop";
export const payLinkFor = (name: string) => `pay.${APP_NAME}/${slug(name)}`;
/**
 * The real pay link (what the merchant's QR encodes): the C01 page plus `?shop=<bytes32 id>&name=<display name>`.
 * The name is not onchain (shops are pseudonymous), so the link carries it. `base` = MRAConfig.payUrl.
 */
export function payUrlFor(base: string | undefined, name: string, shopId: string) {
  const root = base ?? `https://${payLinkFor(name)}`;
  return `${root}${root.includes("?") ? "&" : "?"}${new URLSearchParams({ shop: shopId, name })}`;
}

/** Split a sale between the shop and the advance (holdback in percent). */
export function splitSale(total: number, holdbackPct: number) {
  const repay = (total * holdbackPct) / 100;
  return { you: total - repay, repay };
}

/** Block explorer for a chain id: Etherscan for Sepolia / mainnet, undefined for the local devnet. */
export const etherscanFor = (chainId: number) => (chainId === 11_155_111 ? "https://sepolia.etherscan.io" : chainId === 1 ? "https://etherscan.io" : undefined);

export const truncate = (s: string, head = 6, tail = 4) => (s.length <= head + tail + 1 ? s : `${s.slice(0, head)}…${s.slice(-tail)}`);

/**
 * Junior coverage, as docs/economics.md defines it: (junior + reserve) as a share of outstanding advances.
 * `undefined` with nothing outstanding (there is nothing to cover). Display caps at ">999%": early on a testnet a few
 * dollars outstanding against a funded junior gives five-digit percentages that read like a bug.
 */
export function coveragePct(juniorAssets: bigint, reserve: bigint, outstanding: bigint): number | undefined {
  if (outstanding <= 0n) return undefined;
  return ((usd(juniorAssets) + usd(reserve)) / usd(outstanding)) * 100;
}
export const coverageStr = (pct: number | undefined) => (pct === undefined ? "—" : pct > 999 ? ">999%" : pctStr(pct));

/** An agent trigger id ("junior_twap_drop") as screen words ("DRIP price drop"). The ids stay as the agents send them. */
export function triggerName(id: string): string {
  return id === "junior_twap_drop" ? "DRIP price drop" : id.replace(/_/g, " ");
}

/** Simple annualized flat-fee cost, assuming repayment after the estimated number of days. Not an APR. */
export function annualizedCost(principal: number, fee: number, days: number): number | undefined {
  if (!(principal > 0 && days > 0 && fee >= 0)) return undefined;
  return (fee / principal) * (365 / days) * 100;
}
