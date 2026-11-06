"use client";

import { useId } from "react";

/*
 * Ribbon drop (anay-design.md section 5). Four bands slanted at 16° (slope 0.28), 5.8u thick,
 * 1.8u gaps, clipped to the drop on a 40-unit grid. Lit bands = tier + 1, counted from the bottom.
 */

const DROP = "M20 1.5C20 1.5 7 16.5 7 26a13 13 0 0 0 26 0C33 16.5 20 1.5 20 1.5Z";
/** (upper, lower) y at the centre line, bottom band first. */
const BANDS: readonly [[number, number], [number, number], [number, number], [number, number]] = [
  [31.8, 50],
  [24.2, 30.0],
  [16.6, 22.4],
  [-10, 14.8],
];
const RISE = 0.28 * 20; // slope × half width

function bandPoints([u, l]: [number, number]) {
  return `0,${u + RISE} 40,${u - RISE} 40,${l - RISE} 0,${l + RISE}`;
}

export type JarMarkProps = {
  /** Lit bands, 0–4. The primary mark is 1. */
  lit?: 0 | 1 | 2 | 3 | 4;
  size?: number;
  /** "mark": unlit bands in text colour. "meter": unlit bands in the --unlit token, so the tier reads. */
  variant?: "mark" | "meter";
  /** Bands light bottom to top on an 8s loop. Static under reduced motion. */
  loading?: boolean;
  /** Accessible name. Omit when decorative. */
  label?: string;
  className?: string;
};

export function JarMark({ lit = 1, size = 40, variant = "mark", loading, label, className }: JarMarkProps) {
  const id = useId();
  const clip = `dj-drop-${id.replace(/:/g, "")}`;
  const unlit = variant === "meter" || loading ? "var(--unlit)" : "currentColor";

  // Below 24px the gaps close, so use the solid drop with a lime base (section 5, small sizes).
  if (size < 24) {
    return (
      <svg className={`dj-mark ${className ?? ""}`} width={size} height={size} viewBox="0 0 40 40" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
        <clipPath id={clip}>
          <path d={DROP} />
        </clipPath>
        <path d={DROP} fill="currentColor" />
        <polygon points={bandPoints(BANDS[0])} fill="var(--accent)" clipPath={`url(#${clip})`} />
      </svg>
    );
  }

  return (
    <svg
      className={`dj-mark ${className ?? ""}`}
      data-loading={loading || undefined}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <clipPath id={clip}>
        <path d={DROP} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        {BANDS.map((b, i) => (
          <polygon key={i} className="dj-mark__band" points={bandPoints(b)} fill={!loading && i < lit ? "var(--accent)" : unlit} />
        ))}
      </g>
    </svg>
  );
}

export function Lockup({ size = 32 }: { size?: number }) {
  return (
    <span className="dj-row" style={{ gap: 8, color: "var(--text)" }}>
      <JarMark size={size} />
      <span className="dj-wordmark">dollarjar</span>
    </span>
  );
}

const TIER_CAPS = ["–", "$50", "$100", "$250", "$500"] as const;

/** Standing Pass meter: the logo is the tier. Never light bands that don't match a real tier. */
export function TierMeter({ tier }: { tier: -1 | 0 | 1 | 2 | 3 }) {
  const lit = (tier + 1) as 0 | 1 | 2 | 3 | 4;
  return (
    <div className="dj-row" style={{ gap: 16 }}>
      <JarMark lit={lit} variant="meter" size={72} label={tier < 0 ? "Not verified yet" : `Tier ${tier}, limit ${TIER_CAPS[lit]}`} />
      <ol className="dj-list" aria-label="Limits ladder" style={{ gap: 2 }}>
        {[4, 3, 2, 1].map((n) => (
          <li key={n} className="dj-mono" style={{ color: n <= lit ? "var(--text)" : "var(--text-3)", fontWeight: n === lit ? 700 : 400 }}>
            {TIER_CAPS[n]}
            {n === lit ? <span className="sr-only-dj"> (current)</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
