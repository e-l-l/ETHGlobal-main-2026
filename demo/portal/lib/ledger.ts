import type { Account } from "./accounts";
import { accountCreatedAt } from "./summary";

// Deterministic, believable dashboard data derived from the seed. The daily totals sum EXACTLY
// to revenue_90d_cents, so the dashboard and /api/me/summary always agree.

const DAY_MS = 86_400_000;

function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface DayTotal {
  date: string; // YYYY-MM-DD
  cents: number;
}

/** 90 entries, oldest first; the last entry is today. */
export function dailyTotals(a: Account, now: Date = new Date()): DayTotal[] {
  const rnd = mulberry32(seedFrom(a.id));
  const today = startOfUtcDay(now);
  const opened = startOfUtcDay(accountCreatedAt(a, now));
  const days: { date: Date; w: number }[] = [];
  for (let i = 89; i >= 0; i--) {
    const date = new Date(today.getTime() - i * DAY_MS);
    const open = date >= opened;
    const dow = date.getUTCDay();
    const weekend = dow === 6 ? 1.35 : dow === 0 ? 0.6 : 1;
    const ramp = 0.85 + 0.3 * ((89 - i) / 89); // gentle growth
    days.push({ date, w: open ? (0.55 + rnd() * 0.9) * weekend * ramp : 0 });
  }
  const sumW = days.reduce((s, d) => s + d.w, 0);
  const total = a.revenue_90d_cents;
  const out: DayTotal[] = days.map((d) => ({
    date: d.date.toISOString().slice(0, 10),
    cents: sumW > 0 ? Math.floor((total * d.w) / sumW) : 0,
  }));
  const assigned = out.reduce((s, d) => s + d.cents, 0);
  const lastOpen = [...days].map((d, i) => (d.w > 0 ? i : -1)).filter((i) => i >= 0).pop();
  if (lastOpen !== undefined) out[lastOpen].cents += total - assigned;
  return out;
}

export function weeklyTotals(days: DayTotal[]): DayTotal[] {
  // The last 12 full weeks (84 days), oldest first; `date` is the first day of each week.
  const weeks: DayTotal[] = [];
  for (let end = days.length; end - 7 >= 0 && weeks.length < 12; end -= 7) {
    const slice = days.slice(end - 7, end);
    weeks.unshift({ date: slice[0].date, cents: slice.reduce((s, d) => s + d.cents, 0) });
  }
  return weeks;
}

export type TxKind = "sale" | "payout" | "fee";
export interface Transaction {
  id: string;
  at: string; // ISO timestamp
  kind: TxKind;
  method: string;
  cents: number; // negative for payouts and fees
}

const METHODS = ["qr", "card", "card", "transfer", "link"] as const;

export function recentTransactions(a: Account, now: Date = new Date(), count = 10): Transaction[] {
  const rnd = mulberry32(seedFrom(`${a.id}:tx`));
  const days = dailyTotals(a, now);
  const txs: Transaction[] = [];
  for (let back = 0; back < 6 && txs.length < count + 4; back++) {
    const day = days[days.length - 1 - back];
    if (!day || day.cents <= 0) continue;
    const n = 2 + Math.floor(rnd() * 3);
    let left = day.cents;
    for (let k = 0; k < n; k++) {
      const share = k === n - 1 ? left : Math.floor(left * (0.15 + rnd() * 0.3));
      left -= share;
      const hour = 20 - Math.floor((k * 11) / n) - Math.floor(rnd() * 2);
      const at = new Date(`${day.date}T${String(Math.max(8, hour)).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:00Z`);
      if (at > now) continue;
      const method = METHODS[Math.floor(rnd() * METHODS.length)];
      const last4 = String(1000 + Math.floor(rnd() * 9000));
      txs.push({
        id: `op_${Math.floor(rnd() * 1e10).toString(36).toUpperCase()}`,
        at: at.toISOString(),
        kind: "sale",
        method: method === "card" ? `card:${last4}` : method,
        cents: share,
      });
    }
    if (back === 2) {
      const payout = -Math.round(days.slice(-10, -3).reduce((s, d) => s + d.cents, 0) * 0.9);
      if (payout < 0) {
        txs.push({ id: `po_${Math.floor(rnd() * 1e10).toString(36).toUpperCase()}`, at: `${day.date}T06:00:00.000Z`, kind: "payout", method: "bank", cents: payout });
      }
    }
  }
  return txs.sort((x, y) => (x.at < y.at ? 1 : -1)).slice(0, count);
}

export interface Balances {
  available_cents: number;
  pending_cents: number;
  last_30d_cents: number;
  prev_30d_cents: number;
  sales_count_30d: number;
}

export function balances(a: Account, now: Date = new Date()): Balances {
  const days = dailyTotals(a, now);
  const sum = (xs: DayTotal[]) => xs.reduce((s, d) => s + d.cents, 0);
  const last30 = sum(days.slice(-30));
  const avgTicket = 1800 + (seedFrom(a.id) % 2200); // $18-$40
  return {
    available_cents: Math.round(sum(days.slice(-9, -2)) * 0.1 + sum(days.slice(-3, -2))),
    pending_cents: sum(days.slice(-2)),
    last_30d_cents: last30,
    prev_30d_cents: sum(days.slice(-60, -30)),
    sales_count_30d: Math.round(last30 / avgTicket),
  };
}

export interface PayoutSettings {
  destination: string;
  schedule: "daily" | "weekly";
  holder: string;
}

export function payoutSettings(a: Account): PayoutSettings {
  const last4 = String(1000 + (seedFrom(`${a.id}:bank`) % 9000));
  const dest: Record<string, string> = {
    AR: `CBU •••• ${last4}`,
    NG: `NUBAN •••• ${last4}`,
    KE: `M-Pesa Till •••• ${last4.slice(1)}`,
  };
  return {
    destination: dest[a.country] ?? `IBAN •••• ${last4}`,
    schedule: a.revenue_90d_cents >= 600_000 ? "daily" : "weekly",
    holder: a.business_name,
  };
}
