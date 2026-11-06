// Environment -> typed config. Fails fast on anything missing or malformed. Never echoes secret values.
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";

export type Band = 1 | 2 | 3;

export interface ReclaimBandPin {
  providerId?: string;
  providerVersion?: string;
  hashes?: string[];
}

export interface Config {
  mock: boolean;
  port: number;
  host: string;
  trustProxy: boolean;
  corsOrigins: string[];
  rateLimitMax: number;
  rateLimitWindowMs: number;
  bodyLimit: number;

  issuerPrivateKey: Hex;
  pepper: Buffer;

  chainId: number;
  registry: Address;
  eip712Name: string;
  eip712Version: string;
  /** Solidity-style struct signature; must hash to the registry's BUSINESS_VERIFIED_TYPEHASH. */
  businessVerifiedType: string;
  attestationTtlSec: number;

  /** Proofs older than this (claimData.timestampS) are rejected. Replay TTL is this + clock skew. */
  proofMaxAgeSec: number;
  clockSkewSec: number;

  allowedCountries: string[]; // ISO alpha-2
  accountIdParam: string;
  accountIdPattern: RegExp;
  expectedUrl?: string;

  requireLeafCheck: boolean;

  /** Public HTTPS base URL of this issuer (ISSUER_PUBLIC_URL). If set, Reclaim POSTs proofs straight to
   *  `${publicUrl}/reclaim/callback/:sessionId`; otherwise the issuer polls Reclaim's status URL itself. */
  publicUrl?: string;

  reclaim: {
    appId?: string;
    appSecret?: string;
    requireTee: boolean;
    pins: Record<Band, ReclaimBandPin>;
    /** `getRequestUrl({ verificationMode })`: "portal" (remote browser, default) or "app" (Reclaim Verifier app / App Clip). */
    verificationMode: "portal" | "app";
    /** `setContext(contextAddress, commitmentHex)`. Defaults to the registry address. */
    contextAddress: string;
    /** How long a /reclaim/session stays usable (QR scan + login + /issue). */
    sessionTtlSec: number;
    /** DEBUG, demo accounts only: write each received proof to this dir (RECLAIM_PROVIDER.md "capture a fixture"). */
    captureDir?: string;
  };
}

export const DEFAULT_BUSINESS_VERIFIED_TYPE =
  "BusinessVerified(uint256 businessNullifier,uint256 commitment,uint64 expiresAt)";

/** ISO 3166-1 numeric codes for the leaf's `country` attribute (BusinessPassRegistry / circuit). */
export const ISO_NUMERIC: Record<string, number> = { AR: 32, KE: 404, NG: 566, BR: 76, MX: 484, IN: 356, US: 840 };

type Env = Record<string, string | undefined>;

class ConfigError extends Error {}

function req(env: Env, k: string): string {
  const v = env[k]?.trim();
  if (!v) throw new ConfigError(`missing env ${k}`);
  return v;
}
const opt = (env: Env, k: string) => env[k]?.trim() || undefined;
const flag = (env: Env, k: string) => ["1", "true", "yes"].includes((env[k] ?? "").trim().toLowerCase());
function int(env: Env, k: string, dflt: number): number {
  const v = opt(env, k);
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new ConfigError(`env ${k} must be a non-negative integer`);
  return n;
}
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/** ISSUER_PEPPER: 0x-hex (>= 32 bytes) or a raw string (>= 32 chars). */
export function parsePepper(raw: string): Buffer {
  const b = /^0x[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0 ? Buffer.from(raw.slice(2), "hex") : Buffer.from(raw, "utf8");
  if (b.length < 32) throw new ConfigError("ISSUER_PEPPER must be at least 32 bytes (use: openssl rand -hex 32, then prefix 0x)");
  return b;
}

export function loadConfig(env: Env = process.env): Config {
  const mock = flag(env, "ISSUER_MOCK");

  const pk = req(env, "ISSUER_PRIVATE_KEY");
  if (!isHex(pk) || pk.length !== 66) throw new ConfigError("ISSUER_PRIVATE_KEY must be 0x + 64 hex");

  const chainId = int(env, "CHAIN_ID", 0);
  if (!chainId) throw new ConfigError("missing env CHAIN_ID");
  if (mock && chainId === 1) throw new ConfigError("ISSUER_MOCK=1 is refused on chain 1");

  const reg = req(env, "REGISTRY_ADDRESS");
  if (!isAddress(reg, { strict: false })) throw new ConfigError("REGISTRY_ADDRESS is not an address");

  const allowedCountries = list(opt(env, "ALLOWED_COUNTRIES") ?? "AR,NG,KE").map((c) => c.toUpperCase());
  for (const c of allowedCountries) {
    if (!/^[A-Z]{2}$/.test(c) || !(c in ISO_NUMERIC)) throw new ConfigError(`ALLOWED_COUNTRIES: unknown code ${c}`);
  }

  const pins = {} as Record<Band, ReclaimBandPin>;
  for (const b of [1, 2, 3] as Band[]) {
    const hashes = list(opt(env, `RECLAIM_PROVIDER_HASHES_BAND${b}`) ?? opt(env, "RECLAIM_PROVIDER_HASHES"));
    pins[b] = {
      providerId: opt(env, `RECLAIM_PROVIDER_ID_BAND${b}`) ?? opt(env, "RECLAIM_PROVIDER_ID"),
      providerVersion: opt(env, `RECLAIM_PROVIDER_VERSION_BAND${b}`) ?? opt(env, "RECLAIM_PROVIDER_VERSION"),
      hashes: hashes.length ? hashes : undefined,
    };
  }
  const requireTee = flag(env, "RECLAIM_REQUIRE_TEE");
  if (!mock) {
    for (const b of [1, 2, 3] as Band[]) {
      if (!pins[b].providerId && !pins[b].hashes) {
        throw new ConfigError(`real mode needs RECLAIM_PROVIDER_ID (or _BAND${b}) or RECLAIM_PROVIDER_HASHES for band ${b}`);
      }
    }
    if (requireTee && !opt(env, "RECLAIM_APP_SECRET")) throw new ConfigError("RECLAIM_REQUIRE_TEE=1 needs RECLAIM_APP_SECRET");
  }

  const publicUrl = opt(env, "ISSUER_PUBLIC_URL")?.replace(/\/+$/, "");
  if (publicUrl) {
    let u: URL;
    try {
      u = new URL(publicUrl);
    } catch {
      throw new ConfigError("ISSUER_PUBLIC_URL is not a URL");
    }
    const local = ["localhost", "127.0.0.1"].includes(u.hostname);
    if (u.protocol !== "https:" && !local) throw new ConfigError("ISSUER_PUBLIC_URL must be https (Reclaim posts proofs to it)");
  }
  const mode = (opt(env, "RECLAIM_VERIFICATION_MODE") ?? "portal").toLowerCase();
  if (mode !== "portal" && mode !== "app") throw new ConfigError("RECLAIM_VERIFICATION_MODE must be portal or app");
  const ctxAddr = opt(env, "RECLAIM_CONTEXT_ADDRESS");
  if (ctxAddr && !isAddress(ctxAddr, { strict: false })) throw new ConfigError("RECLAIM_CONTEXT_ADDRESS is not an address");

  const pattern = opt(env, "ACCOUNT_ID_PATTERN") ?? "^acc_[0-9a-f]{32}$";

  return {
    mock,
    port: int(env, "PORT", 8787),
    host: opt(env, "HOST") ?? "0.0.0.0",
    trustProxy: flag(env, "TRUST_PROXY"),
    // CORS_ALLOW_ORIGINS is the name shared with the agents API; CORS_ORIGINS is the older alias. "*" is never honoured.
    corsOrigins: [...new Set([...list(opt(env, "CORS_ALLOW_ORIGINS")), ...list(opt(env, "CORS_ORIGINS"))])].filter((o) => o !== "*"),
    rateLimitMax: int(env, "RATE_LIMIT_MAX", 20),
    rateLimitWindowMs: int(env, "RATE_LIMIT_WINDOW_SEC", 60) * 1000,
    bodyLimit: int(env, "BODY_LIMIT_BYTES", 256 * 1024),

    issuerPrivateKey: pk as Hex,
    pepper: parsePepper(req(env, "ISSUER_PEPPER")),

    chainId,
    registry: getAddress(reg),
    eip712Name: opt(env, "EIP712_NAME") ?? "BusinessPassRegistry",
    eip712Version: opt(env, "EIP712_VERSION") ?? "1",
    businessVerifiedType: opt(env, "BUSINESS_VERIFIED_TYPE") ?? DEFAULT_BUSINESS_VERIFIED_TYPE,
    attestationTtlSec: 600,

    proofMaxAgeSec: int(env, "PROOF_MAX_AGE_SEC", 900),
    clockSkewSec: int(env, "CLOCK_SKEW_SEC", 120),

    allowedCountries,
    accountIdParam: opt(env, "ACCOUNT_ID_PARAM") ?? "account_id",
    accountIdPattern: new RegExp(pattern),
    expectedUrl: opt(env, "RECLAIM_EXPECTED_URL"),

    // Secure by default: the leaf is recomputed from h + proven attributes so a merchant cannot
    // claim a higher band than their zkTLS proof shows. Set ISSUER_REQUIRE_LEAF_CHECK=0 only for debugging.
    requireLeafCheck: (env["ISSUER_REQUIRE_LEAF_CHECK"] ?? "1").trim() !== "0",

    reclaim: {
      appId: opt(env, "RECLAIM_APP_ID"),
      appSecret: opt(env, "RECLAIM_APP_SECRET"),
      requireTee,
      pins,
      verificationMode: mode,
      contextAddress: (ctxAddr ?? reg).toLowerCase(),
      sessionTtlSec: int(env, "RECLAIM_SESSION_TTL_SEC", 900),
      captureDir: mock ? undefined : opt(env, "RECLAIM_CAPTURE_FIXTURE_DIR"),
    },
    publicUrl,
  };
}
