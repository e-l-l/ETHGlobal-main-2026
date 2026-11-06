import { ConfigError } from "../errors.js";
import * as generated from "../deployments/index.js";

/** Shape of agents/deployments/<network>.json. */
export type Deployment = {
  chainId: number;
  AdvanceBook: string;
  BusinessPassRegistry: string;
  SeniorVault: string;
  JuniorVault: string;
  RiskHook: string;
  USDC: string;
  PoolManager: string;
  /** Uniswap v4 PoolSwapTest router for the junior/USDC swap (Uniswap's official Sepolia deployment). Optional. */
  PoolSwapTest?: string;
  /** Uniswap v4 PoolModifyLiquidityTest (used by agents/scripts/seed_junior_pool.py). Optional. */
  PoolModifyLiquidityTest?: string;
  HonkVerifier: string;
  BusinessPassVerifier: string;
  poolKey: { currency0: string; currency1: string; fee: number; tickSpacing: number; hooks: string };
  deployBlock: number;
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ADDRESS_KEYS = [
  "AdvanceBook",
  "BusinessPassRegistry",
  "SeniorVault",
  "JuniorVault",
  "RiskHook",
  "USDC",
  "PoolManager",
  "HonkVerifier",
  "BusinessPassVerifier",
] as const;

/** Validate a deployment object (e.g. a freshly fetched sepolia.json). Throws ConfigError. */
export function parseDeployment(value: unknown): Deployment {
  const d = value as Partial<Deployment> | null;
  if (!d || typeof d !== "object") throw new ConfigError("config_invalid", "deployment must be an object");
  if (!Number.isInteger(d.chainId)) throw new ConfigError("config_invalid", "deployment.chainId missing");
  for (const k of ADDRESS_KEYS) {
    if (typeof d[k] !== "string" || !ADDRESS.test(d[k] as string)) throw new ConfigError("config_invalid", `deployment.${k} is not an address`);
  }
  for (const k of ["PoolSwapTest", "PoolModifyLiquidityTest"] as const) {
    if (d[k] !== undefined && (typeof d[k] !== "string" || !ADDRESS.test(d[k] as string))) throw new ConfigError("config_invalid", `deployment.${k} is not an address`);
  }
  const pk = d.poolKey;
  if (!pk || !ADDRESS.test(pk.currency0) || !ADDRESS.test(pk.currency1) || !ADDRESS.test(pk.hooks)) {
    throw new ConfigError("config_invalid", "deployment.poolKey invalid");
  }
  if (!Number.isInteger(d.deployBlock) || (d.deployBlock as number) < 0) throw new ConfigError("config_invalid", "deployment.deployBlock missing");
  return d as Deployment;
}

/** The deployments bundled with the SDK (copied from agents/deployments by scripts/sync-backend.mjs). */
export const DEPLOYMENTS = {
  sepolia: parseDeployment(generated.sepolia),
  local: parseDeployment(generated.local),
} as const satisfies Record<"sepolia" | "local", Deployment>;

export function deploymentFor(mode: "local" | "sepolia"): Deployment {
  return DEPLOYMENTS[mode];
}
