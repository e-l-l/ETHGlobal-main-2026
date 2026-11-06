import pino from "pino";
import { buildApp, REDACT_PATHS } from "../src/app.js";
import { loadConfig, type Config } from "../src/config.js";
import type { ProofVerifier } from "../src/reclaim.js";
import type { ReclaimBackend } from "../src/sessions.js";

// Anvil account #0: a PUBLIC test key, never used for anything real.
export const TEST_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const TEST_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const TEST_PEPPER = "0x" + "11".repeat(32);
export const TEST_REGISTRY = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
export const NOW_MS = 1_790_000_000_000; // fixed clock

export function testEnv(over: Record<string, string> = {}): Record<string, string> {
  return {
    ISSUER_MOCK: "1",
    ISSUER_PRIVATE_KEY: TEST_PK,
    ISSUER_PEPPER: TEST_PEPPER,
    CHAIN_ID: "31337",
    REGISTRY_ADDRESS: TEST_REGISTRY,
    CORS_ORIGINS: "http://localhost:3000",
    // Production default is ON (see config.ts); most unit tests exercise other paths, so they opt out
    // explicitly. The leaf-check tests set it to "1".
    ISSUER_REQUIRE_LEAF_CHECK: "0",
    ...over,
  };
}

export async function makeApp(opts: { env?: Record<string, string>; verifier?: ProofVerifier; cfg?: Partial<Config>; reclaimBackend?: ReclaimBackend } = {}) {
  const lines: string[] = [];
  const logger = pino(
    { level: "trace", redact: { paths: REDACT_PATHS, censor: "[redacted]" } },
    { write: (s: string) => void lines.push(s) },
  );
  const cfg = { ...loadConfig(testEnv(opts.env)), ...opts.cfg };
  const built = await buildApp({ cfg, logger, verifier: opts.verifier, reclaimBackend: opts.reclaimBackend, now: () => NOW_MS });
  return { ...built, cfg, lines };
}

export const commitmentOf = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");
