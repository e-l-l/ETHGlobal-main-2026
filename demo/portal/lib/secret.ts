import { createHash } from "node:crypto";

const DEV_FALLBACK = "demo-portal-INSECURE-dev-only-secret-do-not-use-in-prod";
let warned = false;

export class MissingSecretError extends Error {}

export function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

export function secretConfigured(): boolean {
  return (process.env.SESSION_SECRET ?? "").length >= 32;
}

/** 32-byte key derived from SESSION_SECRET. Throws in production if it is unset or too short. */
export function getKey(purpose: "session" | "csrf"): Buffer {
  let secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) {
    if (isProd()) throw new MissingSecretError("SESSION_SECRET must be set (>= 32 chars) in production");
    if (!warned) {
      console.warn("[demo-portal] SESSION_SECRET not set; using an INSECURE dev fallback.");
      warned = true;
    }
    secret = DEV_FALLBACK;
  }
  return createHash("sha256").update(`${purpose}:${secret}`).digest();
}
