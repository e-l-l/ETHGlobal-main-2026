import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getKey } from "./secret";

// Signed double-submit token: the same value must arrive in the dp_csrf cookie AND the form
// field, and it must carry a valid HMAC (so a cookie planted from a sibling domain fails).
export function issueCsrfToken(): string {
  const nonce = randomBytes(18).toString("base64url");
  const sig = createHmac("sha256", getKey("csrf")).update(nonce).digest("base64url");
  return `${nonce}.${sig}`;
}

function validSignature(token: string): boolean {
  const [nonce, sig] = token.split(".");
  if (!nonce || !sig) return false;
  const expected = createHmac("sha256", getKey("csrf")).update(nonce).digest();
  const given = Buffer.from(sig, "base64url");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function verifyCsrf(cookieToken: string | undefined, formToken: string | undefined): boolean {
  if (!cookieToken || !formToken) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(formToken);
  return a.length === b.length && timingSafeEqual(a, b) && validSignature(cookieToken);
}

/** Defence in depth: a foreign Origin is rejected. A missing Origin is tolerated (the token still applies). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
