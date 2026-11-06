"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/use-live";

/*
 * Count-up for money that changes. Tweens from the last shown value to the new one (default 450ms, ease-out),
 * so a figure that ticks reads as "it just moved". The server and no-JS render the real value; `initial` (count
 * from, e.g. 0) is applied before first paint on the client. Reduced motion: jumps straight to the value.
 */

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useCountUp(target: number, ms = 450, initial?: number) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const pendingInitial = useRef(initial);

  useIsoLayoutEffect(() => {
    if (pendingInitial.current !== undefined && !reduced) {
      from.current = pendingInitial.current;
      setShown(pendingInitial.current);
    }
    pendingInitial.current = undefined;
  }, [reduced]);

  useEffect(() => {
    if (reduced || from.current === target) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - (1 - p) ** 3;
      /* Whole cents while in flight, the exact target on the last frame. */
      const v = p < 1 ? Math.round((start + (target - start) * eased) * 100) / 100 : target;
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, reduced]);

  return shown;
}

/** Renders `format(value)` and tweens when `value` changes. */
export function CountUp({
  value,
  format,
  ms,
  from,
}: {
  value: number;
  format: (v: number) => string;
  ms?: number;
  /** Start here on mount (e.g. 0 for an amount that just arrived). */
  from?: number;
}) {
  const shown = useCountUp(value, ms, from);
  return <>{format(shown)}</>;
}
