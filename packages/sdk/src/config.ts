import type { WalletClient } from "viem";
import type { AgentPassAdapter, IdkitAdapter, ReclaimAdapter } from "./adapters/world.js";
import type { Prover } from "./adapters/prover.js";
import type { CredentialVault } from "./adapters/vault.js";
import type { Deployment } from "./chain/deployments.js";
import { ConfigError } from "./errors.js";
import { ARS_PER_USD } from "./mock/shop.js";
import type { FetchFn } from "./http.js";
import type { AnonRpcWorkerLike } from "./transport/anon.js";
import type { Mode } from "./viewmodels.js";

export type RpcConfig = {
  /** JSON-RPC URL. Defaults: local http://127.0.0.1:8545, sepolia https://ethereum-sepolia-rpc.publicnode.com */
  url?: string;
  /** Route every chain read through Anon-RPC. Requires `anonWorker` or `anonFetch`. */
  anonRpc?: boolean;
  /** An `AnonRpcWorker` from @anon-rpc/browser-harness (see transport/anon.ts). */
  anonWorker?: AnonRpcWorkerLike;
  /** Or any anonymized fetch. */
  anonFetch?: FetchFn;
  /** Batch parallel reads into Multicall3 calls when the chain has it (default true). Turn off for RPC fakes. */
  multicall?: boolean;
  /** If anonRpc is on but no worker was given, read directly instead of failing. Default false (fail closed). */
  allowDirectFallback?: boolean;
};

export type MRAConfig = {
  mode: Mode;
  /** Agents FastAPI base URL. Default local: http://localhost:8000. Required for sepolia. */
  apiUrl?: string;
  /** Business Pass issuer base URL. Default local: http://localhost:8787. Required for sepolia onboarding. */
  issuerUrl?: string;
  rpc?: RpcConfig;
  /** Override the bundled deployment (e.g. a fresh sepolia.json). */
  deployment?: Deployment;
  /** viem WalletClient with an account: lender deposits, customer pay, registerShop, registry.issue, mandate signature. */
  wallet?: WalletClient;
  /**
   * Testnet demo: before a write, ask the agents API's /demo/faucet for gas + test USDC when the wallet has none.
   * Default on (the endpoint 404s unless the backend enables it, and only on Sepolia / anvil).
   */
  faucet?: boolean;
  /**
   * The C01 pay page the merchant's QR opens, e.g. "https://app.example/pay/corner-kiosk". The SDK appends
   * `?shop=<bytes32>&name=<display name>`. Default: `https://pay.<app>/<slug>` (display only, not routable).
   */
  payUrl?: string;
  /** Read-only account for lender screens when no wallet is connected. */
  account?: `0x${string}`;
  /** fetch for API calls (tests inject a mock). Chain reads use rpc.anonFetch when anonRpc is on. */
  fetch?: FetchFn;
  timeoutMs?: number;
  vault?: CredentialVault;
  prover?: Prover;
  reclaim?: ReclaimAdapter;
  agentPass?: AgentPassAdapter;
  idkit?: IdkitAdapter;
  /** Merchant's local currency. Default ARS at 1,500 per USD (the mock rate). */
  fx?: { currency: string; usdToLocal: number };
  /**
   * Mock mode only: what `onboarding.checkHuman()` answers. Default: `?mockWorld=` from the page URL if present
   * (`banned` | `open_advance` | `eligible`), else "eligible". Lets the UI show both stop screens without a backend.
   */
  mockWorld?: "eligible" | "banned" | "open_advance";
  /** Mock mode only: simulated latency per call, so spinners show. Default 0. */
  mockLatencyMs?: number;
  /** Receives event codes only (never values). Hook up to your logger if you like. */
  onEvent?: (e: { type: string; code?: string }) => void;
};

export type ResolvedConfig = Omit<MRAConfig, "rpc"> & {
  rpc: RpcConfig & { url: string };
  fx: { currency: string; usdToLocal: number };
  timeoutMs: number;
};

export const DEFAULTS = {
  local: { apiUrl: "http://localhost:8000", issuerUrl: "http://localhost:8787", rpcUrl: "http://127.0.0.1:8545" },
  sepolia: { rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com" },
} as const;

const MODES: Mode[] = ["mock", "local", "sepolia"];

export function resolveConfig(cfg: MRAConfig): ResolvedConfig {
  if (!cfg || !MODES.includes(cfg.mode)) throw new ConfigError("config_invalid", `mode must be one of ${MODES.join(" | ")}`);
  const local = cfg.mode === "local";
  const url = cfg.rpc?.url ?? (cfg.mode === "sepolia" ? DEFAULTS.sepolia.rpcUrl : DEFAULTS.local.rpcUrl);
  for (const [k, v] of [
    ["apiUrl", cfg.apiUrl],
    ["issuerUrl", cfg.issuerUrl],
    ["payUrl", cfg.payUrl],
    ["rpc.url", url],
  ] as const) {
    if (v !== undefined && !/^https?:\/\//.test(v)) throw new ConfigError("config_invalid", `${k} must be an http(s) URL`);
  }
  const out: ResolvedConfig = {
    ...cfg,
    rpc: { ...cfg.rpc, url },
    fx: cfg.fx ?? { currency: "ARS", usdToLocal: ARS_PER_USD },
    timeoutMs: cfg.timeoutMs ?? 20_000,
  };
  const apiUrl = cfg.apiUrl ?? (local ? DEFAULTS.local.apiUrl : undefined);
  const issuerUrl = cfg.issuerUrl ?? (local ? DEFAULTS.local.issuerUrl : undefined);
  if (apiUrl !== undefined) out.apiUrl = apiUrl;
  if (issuerUrl !== undefined) out.issuerUrl = issuerUrl;
  return out;
}
