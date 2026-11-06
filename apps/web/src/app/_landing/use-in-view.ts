"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Plays an entrance once when the element scrolls into view. Server and no-JS render the finished state;
 * `hidden` is true only after mount and only for elements that start below the fold, so nothing flashes.
 * Reduced motion: never hidden.
 *
 *   const { ref, hidden } = useInView<HTMLDivElement>();
 *   <div ref={ref} className={hidden ? "opacity-0" : "transition-opacity"} />
 */
export function useInView<T extends HTMLElement>(margin = "0px 0px -10% 0px") {
  const ref = useRef<T>(null);
  const [hidden, setHidden] = useState(false);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    setHidden(true);
  }, []);

  useEffect(() => {
    if (!hidden) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        setHidden(false);
        io.disconnect();
      },
      { rootMargin: margin, threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hidden, margin]);

  return { ref, hidden };
}

/** Counts from 0 to `value` once `go` is true (ease-out). Shows `value` straight away when `go` never needs waiting. */
export function useCountTo(value: number, go: boolean, ms = 1100) {
  const [v, setV] = useState(go ? value : 0);
  useEffect(() => {
    if (!go) return;
    // Reduced motion: jump to the end on the first frame.
    const dur = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = dur ? Math.min(1, (now - t0) / dur) : 1;
      setV(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [go, value, ms]);
  return v;
}
