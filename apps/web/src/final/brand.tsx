"use client";

import { useEffect, useId, useLayoutEffect, useState } from "react";
import { useReducedMotion } from "@/lib/use-live";
import { cn } from "@/lib/cn";
import { APP_NAME } from "@/lib/brand";

/*
 * Ribbon drop, from dev2 (anay-design.md section 5). Four bands slanted 16°, 5.8u thick,
 * 1.8u gaps, clipped to the drop on a 40-unit grid. Lit bands = tier + 1, from the bottom.
 *
 * Colour on light grounds: bands Hunter, lit band Leaf (lime would vanish on white).
 * On Hunter or Charcoal: bands Honeydew, lit band Lime. Never another hue.
 */

const DROP = "M20 1.5C20 1.5 7 16.5 7 26a13 13 0 0 0 26 0C33 16.5 20 1.5 20 1.5Z";
const BANDS: readonly [number, number][] = [
  [31.8, 50],
  [24.2, 30.0],
  [16.6, 22.4],
  [-10, 14.8],
];
const RISE = 0.28 * 20;
const pts = ([u, l]: readonly [number, number]) => `0,${u + RISE} 40,${u - RISE} 40,${l - RISE} 0,${l + RISE}`;

/* The palette as CSS variables, so fills and the band keyframes (final.css) share them. */
const SURFACE = {
  light: "[--band-base:var(--color-hunter)] [--band-on:var(--color-leaf)] [--band-off:var(--color-unlit)]",
  meter: "[--band-base:var(--color-unlit)] [--band-on:var(--color-hunter)] [--band-off:var(--color-unlit)]",
  dark: "[--band-base:var(--color-honeydew)] [--band-on:var(--color-lime)] [--band-off:color-mix(in_oklab,var(--color-honeydew)_30%,transparent)]",
} as const;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export type JarMarkProps = {
  lit?: 0 | 1 | 2 | 3 | 4;
  size?: number;
  /** light: on white/canvas. meter: tier display, unlit bands read as empty. dark: on Hunter/Charcoal. */
  on?: keyof typeof SURFACE;
  loading?: boolean;
  /**
   * With `loading`: how many steps are finished. Finished bands sit in solid dark green, the band being worked on
   * pulses, and the ones still to come stay pale, so the drop shows how far along it is.
   */
  stage?: number;
  /** Decorative: the bands walk the brand greens, a wave falling from the tip to the base. */
  cycle?: boolean;
  /** Light the bands one at a time, bottom to top, once on mount (a tier just earned). Static with reduced motion. */
  build?: boolean;
  label?: string;
  className?: string;
};

export function JarMark({ lit: litProp = 1, size = 40, on = "light", loading, stage, cycle, build, label, className }: JarMarkProps) {
  const reduced = useReducedMotion();
  /* null = show the real tier (server, no-JS, reduced motion, after the climb). A number = mid-climb. */
  const [step, setStep] = useState<number | null>(null);
  useIsoLayoutEffect(() => {
    if (!build || reduced) return;
    let n = 0;
    setStep(0);
    const id = window.setInterval(() => {
      n += 1;
      if (n >= litProp) {
        setStep(null);
        window.clearInterval(id);
      } else setStep(n);
    }, 260);
    return () => window.clearInterval(id);
  }, [build, reduced, litProp]);
  const lit = (step ?? litProp) as 0 | 1 | 2 | 3 | 4;
  const staged = loading && stage !== undefined;
  const solid = staged ? (stage >= BANDS.length - 1 ? BANDS.length : stage) : 0;
  const active = staged && stage < BANDS.length - 1 ? stage : -1;
  const clip = `fdrop${useId().replace(/[:«»]/g, "")}`;
  const a11y = label ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true as const };

  // Below 24px the gaps close: solid drop with the lit base band.
  if (size < 24) {
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" className={cn("block shrink-0", SURFACE[on], className)} {...a11y}>
        <clipPath id={clip}><path d={DROP} /></clipPath>
        <path d={DROP} fill="var(--band-base)" />
        <polygon points={pts(BANDS[0]!)} fill="var(--band-on)" clipPath={`url(#${clip})`} />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={cn("block shrink-0", SURFACE[on], className)} {...a11y}>
      <clipPath id={clip}><path d={DROP} /></clipPath>
      <g clipPath={`url(#${clip})`}>
        {BANDS.map((b, i) => (
          <polygon
            key={i}
            points={pts(b)}
            fill={staged ? (i < solid ? "var(--color-hunter)" : "var(--color-stage-todo)") : loading ? "var(--band-off)" : i < lit ? "var(--band-on)" : "var(--band-base)"}
            className={cn(
              "transition-[fill] duration-500",
              loading && !staged && "animate-band motion-reduce:animate-none",
              staged && i === active && "animate-band-active motion-reduce:animate-none",
              cycle && !loading && "animate-band-cycle motion-reduce:animate-none",
            )}
            style={loading && !staged ? { animationDelay: `${i * 2}s` } : cycle ? { animationDelay: `${-i * 0.7}s` } : undefined}
          />
        ))}
      </g>
    </svg>
  );
}

/** Horizontal lockup: the default logo and app top bar. */
export function Lockup({ size = 32, on = "light" }: { size?: number; on?: "light" | "dark" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <JarMark size={size} on={on} />
      <span className={cn("font-display text-[20px] leading-none font-extrabold tracking-[-0.02em]", on === "dark" ? "text-honeydew" : "text-charcoal")}>
        {APP_NAME}
      </span>
    </span>
  );
}

/** Token badge: drop in a Hunter coin. DripCoin (DRIP), wallet lists, onchain contexts. */
export function TokenBadge({ size = 40, label }: { size?: number; label?: string }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full bg-hunter ring-2 ring-lime/60 ring-offset-0"
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <JarMark size={Math.round(size * 0.66)} on="dark" />
    </span>
  );
}

/** App icon: 22% corner radius. Hunter for the store; Charcoal alternate. */
export function AppIcon({ size = 64, tone = "hunter" }: { size?: number; tone?: "hunter" | "charcoal" }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-[22%]", tone === "hunter" ? "bg-hunter" : "bg-charcoal")}
      style={{ width: size, height: size }}
    >
      <JarMark size={Math.round(size * 0.62)} on="dark" />
    </span>
  );
}

const TIER_CAPS = ["–", "$50", "$100", "$200", "$300"] as const;

/** Standing Pass meter: the logo is the tier. Never light bands that don't match a real tier. */
export function TierMeter({ tier }: { tier: -1 | 0 | 1 | 2 | 3 }) {
  const lit = (tier + 1) as 0 | 1 | 2 | 3 | 4;
  return (
    <div className="flex items-center gap-4">
      <JarMark lit={lit} on="meter" size={72} label={tier < 0 ? "Not verified yet" : `Tier ${tier}, limit ${TIER_CAPS[lit]}`} />
      <ol aria-label="Limits ladder" className="m-0 flex list-none flex-col gap-0.5 p-0 font-ledger text-ledger tabular-nums">
        {[4, 3, 2, 1].map((n) => (
          <li key={n} className={cn(n <= lit ? "text-charcoal" : "text-charcoal-muted", n === lit && "font-semibold")}>
            {TIER_CAPS[n]}
            {n === lit ? <span className="sr-only"> (current)</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The mascot: the drop with a face. Two eyes and a small smile on the Hunter drop; the eyes blink now and then.
 * Sits beside account names (the sidebar chip). Decorative.
 */
export function Mascot({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className={cn("block shrink-0", className)}>
      <rect width="40" height="40" rx="10" className="fill-hunter" />
      <path d={DROP} transform="translate(5 4) scale(0.75)" className="fill-lime" />
      <g className="fill-hunter">
        <rect x="14.5" y="19" width="3.5" height="5" rx="1.75" className="origin-center animate-[blink_4.5s_infinite] motion-reduce:animate-none [transform-box:fill-box]" />
        <rect x="22" y="19" width="3.5" height="5" rx="1.75" className="origin-center animate-[blink_4.5s_infinite] motion-reduce:animate-none [transform-box:fill-box]" />
      </g>
      <path d="M15.5 27.5q4.5 3.5 9 0" fill="none" strokeWidth="2" strokeLinecap="round" className="stroke-hunter" />
    </svg>
  );
}

/**
 * The shop's wallet mark: a lime wallet with a clasp on a Hunter tile. Sits beside the shop name and its public id
 * (the sidebar chip). Decorative.
 */
export function WalletMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden className={cn("block shrink-0", className)}>
      <rect width="40" height="40" rx="11" className="fill-hunter" />
      {/* Card tucked behind the wallet. */}
      <rect x="11" y="9.5" width="18" height="8" rx="2.5" transform="rotate(-8 20 14)" className="fill-lime/45" />
      {/* Wallet body. */}
      <rect x="7.5" y="13.5" width="25" height="18" rx="4.5" className="fill-lime" />
      <path d="M7.5 18.5h25" strokeWidth="1.5" className="stroke-hunter/20" />
      {/* Clasp. */}
      <rect x="21.5" y="19.5" width="13" height="8" rx="4" className="fill-hunter" />
      <circle cx="26.5" cy="23.5" r="1.9" className="fill-lime" />
    </svg>
  );
}
