/**
 * First `n` tiles, for a progress strip. A plain helper (no "use client"), so server components can call it:
 * a function exported from a "use client" module can only be rendered, not called, on the server.
 */
export const litTiles = (n: number) => Array.from({ length: Math.max(0, n) }, (_, i) => i);
