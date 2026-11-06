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
import {
  AgentsApi,
  DEFAULTS,
  IndexedDbVault,
  deploymentFor,
  idkitV4,
  loadOrCreateBurner,
  worldDeviceAgentPass,
  type AgentPassAdapter,
  type AnonRpcWorkerLike,
  type CredentialVault,
  type IdkitRequestConfig,
  type MRAConfig,
  type Prover,
  type RpcConfig,
} from "@repo/sdk";
import { MRA_ENV, MRA_MODE } from "./mra";
import { routes } from "./routes";
import { WORLD_MODE, setWorldPrompt } from "./world-prompt";

/** What actually got wired, for a "live" / network badge. Read after `await getMRA()`. */
export const MRA_BROWSER_STATUS: {
  anonRpc: "off" | "anon" | "direct-fallback" | "fail-closed";
  prover: "worker" | "none";
  wallet: "burner" | "injected" | "none";
  /** The injected wallet's name ("MetaMask", …) when wallet === "injected". */
  walletName?: string;
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
  /** Request counters (SDK AnonRpcStats). Optional: the build-time stub has none. */
  stats?(): { routed: number; direct: number };
  onStats?(fn: (s: { routed: number; direct: number }) => void): () => void;
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
  if (MRA_MODE === "mock") return undefined;
  if (MRA_MODE === "sepolia" && getWalletMode() === "injected") {
    const injected = await loadInjectedWallet();
    if (injected) return injected;
    // Fall through to the burner: the wallet refused, is missing, or is on the wrong chain.
  }
  if (!MRA_ENV.burnerWallet) return undefined;
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

/* ------------------------------------------- browser (injected) wallet, opt-in */

/** localStorage flag read once per tab: "injected" uses window.ethereum (MetaMask, …), anything else the burner. */
export const WALLET_MODE_KEY = "mra.walletMode";
export type WalletMode = "injected" | "device";

export function getWalletMode(): WalletMode {
  try {
    return window.localStorage.getItem(WALLET_MODE_KEY) === "injected" ? "injected" : "device";
  } catch {
    return "device";
  }
}

/** Set the flag and reload: the MRA client is created once per tab, so a reload is the clean switch. */
export function setWalletMode(mode: WalletMode) {
  try {
    window.localStorage.setItem(WALLET_MODE_KEY, mode);
  } catch {
    /* private mode: stays on the device wallet */
  }
  window.location.reload();
}

type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, fn: (...a: unknown[]) => void): void;
  removeListener?(event: string, fn: (...a: unknown[]) => void): void;
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  isRabby?: boolean;
  isBraveWallet?: boolean;
};

export function injectedProvider(): Eip1193 | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum;
}

export function injectedName(eth: Eip1193 | undefined): string {
  if (!eth) return "Browser wallet";
  if (eth.isRabby) return "Rabby";
  if (eth.isBraveWallet) return "Brave Wallet";
  if (eth.isCoinbaseWallet) return "Coinbase Wallet";
  if (eth.isMetaMask) return "MetaMask";
  return "Browser wallet";
}

const SEPOLIA_HEX = "0xaa36a7";

/** Accounts + switch to Sepolia (adding it when the wallet doesn't know it), then a viem WalletClient over it. */
async function loadInjectedWallet(): Promise<MRAConfig["wallet"]> {
  const eth = injectedProvider();
  if (!eth) return undefined;
  try {
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
    const address = accounts?.[0] as `0x${string}` | undefined;
    if (!address) return undefined;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: SEPOLIA_HEX }] });
    } catch (e) {
      if ((e as { code?: number })?.code !== 4902) throw e;
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: SEPOLIA_HEX,
            chainName: "Sepolia",
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia.gateway.tenderly.co"],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          },
        ],
      });
    }
    const chainId = (await eth.request({ method: "eth_chainId" })) as string;
    if (chainId?.toLowerCase() !== SEPOLIA_HEX) return undefined;
    // viem is an SDK dependency, not a direct apps/web one: import the SDK's copy so the WalletClient type matches.
    const { createWalletClient, custom } = await import("../../../../packages/sdk/node_modules/viem");
    const { sepolia } = await import("../../../../packages/sdk/node_modules/viem/chains");
    const wallet = createWalletClient({ account: address, chain: sepolia, transport: custom(eth) });
    MRA_BROWSER_STATUS.address = address;
    MRA_BROWSER_STATUS.walletName = injectedName(eth);
    injectedWallet = true;
    return wallet as MRAConfig["wallet"];
  } catch {
    return undefined;
  }
}

let injectedWallet = false;

/* ------------------------------------- INJECTION POINTS: Reclaim, Agent Pass, IDKit */

/**
 * NEXT_PUBLIC_WORLD_MODE=mock (default): leave these undefined to keep the SDK defaults, the issuer's /mock/proof as
 * the Reclaim stand-in and the mock Agent Pass / IDKit payloads (the backend accepts them with WORLD_MOCK=1).
 *
 * NEXT_PUBLIC_WORLD_MODE=real (backend WORLD_MOCK=0), per docs/FRONTEND-HANDOFF.md "World (real)":
 *   agentPass: the OIDC device flow. The agents API starts it with the agent's manage token (from this device's vault);
 *              `show` publishes the QR / user code / deadline to ./world-prompt for the approve screen.
 *   idkit:     World ID 4 (IDKit) with a fresh backend-signed rp_context per verification, for recovery backup/restore.
 *              `@worldcoin/idkit` is imported on first use only. The connector URL goes to ./world-prompt as a QR.
 */
function worldAdapters(vault: CredentialVault): Pick<MRAConfig, "agentPass" | "idkit"> {
  if (WORLD_MODE !== "real") return {};
  const apiUrl = MRA_ENV.apiUrl ?? (MRA_MODE === "local" ? DEFAULTS.local.apiUrl : undefined);
  if (!apiUrl) return {};
  const api = new AgentsApi({ baseUrl: apiUrl });

  const device = worldDeviceAgentPass({
    api,
    manageToken: async (agentId) => {
      const session = await vault.get("session");
      if (session?.agentId !== agentId || !session.manageToken) throw new Error("Agent session missing");
      return session.manageToken;
    },
    show: (prompt) => setWorldPrompt({ kind: "agent-pass", ...prompt }),
  });
  // Clear the prompt once World answered (or the flow failed), so the screen moves on to the next step.
  const agentPass: AgentPassAdapter = {
    kind: device.kind,
    authorize: async (req) => {
      try {
        return await device.authorize(req);
      } finally {
        setWorldPrompt(undefined);
      }
    },
  };

  const idkit = idkitV4({
    api,
    run: async (cfg: IdkitRequestConfig) => {
      const { IDKit, proofOfHuman } = await import("@worldcoin/idkit");
      try {
        const request = await IDKit.request({
          app_id: cfg.app_id as `app_${string}`,
          action: cfg.action,
          rp_context: cfg.rp_context,
          environment: cfg.environment as "production" | "staging" | "sandbox",
          allow_legacy_proofs: false,
        }).preset(proofOfHuman({}));
        setWorldPrompt({ kind: "idkit", connectorURI: request.connectorURI });
        const completion = await request.pollUntilCompletion({ timeout: 120_000 });
        if (!completion.success) throw new Error(`World verification failed: ${completion.error}`);
        return completion.result as unknown as Record<string, unknown>;
      } finally {
        setWorldPrompt(undefined);
      }
    },
  });

  return { agentPass, idkit };
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

  const cfg: MRAConfig = { ...base, ...worldAdapters(vault), vault };
  // The merchant QR / pay link opens C01 on this deployment: ?shop=<bytes32>&name=… is added by the SDK.
  if (!cfg.payUrl) cfg.payUrl = `${window.location.origin}${routes.pay}`;
  if (prover) {
    cfg.prover = prover;
    MRA_BROWSER_STATUS.prover = "worker";
  }
  if (wallet) {
    cfg.wallet = wallet;
    MRA_BROWSER_STATUS.wallet = injectedWallet ? "injected" : "burner";
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
