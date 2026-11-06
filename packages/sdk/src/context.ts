import { AgentsApi, IssuerApi } from "./api/clients.js";
import { mockProver, unconfiguredProver, type Prover } from "./adapters/prover.js";
import { defaultVault, MemoryVault, type CredentialVault, type Session } from "./adapters/vault.js";
import {
  issuerMockReclaim,
  mockAgentPass,
  mockIdkit,
  mockReclaim,
  type AgentPassAdapter,
  type IdkitAdapter,
  type ReclaimAdapter,
} from "./adapters/world.js";
import { createChain, type Chain } from "./chain/chain.js";
import { deploymentFor } from "./chain/deployments.js";
import type { ResolvedConfig } from "./config.js";
import { ChainError, ConfigError, NotSupportedError, VaultError } from "./errors.js";
import type { FetchFn } from "./http.js";
import type { AgentStatus, FundResult, Mode, NetworkInfo } from "./viewmodels.js";
import { ApiError } from "./errors.js";
import { anonFetchFrom } from "./transport/anon.js";

/** Mutable state that mock mode keeps so flows feel real (approve → active → revoke). */
export type MockState = {
  agentStatus: AgentStatus;
  pseudonym: string;
  backup?: string;
  recoveryVerified: boolean;
};

export type Ctx = {
  mode: Mode;
  cfg: ResolvedConfig;
  vault: CredentialVault;
  prover: Prover;
  reclaim: ReclaimAdapter;
  agentPass: AgentPassAdapter;
  idkit: IdkitAdapter;
  mock: MockState;
  api(): AgentsApi;
  issuer(): IssuerApi;
  chain(): Chain;
  network(): NetworkInfo;
  session(): Promise<Session>;
  requireShop(): Promise<Required<Pick<Session, "shopId">> & Session>;
  saveSession(patch: Partial<Session>): Promise<Session>;
  /** Mock latency, then a deep copy so screens can't mutate the shared mock objects. */
  mocked<T>(value: T): Promise<T>;
  notMock(what: string): void;
  now(): number;
  emit(type: string, code?: string): void;
  /**
   * Make sure this device's wallet can pay for its next writes: if it has no gas (or less USDC than `usdc`
   * dollars), ask the demo faucet once. Every write calls it first; the faucet is asked at most once per instance.
   */
  ensureFunded(opts?: { usdc?: number; onFunding?: () => void }): Promise<FundResult>;
};

/** "Has gas" = enough for ~1M gas at the current price (a Business Pass issue is ~0.8M on Sepolia). */
const GAS_HEADROOM = 1_000_000n;
const USDC_UNIT = 1_000_000;

export function createContext(cfg: ResolvedConfig): Ctx {
  const mode = cfg.mode;
  const isMock = mode === "mock";
  let api: AgentsApi | undefined;
  let issuer: IssuerApi | undefined;
  let chain: Chain | undefined;
  let rpcKind: NetworkInfo["rpc"] = isMock ? "none" : "direct";

  const getIssuer = () => {
    if (!cfg.issuerUrl) throw new ConfigError("config_invalid", "issuerUrl is required for onboarding in this mode");
    return (issuer ??= new IssuerApi({ baseUrl: cfg.issuerUrl, timeoutMs: cfg.timeoutMs, ...(cfg.fetch ? { fetch: cfg.fetch } : {}) }));
  };

  let lazyReclaim: ReclaimAdapter | undefined;
  let fundedOnce = false; // a wallet that was ready once stays "ready" for this instance (no extra reads)
  let faucetAsked: Promise<FundResult> | undefined;

  async function balances(addr: `0x${string}`) {
    const chain = ctx.chain();
    const [eth, usdc, gasPrice] = await Promise.all([
      chain.client.getBalance({ address: addr }),
      chain.usdcBalance(addr),
      chain.client.getGasPrice(),
    ]);
    return { eth, usdc: Number(usdc) / USDC_UNIT, need: gasPrice * GAS_HEADROOM };
  }

  async function askFaucet(addr: `0x${string}`, onFunding?: () => void): Promise<FundResult> {
    onFunding?.();
    ctx.emit("wallet.faucet", "requested");
    try {
      const r = await ctx.api().demoFaucet(addr);
      ctx.emit("wallet.faucet", "funded");
      return { status: "funded", address: addr, txHashes: [r.eth_tx, r.usdc_tx].filter((h): h is `0x${string}` => !!h) };
    } catch (e) {
      if (e instanceof ApiError) {
        const status = e.status === 409 ? "already_funded" : e.status === 429 ? "limited" : e.status === 404 ? "unavailable" : undefined;
        if (status) {
          ctx.emit("wallet.faucet", status);
          return { status, address: addr };
        }
      }
      throw e;
    }
  }
  const realReclaim = () => (lazyReclaim ??= issuerMockReclaim(getIssuer()));

  const ctx: Ctx = {
    mode,
    cfg,
    vault: cfg.vault ?? (isMock ? new MemoryVault() : defaultVault()),
    prover: cfg.prover ?? (isMock ? mockProver() : unconfiguredProver()),
    // local mode: the issuer's ISSUER_MOCK=1 /mock/proof stands in for the Reclaim app (everything after is real).
    reclaim: cfg.reclaim ?? (isMock ? mockReclaim() : { kind: "issuer-mock", start: (r) => realReclaim().start(r), wait: (id, o) => realReclaim().wait(id, o) }),
    // The backend defaults to WORLD_MOCK=1, so the mock Agent Pass / IDKit payloads work against it too.
    agentPass: cfg.agentPass ?? mockAgentPass("approve"),
    idkit: cfg.idkit ?? mockIdkit(),
    mock: { agentStatus: "active", pseudonym: "shop_7f3a", recoveryVerified: false },

    api() {
      if (isMock) throw new NotSupportedError("the agents API", mode);
      if (!cfg.apiUrl) throw new ConfigError("config_invalid", "apiUrl is required in sepolia mode");
      return (api ??= new AgentsApi({ baseUrl: cfg.apiUrl, timeoutMs: cfg.timeoutMs, ...(cfg.fetch ? { fetch: cfg.fetch } : {}) }));
    },
    issuer: () => {
      if (isMock) throw new NotSupportedError("the issuer", mode);
      return getIssuer();
    },
    chain() {
      if (isMock) throw new NotSupportedError("chain reads", mode);
      if (chain) return chain;
      let fetchFn: FetchFn | undefined;
      if (cfg.rpc.anonRpc) {
        if (cfg.rpc.anonFetch) fetchFn = cfg.rpc.anonFetch;
        else if (cfg.rpc.anonWorker) fetchFn = anonFetchFrom(cfg.rpc.anonWorker);
        else if (!cfg.rpc.allowDirectFallback) {
          throw new ChainError("anon_rpc_unavailable", "rpc.anonRpc is on but no anonWorker/anonFetch was provided");
        }
        rpcKind = fetchFn ? "anon" : "direct";
        ctx.emit("rpc", rpcKind);
      }
      chain = createChain({
        deployment: cfg.deployment ?? deploymentFor(mode as "local" | "sepolia"),
        url: cfg.rpc.url,
        timeoutMs: cfg.timeoutMs,
        ...(fetchFn ? { fetchFn } : {}),
        ...(cfg.wallet ? { wallet: cfg.wallet } : {}),
      });
      return chain;
    },
    network() {
      const d = isMock ? undefined : (cfg.deployment ?? deploymentFor(mode as "local" | "sepolia"));
      const anonReady = !!(cfg.rpc.anonFetch || cfg.rpc.anonWorker);
      const info: NetworkInfo = {
        mode,
        chainId: d?.chainId ?? 0,
        rpc: isMock ? "none" : cfg.rpc.anonRpc && anonReady ? "anon" : rpcKind,
      };
      if (cfg.apiUrl) info.apiUrl = cfg.apiUrl;
      if (cfg.issuerUrl) info.issuerUrl = cfg.issuerUrl;
      return info;
    },
    async session() {
      return (await ctx.vault.get("session")) ?? {};
    },
    async requireShop() {
      const s = await ctx.session();
      if (!s.shopId) throw new VaultError("session_missing", "no shop on this device yet: run onboarding.createShop first");
      return s as Required<Pick<Session, "shopId">> & Session;
    },
    async saveSession(patch) {
      const next = { ...(await ctx.session()), ...patch };
      await ctx.vault.put("session", next);
      return next;
    },
    async mocked<T>(value: T) {
      if (cfg.mockLatencyMs) await new Promise((r) => setTimeout(r, cfg.mockLatencyMs));
      return structuredClone(value);
    },
    notMock(what) {
      if (isMock) throw new NotSupportedError(what, mode);
    },
    now: () => Math.floor(Date.now() / 1000),
    async ensureFunded(opts = {}) {
      if (isMock) return { status: "unavailable" };
      const chain = ctx.chain();
      const addr = chain.walletAddress();
      if (!addr) throw new ChainError("wallet_required", "connect a wallet (pass `wallet` to createMRA) for this action");
      const wantUsdc = opts.usdc ?? 0;
      if (fundedOnce && wantUsdc === 0) return { status: "ready", address: addr };
      const before = await balances(addr);
      const ready = (b: typeof before) => b.eth >= b.need && b.usdc >= wantUsdc;
      if (ready(before)) {
        fundedOnce = true;
        return { status: "ready", address: addr, ethWei: before.eth.toString(), usdc: before.usdc };
      }
      if (cfg.faucet === false || !cfg.apiUrl) return { status: "unavailable", address: addr, ethWei: before.eth.toString(), usdc: before.usdc };
      // Once per instance: a second write while the first request is in flight waits for the same answer.
      const asked = await (faucetAsked ??= askFaucet(addr, opts.onFunding).catch((e) => {
        faucetAsked = undefined; // a network failure may be retried
        throw e;
      }));
      if (asked.status !== "funded") return { ...asked, ethWei: before.eth.toString(), usdc: before.usdc };
      // The faucet waited for its receipts, but a load-balanced RPC may lag a block or two behind it.
      const landed = (b: typeof before) =>
        (b.eth > before.eth || b.eth >= b.need) && (wantUsdc === 0 || b.usdc > before.usdc || b.usdc >= wantUsdc);
      let after = await balances(addr);
      for (let i = 0; i < 10 && !landed(after); i++) {
        await new Promise((r) => setTimeout(r, 2_000));
        after = await balances(addr);
      }
      fundedOnce = after.eth > 0n;
      return { ...asked, ethWei: after.eth.toString(), usdc: after.usdc };
    },
    emit(type, code) {
      try {
        cfg.onEvent?.(code === undefined ? { type } : { type, code });
      } catch {
        /* a broken logger must never break a flow */
      }
    },
  };
  return ctx;
}
