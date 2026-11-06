import type { ReactNode } from "react";

/*
 * Decorative stroke icons drawn exactly as in the landing export. The kit icons (final/icons.tsx)
 * use slightly different geometry, so these stay local to the landing page.
 */

type GlyphProps = { size?: number; stroke?: number; className?: string };

function Glyph({
  size = 20,
  stroke = 2,
  className,
  children,
}: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export const LockGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Glyph>
);

export const CheckGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M5 12l5 5L20 7" />
  </Glyph>
);

export const ShieldCheckGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6l7-3z" />
    <path d="M9 12l2 2 4-4" />
  </Glyph>
);

export const SlidersGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4 7h10" />
    <path d="M18 7h2" />
    <circle cx="16" cy="7" r="2" />
    <path d="M4 17h4" />
    <path d="M12 17h8" />
    <circle cx="10" cy="17" r="2" />
  </Glyph>
);

export const QrGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2v2h-2z" />
    <path d="M18 18h2v2h-2z" />
  </Glyph>
);

export const TrendGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4 18l6-6 4 4 6-8" />
    <path d="M15 8h5v5" />
  </Glyph>
);

export const EyeOffGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M3 3l18 18" />
    <path d="M10.6 6.1A10 10 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6" />
    <path d="M6.6 7.6A17 17 0 0 0 2.5 12s3.5 6 9.5 6a9.8 9.8 0 0 0 4.4-1" />
  </Glyph>
);

export const CounterGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4 7h16v12H4z" />
    <path d="M8 7V5h8v2" />
    <path d="M4 12h16" />
  </Glyph>
);
