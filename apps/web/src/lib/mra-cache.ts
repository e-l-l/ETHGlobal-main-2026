/**
 * Stale-while-revalidate store for useMRA: an in-memory Map, mirrored to sessionStorage so a reload or a new route in
 * the same tab paints the last answer at once while the fresh one loads (live reads cross the Anon-RPC mixnet: seconds
 * each). Values round-trip as JSON; bigint is tagged. A value that can't be serialized stays memory-only.
 *
 * Correctness: every entry lives under a namespace of mode + this device's wallet. Any successful write
 * (useMRAAction / withMRA) clears everything, so a new shop, a payment or a deposit is never hidden behind old data.
 */
const PREFIX = "mra:swr:";
const ID_KEY = "mra:swr-id";
const mem = new Map<string, { v: unknown; at: number }>();

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

const replacer = (_k: string, x: unknown) => (typeof x === "bigint" ? { __bigint: x.toString() } : x);
const reviver = (_k: string, x: unknown) =>
  x && typeof x === "object" && "__bigint" in x && Object.keys(x).length === 1 ? BigInt((x as { __bigint: string }).__bigint) : x;

/** The namespace this tab's entries are filed under ("" until known: then nothing is cached). */
let namespace: string | undefined = storage()?.getItem(ID_KEY) ?? undefined;

export function cacheKey(base: string): string | undefined {
  return namespace ? `${PREFIX}${namespace}|${base}` : undefined;
}

export function cacheGet<T>(key: string | undefined): { v: T; at: number } | undefined {
  if (!key) return undefined;
  const hit = mem.get(key);
  if (hit) return hit as { v: T; at: number };
  try {
    const raw = storage()?.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw, reviver) as { v: T; at: number };
    mem.set(key, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

export function cacheSet(key: string | undefined, v: unknown): void {
  if (!key) return;
  const entry = { v, at: Date.now() };
  mem.set(key, entry);
  try {
    storage()?.setItem(key, JSON.stringify(entry, replacer));
  } catch {
    /* not serializable or quota: memory only */
  }
}

/** Forget every cached read (after any write). */
export function cacheClear(): void {
  mem.clear();
  const s = storage();
  if (!s) return;
  try {
    for (let i = s.length - 1; i >= 0; i--) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) s.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/** Set the identity (mode + wallet) once the SDK instance is up. A different identity drops the old entries. */
export function cacheIdentity(id: string): void {
  if (id === namespace) return;
  cacheClear();
  namespace = id;
  try {
    storage()?.setItem(ID_KEY, id);
  } catch {
    /* ignore */
  }
}
