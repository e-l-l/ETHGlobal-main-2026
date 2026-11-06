import seed from "@/config/demo-accounts.json";

export type AccountStatus = "active" | "suspended" | "closed";

export interface Account {
  id: string;
  email: string;
  password_hash: string;
  business_name: string;
  country: string; // ISO 3166-1 alpha-2
  status: AccountStatus;
  opened_months_ago?: number;
  created_at?: string; // ISO date; overrides opened_months_ago
  revenue_90d_cents: number; // USD cents, last 90 days
  locale?: "es" | "en";
}

/** acc_ + 32 lowercase hex chars = 128 random bits. Stable forever per business (nullifier input). */
export const ID_RE = /^acc_[0-9a-f]{32}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const STATUSES: AccountStatus[] = ["active", "suspended", "closed"];

export function validateAccount(raw: unknown): Account {
  const a = raw as Record<string, unknown>;
  const fail = (why: string): never => {
    throw new Error(`Invalid demo account ${JSON.stringify(a?.email ?? a?.id ?? "?")}: ${why}`);
  };
  if (!a || typeof a !== "object") fail("not an object");
  if (typeof a.id !== "string" || !ID_RE.test(a.id)) fail("id must match acc_ + 32 lowercase hex (128 random bits)");
  if (typeof a.email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(a.email)) fail("bad email");
  if (typeof a.password_hash !== "string" || !a.password_hash.startsWith("scrypt$")) fail("password_hash must be scrypt$...");
  if (typeof a.business_name !== "string" || a.business_name.length < 1 || a.business_name.length > 80) fail("business_name 1..80 chars");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(a.business_name as string)) fail("business_name has control characters");
  if (typeof a.country !== "string" || !COUNTRY_RE.test(a.country)) fail("country must be ISO alpha-2 uppercase");
  if (!STATUSES.includes(a.status as AccountStatus)) fail(`status must be one of ${STATUSES.join("|")}`);
  if (a.created_at === undefined) {
    if (!Number.isInteger(a.opened_months_ago) || (a.opened_months_ago as number) < 0) fail("opened_months_ago must be a non-negative integer");
  } else if (typeof a.created_at !== "string" || Number.isNaN(Date.parse(a.created_at))) fail("created_at must be an ISO date");
  if (!Number.isSafeInteger(a.revenue_90d_cents) || (a.revenue_90d_cents as number) < 0) fail("revenue_90d_cents must be a non-negative integer");
  return { ...(a as unknown as Account), email: (a.email as string).toLowerCase() };
}

let cache: Account[] | null = null;

export function loadAccounts(): Account[] {
  if (cache) return cache;
  const list: unknown[] = [...(seed.accounts as unknown[])];
  const extra = process.env.DEMO_EXTRA_ACCOUNTS_JSON;
  if (extra) {
    const parsed = JSON.parse(extra);
    if (!Array.isArray(parsed)) throw new Error("DEMO_EXTRA_ACCOUNTS_JSON must be a JSON array");
    list.push(...parsed);
  }
  const accounts = list.map(validateAccount);
  const ids = new Set<string>();
  const emails = new Set<string>();
  for (const a of accounts) {
    if (ids.has(a.id) || emails.has(a.email)) throw new Error(`Duplicate demo account ${a.email}`);
    ids.add(a.id);
    emails.add(a.email);
  }
  cache = accounts;
  return accounts;
}

export function resetAccountCache(): void {
  cache = null;
}

export function findByEmail(email: string): Account | undefined {
  const e = email.trim().toLowerCase();
  return loadAccounts().find((a) => a.email === e);
}

export function findById(id: string): Account | undefined {
  return loadAccounts().find((a) => a.id === id);
}
