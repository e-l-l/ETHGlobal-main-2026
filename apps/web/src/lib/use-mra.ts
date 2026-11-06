"use client";

/**
 * A small typed data hook over the one SDK instance (lib/mra.ts). No dependencies, no cache library.
 *
 *   const { data, error } = useMRA(q.home, { initial });          // initial: from serverView() on the server
 *   const { data } = useMRA(q.home, { initial, refreshMs: 4000 }); // polling (the sales feed)
 *
 * With `initial` (mock mode, rendered on the server) it doesn't fetch at all unless `refreshMs` is set, so the
 * server HTML and the hydrated client are identical. Without it (local / sepolia), it loads on mount.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { errorCode, getMRA, type MRA } from "./mra";

export type MRAQuery<T> = (mra: MRA) => Promise<T>;

export type UseMRAResult<T> = {
  data: T | undefined;
  /** The SDK's stable error code ("session_missing", "anon_rpc_unavailable", ...). */
  error: string | undefined;
  loading: boolean;
  reload: () => void;
};

export function useMRA<T>(
  query: MRAQuery<T>,
  opts: { initial?: T | null; refreshMs?: number; enabled?: boolean } = {},
): UseMRAResult<T> {
  const { initial, refreshMs, enabled = true } = opts;
  const hasInitial = initial !== null && initial !== undefined;
  const [data, setData] = useState<T | undefined>(hasInitial ? initial : undefined);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(!hasInitial && enabled);
  const [nonce, setNonce] = useState(0);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  });

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = async () => {
      try {
        const next = await queryRef.current(await getMRA());
        if (!alive) return;
        setData(next);
        setError(undefined);
      } catch (e) {
        if (alive) setError(errorCode(e));
      } finally {
        if (alive) setLoading(false);
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
  }, [enabled, hasInitial, refreshMs, nonce]);

  return { data, error, loading, reload };
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
      return await fnRef.current(await getMRA(), ...args);
    } catch (e) {
      setError(errorCode(e));
      throw e;
    } finally {
      setPending(false);
    }
  }, []);
  return { run, pending, error };
}
