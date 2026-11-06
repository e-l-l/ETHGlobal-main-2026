import { isProd } from "./secret";

export const SESSION_COOKIE = "dp_session";
export const CSRF_COOKIE = "dp_csrf";
export const LANG_COOKIE = "dp_lang";
export const SESSION_TTL_SEC = 60 * 60 * 8; // 8 h

/** Every cookie: Path=/, SameSite=Lax, HttpOnly (unless disabled), Secure in production. */
export function serializeCookie(
  name: string,
  value: string,
  opts: { maxAge?: number; httpOnly?: boolean } = {},
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  if (isProd()) parts.push("Secure");
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join("; ");
}

export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const piece of header.split(";")) {
    const idx = piece.indexOf("=");
    if (idx < 0) continue;
    if (piece.slice(0, idx).trim() === name) {
      try {
        return decodeURIComponent(piece.slice(idx + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
