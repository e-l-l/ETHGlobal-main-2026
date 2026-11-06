"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

const RM = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(RM);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

/** True when the user asked for reduced motion. False on the server. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(RM).matches, () => false);
}

/**
 * Whether a looping visual should run: not paused by the user, motion allowed,
 * the tab visible and the element on screen. `paused` defaults to reduced motion.
 */
export function useLive(ref: RefObject<HTMLElement | null>) {
  const reduced = useReducedMotion();
  const [userPaused, setUserPaused] = useState<boolean | null>(null);
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e?.isIntersecting)), { threshold: 0.05 });
    io.observe(el);
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ref]);

  const paused = userPaused ?? reduced;
  return { running: !paused && inView && visible, paused, reduced, setPaused: setUserPaused };
}
