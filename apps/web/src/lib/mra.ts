/**
 * The ONE place apps/web builds its `@repo/sdk` client. Every screen gets its data through `getMRA()`
 * (browser) or `serverView()` (server components), so swapping the backend is one env value:
 *
 *   NEXT_PUBLIC_MRA_MODE=mock      (default) the apps/web mock data, no network. The UI looks exactly as before.
 *   NEXT_PUBLIC_MRA_MODE=local     anvil :8545 + agents API :8000 + issuer :8787
 *   NEXT_PUBLIC_MRA_MODE=sepolia   NEXT_PUBLIC_API_URL + NEXT_PUBLIC_ISSUER_URL (+ NEXT_PUBLIC_RPC_URL)
 *
 * See apps/web/.env.example for every variable.
 *
 * Where the data loads:
 * - mock: the server awaits the SDK (static data), and the client screen hydrates with it. No client fetch.
 * - local / sepolia: the client screen fetches. The merchant's session and passes live in this device's
 *   IndexedDB vault, and Anon-RPC runs in the browser, so neither exists on the server.
 *
 * This module is isomorphic (no "use client", no next/headers). The browser-only adapters (Anon-RPC worker,
 * prover) are loaded by `./mra-browser` through dynamic import(), only outside mock mode.
 */
import { createMRA, type MRA, type MRAConfig, type Mode } from "@repo/sdk";

export type { MRA };

/* ------------------------------------------------------------------ env */

function parseMode(v: string | undefined): Mode {
  return v === "local" || v === "sepolia" ? v : "mock";
}

function flag(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === "") return fallback;
  return v === "1" || v === "true" || v === "on";
}

/** Next inlines NEXT_PUBLIC_* at build time, so these must be read as literal property accesses. */
export const MRA_ENV = {
  mode: parseMode(process.env.NEXT_PUBLIC_MRA_MODE),
  apiUrl: process.env.NEXT_PUBLIC_API_URL || undefined,
  issuerUrl: process.env.NEXT_PUBLIC_ISSUER_URL || undefined,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || undefined,
  /**
   * Chain reads over Anon-RPC. Default: on for sepolia. Off for local unless set, because the anon network's exits
   * can't reach anvil on your laptop (set NEXT_PUBLIC_ANON_RPC=1 to force it). Ignored in mock.
   */
  anonRpc: flag(process.env.NEXT_PUBLIC_ANON_RPC, parseMode(process.env.NEXT_PUBLIC_MRA_MODE) === "sepolia"),
  /** Fail closed when Anon-RPC is unavailable (no chain reads at all). Default off: read directly instead. */
  anonRpcStrict: flag(process.env.NEXT_PUBLIC_ANON_RPC_STRICT, false),
  /** Anon-RPC network: nox (specifier on Sepolia, default) | tor-js | nym | passthrough (not anonymous). */
  anonNetwork: process.env.NEXT_PUBLIC_ANON_NETWORK || "nox",
  /** Read-only lender account when no wallet is connected (L01–L03). */
  account: (process.env.NEXT_PUBLIC_LENDER_ACCOUNT || undefined) as `0x${string}` | undefined,
  /** Mock mode only: simulated latency per call, so spinners show. */
  mockLatencyMs: Number(process.env.NEXT_PUBLIC_MRA_MOCK_LATENCY_MS || 0) || 0,
} as const;

export const MRA_MODE: Mode = MRA_ENV.mode;
export const isMock = MRA_MODE === "mock";

/** The config every instance shares. Browser adapters are layered on top in ./mra-browser. */
export function baseConfig(): MRAConfig {
  const cfg: MRAConfig = { mode: MRA_MODE };
  if (MRA_ENV.apiUrl) cfg.apiUrl = MRA_ENV.apiUrl;
  if (MRA_ENV.issuerUrl) cfg.issuerUrl = MRA_ENV.issuerUrl;
  if (MRA_ENV.account) cfg.account = MRA_ENV.account;
  if (MRA_ENV.rpcUrl) cfg.rpc = { url: MRA_ENV.rpcUrl };
  if (isMock && MRA_ENV.mockLatencyMs) cfg.mockLatencyMs = MRA_ENV.mockLatencyMs;
  return cfg;
}

/* --------------------------------------------------------------- server */

let serverInstance: MRA | undefined;

/** Server-side instance (mock mode). Real modes never read on the server: see `serverView`. */
export function serverMRA(): MRA {
  return (serverInstance ??= createMRA(baseConfig()));
}

/**
 * For server components: `await serverView((m) => m.merchant.home())`.
 * Returns the view-model in mock mode (static data, rendered on the server), and `null` in local / sepolia,
 * where the client screen loads it itself.
 */
export async function serverView<T>(load: (mra: MRA) => Promise<T>): Promise<T | null> {
  if (!isMock) return null;
  return load(serverMRA());
}

/* -------------------------------------------------------------- browser */

let browserInstance: Promise<MRA> | undefined;

/**
 * The browser instance: one per tab, built once. Outside mock mode it waits for the browser adapters
 * (Anon-RPC worker, prover, ...) from ./mra-browser, each of which falls back if it can't load.
 */
export function getMRA(): Promise<MRA> {
  if (typeof window === "undefined") return Promise.resolve(serverMRA());
  return (browserInstance ??= (async () => {
    if (isMock) return createMRA(baseConfig());
    const { browserConfig } = await import("./mra-browser");
    return createMRA(await browserConfig(baseConfig()));
  })());
}

/** Run one SDK call from an event handler: `await withMRA((m) => m.pay.pay(id, 10))`. */
export async function withMRA<T>(fn: (mra: MRA) => Promise<T>): Promise<T> {
  return fn(await getMRA());
}

/** The stable error code of anything the SDK threw ("session_missing", "wallet_required", ...). */
export function errorCode(e: unknown): string {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return "error";
}
