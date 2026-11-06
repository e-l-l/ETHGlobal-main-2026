"use client";

/**
 * A small typed data hook over the one SDK instance (lib/mra.ts). No dependencies, no cache library.
 *
 *   const { data, error } = useMRA(q.home, { initial });          // initial: from serverView() on the server
 *   const { data } = useMRA(q.home, { initial, refreshMs: 4000 }); // polling (the sales feed)
 *
 * With `initial` (mock mode, rendered on the server) it doesn't fetch at all unless `refreshMs` is set, so the
 * server HTML and the hydrated client are identical. Without it (local / sepolia), it loads on mount.
 *
 * Stale-while-revalidate (local / sepolia): the last answer for the same query on the same page (this tab, same
 * wallet) shows at once with `stale: true` while a fresh one loads (`refreshing`). Key: `opts.key`, or the query's
 * source + the page's path and search. `cache: false` opts out. Any successful write clears the cache (lib/mra-cache).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { cacheClear, cacheGet, cacheKey, cacheSet } from "./mra-cache";
import { errorCode, getMRA, isMock, type MRA } from "./mra";

export type MRAQuery<T> = (mra: MRA) => Promise<T>;

export type UseMRAResult<T> = {
  data: T | undefined;
  /** The SDK's stable error code ("session_missing", "anon_rpc_unavailable", ...). */
  error: string | undefined;
  loading: boolean;
  reload: () => void;
  /** `data` came from the cache and a fresh read hasn't landed yet. */
  stale?: boolean;
  /** A read is in flight while `data` is already showing. */
  refreshing?: boolean;
};

function keyFor(query: MRAQuery<unknown>, explicit?: string): string | undefined {
  if (isMock || typeof window === "undefined") return undefined;
  return cacheKey(explicit ?? `${window.location.pathname}${window.location.search}|${query.toString()}`);
}

export function useMRA<T>(
  query: MRAQuery<T>,
  opts: { initial?: T | null; refreshMs?: number; enabled?: boolean; key?: string; cache?: boolean } = {},
): UseMRAResult<T> {
  const { initial, refreshMs, enabled = true, cache = true } = opts;
  const hasInitial = initial !== null && initial !== undefined;
  const [data, setData] = useState<T | undefined>(hasInitial ? initial : undefined);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(!hasInitial && enabled);
  const [stale, setStale] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });
  const explicitKey = opts.key;

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const key = cache && !hasInitial ? keyFor(queryRef.current as MRAQuery<unknown>, explicitKey) : undefined;
    // Paint the cached answer first (read after mount, so the hydrated HTML still matches the server's).
    if (key && nonce === 0) {
      const hit = cacheGet<T>(key);
      if (hit) {
        setData(hit.v);
        setStale(true);
        setLoading(false);
      }
    }
    const run = async () => {
      setRefreshing(true);
      try {
        const next = await queryRef.current(await getMRA());
        if (!alive) return;
        setData(next);
        setError(undefined);
        setStale(false);
        // Re-derive the key: the namespace is only known once getMRA() has resolved on a fresh tab.
        if (cache && !hasInitial) cacheSet(keyFor(queryRef.current as MRAQuery<unknown>, explicitKey), next);
      } catch (e) {
        if (alive) setError(errorCode(e));
      } finally {
        if (alive) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    // Already have server data and nothing to refresh: no client fetch (the default in mock mode).
    if (!(hasInitial && nonce === 0 && !refreshMs)) void run();
    let timer: number | undefined;
    if (refreshMs) {
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") void run();
      }, refreshMs);
    }
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, [enabled, hasInitial, refreshMs, nonce, cache, explicitKey]);

  return { data, error, loading, reload, stale, refreshing };
}

/**
 * One SDK call from a button: `const pay = useMRAAction((m, amount: number) => m.pay.pay(id, amount));`
 * then `await pay.run(10)`. `run` rethrows, so a caller can route on the result or the error.
 */
export function useMRAAction<A extends unknown[], R>(fn: (mra: MRA, ...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  const run = useCallback(async (...args: A): Promise<R> => {
    setPending(true);
    setError(undefined);
    try {
      const out = await fnRef.current(await getMRA(), ...args);
      // A write landed: every cached read may now be out of date.
      cacheClear();
      return out;
    } catch (e) {
      setError(errorCode(e));
      throw e;
    } finally {
      setPending(false);
    }
  }, []);
  return { run, pending, error };
}
