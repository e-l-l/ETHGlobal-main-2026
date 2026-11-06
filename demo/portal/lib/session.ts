import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getKey } from "./secret";
import { SESSION_TTL_SEC } from "./cookies";

// Stateless session: AES-256-GCM encrypted {sub, exp}. The cookie is opaque, so it never
// exposes the account id even if a header leaks. Works on serverless (no session store).
interface SessionPayload {
  sub: string; // account id
  exp: number; // unix seconds
}

export function createSessionToken(accountId: string, nowSec = Math.floor(Date.now() / 1000)): string {
  const payload: SessionPayload = { sub: accountId, exp: nowSec + SESSION_TTL_SEC };
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey("session"), iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64url");
}

/** Returns the account id, or null if the token is missing, tampered with or expired. */
export function readSessionToken(token: string | undefined, nowSec = Math.floor(Date.now() / 1000)): string | null {
  if (!token) return null;
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", getKey("session"), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const pt = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const payload = JSON.parse(pt) as SessionPayload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < nowSec) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
