"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/*
 * Scroll reveal. One rule: content that starts below the fold fades up once as it enters.
 * - Compositor only (opacity + translate), 600ms ease-snappy, fires once, never replays.
 * - Server and no-JS render fully visible; the hidden state is armed only after mount, and only
 *   for elements that start below the fold, so above-the-fold content never flashes.
 * - Reduced motion: nothing is armed.
 * - Siblings stagger with `delay` (ms). Keep the whole group under ~400ms.
 */

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

type Phase = "idle" | "hidden" | "shown";

export function Reveal({
  as: Tag = "div",
  delay = 0,
  distance = 16,
  className,
  children,
}: {
  as?: ElementType;
  /** Stagger offset in ms. */
  delay?: number;
  /** Start offset in px. */
  distance?: number;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return; // already in view
    setPhase("hidden");
  }, []);

  useEffect(() => {
    if (phase !== "hidden") return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setPhase("shown");
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [phase]);

  return (
    <Tag
      ref={ref}
      data-reveal={phase}
      style={{ "--reveal-y": `${distance}px`, transitionDelay: phase === "shown" ? `${delay}ms` : undefined }}
      className={cn(
        "data-[reveal=hidden]:translate-y-(--reveal-y) data-[reveal=hidden]:opacity-0",
        "data-[reveal=shown]:translate-y-0 data-[reveal=shown]:opacity-100 data-[reveal=shown]:transition-[opacity,translate] data-[reveal=shown]:duration-600 data-[reveal=shown]:ease-snappy",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/** Hairline under the sticky header that fills with page scroll. CSS scroll timeline; invisible where unsupported. */
export function ScrollProgress({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-[-1px] h-px origin-left bg-hunter motion-reduce:hidden",
        "[animation:scroll-progress_linear_both] [animation-timeline:scroll(root)]",
        className,
      )}
    />
  );
}
