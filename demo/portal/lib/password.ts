import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Format: scrypt$N$r$p$<salt b64>$<hash b64>. Node's built-in scrypt: no native deps on Vercel.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  if (expected.length < 16) return false;
  let actual: Buffer;
  try {
    actual = scryptSync(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Used for unknown emails so response time does not reveal which emails exist.
let dummyHash: string | null = null;
export function burnPasswordCheck(password: string): void {
  dummyHash ??= hashPassword(randomBytes(12).toString("hex"));
  verifyPassword(password, dummyHash);
}
