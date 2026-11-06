"use client";

import { useId } from "react";
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

export type JarMarkProps = {
  lit?: 0 | 1 | 2 | 3 | 4;
  size?: number;
  /** light: on white/canvas. meter: tier display, unlit bands read as empty. dark: on Hunter/Charcoal. */
  on?: keyof typeof SURFACE;
  loading?: boolean;
  label?: string;
  className?: string;
};

export function JarMark({ lit = 1, size = 40, on = "light", loading, label, className }: JarMarkProps) {
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
            fill={loading ? "var(--band-off)" : i < lit ? "var(--band-on)" : "var(--band-base)"}
            className={cn("transition-[fill] duration-300", loading && "animate-band motion-reduce:animate-none")}
            style={loading ? { animationDelay: `${i * 2}s` } : undefined}
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

/** Token badge: drop in a Hunter coin. JAR-J, wallet lists, onchain contexts. */
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

const TIER_CAPS = ["–", "$50", "$100", "$250", "$500"] as const;

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
