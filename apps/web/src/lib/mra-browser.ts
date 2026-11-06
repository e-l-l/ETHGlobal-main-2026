/**
 * Browser-only adapters for the SDK, loaded by `getMRA()` (./mra.ts) through dynamic import(), and only outside
 * mock mode. Nothing here runs on the server or in mock mode, so the heavy modules (the Anon-RPC harness, the
 * Noir prover and bb.js) are never in the default bundle.
 *
 * Every adapter is an INJECTION POINT, marked below. Each one falls back instead of breaking the app:
 * if a module is missing or fails to start, the SDK uses its default (a direct RPC, the unconfigured prover,
 * the issuer's mock Reclaim, the mock Agent Pass and IDKit payloads that the backend accepts with WORLD_MOCK=1).
 *
 * `@repo/sdk/browser/anon` and `@repo/sdk/browser/prover` are SDK subpaths. Until the SDK ships them,
 * next.config.ts aliases them to ./mra-fallback/*, which throw, so the try/catch below falls back.
 */
import { DEFAULTS, IndexedDbVault, deploymentFor, loadOrCreateBurner, type AnonRpcWorkerLike, type CredentialVault, type MRAConfig, type Prover, type RpcConfig } from "@repo/sdk";
import { MRA_ENV, MRA_MODE } from "./mra";
import { routes } from "./routes";

/** What actually got wired, for a "live" / network badge. Read after `await getMRA()`. */
export const MRA_BROWSER_STATUS: {
  anonRpc: "off" | "anon" | "direct-fallback" | "fail-closed";
  prover: "worker" | "none";
  wallet: "burner" | "none";
  /** The wallet's address, for the wallet chip. Never the key. */
  address?: `0x${string}`;
} = { anonRpc: "off", prover: "none", wallet: "none" };

/*
 * The parts of the two browser subpaths this file uses (packages/sdk/src/browser/{anon,prover}.ts). Kept local so
 * it type-checks against the build-time stubs too (lib/mra-fallback/*).
 */
type AnonStatus = { phase: "connecting" | "ready" | "failed" | "closed"; label: string; anonymous: boolean };
type AnonRpcLike = AnonRpcWorkerLike & {
  rpcConfig(): RpcConfig & { url: string };
  status(): AnonStatus;
  onStatus(fn: (s: AnonStatus) => void): () => void;
};
type AnonModule = {
  createAnonRpc: (opts: {
    network?: "nox" | "tor-js" | "nym" | "passthrough";
    rpc?: { url?: string };
    allowDirectFallback?: boolean;
  }) => AnonRpcLike;
};
type ProverModule = {
  createWorkerProver: (opts?: { eager?: boolean }) => Prover;
};

const ANON_NETWORKS = ["nox", "tor-js", "nym", "passthrough"] as const;

let anonRpc: AnonRpcLike | undefined;

/** The live Anon-RPC transport, for a privacy badge: `getAnonRpc()?.status().label` / `.onStatus(fn)`. */
export function getAnonRpc() {
  return anonRpc;
}

/* ------------------------------------------------ INJECTION POINT: Anon-RPC worker */

async function loadAnonRpc(): Promise<AnonRpcLike | undefined> {
  const network = ANON_NETWORKS.find((n) => n === MRA_ENV.anonNetwork) ?? "nox";
  try {
    const mod = (await import("@repo/sdk/browser/anon")) as unknown as AnonModule;
    if (typeof mod.createAnonRpc !== "function") return undefined;
    // Doesn't wait for the network to be ready (that can take a while): reads queue on it, and if it fails they
    // are refused (strict) or sent directly (the default demo fallback).
    // The target RPC the reads go to (through the anon network). Default: Sepolia publicnode; local: anvil.
    const url = MRA_ENV.rpcUrl ?? (MRA_MODE === "local" ? "http://127.0.0.1:8545" : undefined);
    return mod.createAnonRpc({
      network,
      ...(url ? { rpc: { url } } : {}),
      allowDirectFallback: !MRA_ENV.anonRpcStrict,
    });
  } catch {
    return undefined;
  }
}

/* -------------------------------------------------------- INJECTION POINT: prover */

async function loadProver(): Promise<Prover | undefined> {
  try {
    const mod = (await import("@repo/sdk/browser/prover")) as unknown as ProverModule;
    if (typeof mod.createWorkerProver !== "function") return undefined;
    // Lazy: the worker, bb.js and the circuits load on the first proof.
    return mod.createWorkerProver();
  } catch {
    // Without a prover, real-mode proofs fail with `prover_not_configured` (never a bogus proof).
    return undefined;
  }
}

/* --------------------------------------------------- INJECTION POINT: wallet (viem) */

/**
 * A burner wallet on this device: a viem local account created the first time the app loads in local / sepolia,
 * its key kept in the same IndexedDB vault as the passes (and so inside `vault.export()` backups). The key never
 * leaves the device and is never logged. Judges' phones hold no Sepolia ETH or USDC: the SDK asks the demo faucet
 * for both before the first write (`mra.wallet.ensureFunded()`).
 *
 * Writes (customer pay, createShop, registry.issue, the mandate signature, lender deposits) go straight to the RPC
 * URL from the wallet; chain READS still use Anon-RPC. To use a browser wallet instead, return a viem WalletClient
 * over `window.ethereum` here (createWalletClient({ account, chain, transport: custom(eth) })).
 */
async function loadWallet(vault: CredentialVault): Promise<MRAConfig["wallet"]> {
  if (!MRA_ENV.burnerWallet || MRA_MODE === "mock") return undefined;
  try {
    const chainId = deploymentFor(MRA_MODE).chainId;
    const rpcUrl = MRA_ENV.rpcUrl ?? (MRA_MODE === "local" ? DEFAULTS.local.rpcUrl : DEFAULTS.sepolia.rpcUrl);
    const { wallet, address } = await loadOrCreateBurner(vault, { chainId, rpcUrl });
    MRA_BROWSER_STATUS.address = address;
    return wallet;
  } catch {
    // No IndexedDB (private mode) or not a testnet: read-only, writes fail with `wallet_required`.
    return undefined;
  }
}

/* ------------------------------------- INJECTION POINTS: Reclaim, Agent Pass, IDKit */

/**
 * Leave these undefined to keep the SDK defaults: the issuer's /mock/proof as the Reclaim stand-in, and the
 * mock Agent Pass / IDKit payloads (the backend accepts them with WORLD_MOCK=1). For the real flows:
 *
 *   reclaim:   reclaimJsSdk({ createRequest: () => fetch("/api/reclaim").then(r => r.text()).then(ReclaimProofRequest.fromJsonString) })
 *              (the route runs ReclaimProofRequest.init with the app secret, server-side only)
 *   agentPass: worldOidcAgentPass({ authorize: (nonce) => worldSignIn({ nonce }) })   // agent_pass_nonce as the OIDC nonce
 *   idkit:     idkit({ request: (signal) => openIdkitWidget({ action: WORLD_RECOVERY_ACTION, signal }) })
 */
function worldAdapters(): Pick<MRAConfig, "reclaim" | "agentPass" | "idkit"> {
  return {};
}

/* -------------------------------------------------------------------------- build */

/** The browser config: the shared base plus whatever adapters loaded. Called once per tab by getMRA(). */
export async function browserConfig(base: MRAConfig): Promise<MRAConfig> {
  // One vault for the passes, the session and the burner key (IndexedDB, this device only).
  const vault = base.vault ?? new IndexedDbVault();
  const [anon, prover, wallet] = await Promise.all([
    MRA_ENV.anonRpc ? loadAnonRpc() : Promise.resolve(undefined),
    loadProver(),
    loadWallet(vault),
  ]);
  anonRpc = anon;

  const cfg: MRAConfig = { ...base, ...worldAdapters(), vault };
  // The merchant QR / pay link opens C01 on this deployment: ?shop=<bytes32>&name=… is added by the SDK.
  if (!cfg.payUrl) cfg.payUrl = `${window.location.origin}${routes.pay}`;
  if (prover) {
    cfg.prover = prover;
    MRA_BROWSER_STATUS.prover = "worker";
  }
  if (wallet) {
    cfg.wallet = wallet;
    MRA_BROWSER_STATUS.wallet = "burner";
  }

  let rpc: RpcConfig = { ...base.rpc };
  if (!MRA_ENV.anonRpc) {
    MRA_BROWSER_STATUS.anonRpc = "off";
  } else if (anon) {
    // { url, anonRpc: true, anonWorker, allowDirectFallback }: every chain read goes through the anon network.
    rpc = { ...rpc, ...anon.rpcConfig() };
    MRA_BROWSER_STATUS.anonRpc = "anon";
  } else if (MRA_ENV.anonRpcStrict) {
    // Fail closed: chain reads throw `anon_rpc_unavailable`.
    rpc = { ...rpc, anonRpc: true };
    MRA_BROWSER_STATUS.anonRpc = "fail-closed";
  } else {
    // Demo fallback: the module didn't load, so read directly. mra.network().rpc reports "direct".
    MRA_BROWSER_STATUS.anonRpc = "direct-fallback";
  }
  cfg.rpc = rpc;
  return cfg;
}
