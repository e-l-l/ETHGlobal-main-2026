/**
 * `@repo/sdk/browser/anon`: one call to get an Anon-RPC transport for createMRA.
 *
 *   const anon = createAnonRpc({ network: "nox", rpc: { url: "https://ethereum-sepolia-rpc.publicnode.com" } });
 *   anon.onStatus((s) => setBadge(s.label));            // "Connecting privately…" → "Private connection ready"
 *   const mra = createMRA({ mode: "sepolia", rpc: anon.rpcConfig(), timeoutMs: 60_000 });
 *   anon.stats();                                        // { routed: 41, direct: 0, routedShare: 1, ... }
 *
 * It wraps the real `AnonRpcWorker` from @anon-rpc/browser-harness 0.4 (spec 0.4.0): the network's hash-pinned
 * anon-client runs in a Web Worker inside a null-origin sandboxed iframe, and every chain read is a `fetch` routed
 * through it. The harness is imported lazily, so importing this module on the server (SSR) is safe; only
 * `createAnonRpc()` must run in the browser.
 *
 * Fail closed by default: if the network can't start, every read rejects with `anon_rpc_unavailable`; nothing is
 * ever sent directly unless `allowDirectFallback: true` (and then each direct request is counted as such).
 *
 * Only one request is ever made outside the anon network: the harness's bootstrap read of the network's
 * specifier contract (`workerHash()` / `workerResolvers()`), which reveals only that you are starting Anon-RPC.
 * It is counted separately in `stats().bootstrap`.
 */
import { ChainError, ConfigError } from "../errors.js";
import type { AnonRpcWorkerLike } from "../transport/anon.js";
import { ANON_SPECIFIERS } from "../transport/anon.js";

export type AnonNetwork = "nox" | "tor-js" | "nym" | "passthrough";

/** §9.4 plain value (JSON + undefined/Uint8Array/ArrayBuffer): the only thing a network `config` may be. */
export type AnonPlainValue = undefined | null | boolean | number | string | Uint8Array | ArrayBuffer | AnonPlainValue[] | { [k: string]: AnonPlainValue };

export const ANON_NETWORKS: Record<
  AnonNetwork,
  { specifier: `0x${string}`; specifierChainId: number; anonymous: boolean; label: string; defaultConfig?: AnonPlainValue; note: string }
> = {
  nox: {
    specifier: ANON_SPECIFIERS.nox.specifier,
    specifierChainId: 11155111,
    anonymous: true,
    label: "Nox mixnet",
    note: "Sphinx mixnet over KPS; TLS to the RPC runs inside the worker, so the exit relays without reading. Specifier on Sepolia. Needs CSP 'wasm-unsafe-eval'.",
  },
  "tor-js": {
    specifier: ANON_SPECIFIERS.torJs.specifier,
    specifierChainId: 1,
    anonymous: true,
    label: "Tor",
    // From github.com/ethereum/anon-rpc adopters.json5: a DEMONSTRATION gateway (limited capacity; may disappear).
    defaultConfig: { gateways: ["152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ"] },
    note: "Tor compiled to WASM; needs a gateway (config.gateways). Specifier on mainnet. Some RPC providers refuse Tor exits.",
  },
  nym: {
    specifier: ANON_SPECIFIERS.nym.specifier,
    specifierChainId: 1,
    anonymous: true,
    label: "Nym mixnet",
    note: "Nym mixnet client in WASM (~18 MB bundle, a few seconds to bootstrap). Specifier on mainnet.",
  },
  passthrough: {
    specifier: ANON_SPECIFIERS.passthrough.specifier,
    specifierChainId: 1,
    anonymous: false,
    label: "Passthrough (NOT anonymous)",
    note: "Reference worker: sandbox + hash pinning, but a plain fetch. Wiring tests only.",
  },
};

/** Public RPCs used for the one bootstrap read of the specifier, by the chain the specifier lives on. */
export const BOOTSTRAP_RPC: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
};

export const DEFAULT_ANON_TARGET = "https://ethereum-sepolia-rpc.publicnode.com";

export type AnonRpcPhase = "connecting" | "ready" | "failed" | "closed";
export type AnonRpcStatus = {
  phase: AnonRpcPhase;
  /** User-facing line for the badge. */
  label: string;
  network: AnonNetwork;
  anonymous: boolean;
  /** ms since createAnonRpc. */
  elapsedMs: number;
  /** On failure: the harness / network code (e.g. "bad-config", "unsupported-platform", "ready_timeout"). */
  error?: { code: string; message: string };
};

export type AnonRpcStats = {
  /** HTTP requests sent through the anon network. */
  routed: number;
  /** ...of which got a response. */
  routedOk: number;
  /** ...of which failed (network error, timeout, worker down). */
  routedFailed: number;
  /** Requests sent DIRECTLY (only ever non-zero with allowDirectFallback). */
  direct: number;
  /** Requests refused because the network was down and fallback is off (fail closed). */
  refused: number;
  /** JSON-RPC calls inside the routed requests, by method (batches counted per call). */
  methods: Record<string, number>;
  /** The harness's one-time, unanonymized specifier read(s): see the module doc. Not app traffic. */
  bootstrap: number;
  /** routed / (routed + direct): the share of app RPC traffic that went through Anon-RPC. 1 when nothing was sent. */
  routedShare: number;
};

export type AnonLogEntry = { level: "debug" | "info" | "warn" | "error"; args: unknown[] };

export type CreateAnonRpcOptions = {
  /** Default "nox" (its specifier lives on Sepolia, so a Sepolia bootstrap RPC is enough). */
  network?: AnonNetwork;
  /**
   * The JSON-RPC endpoint the reads go to (through the anon network). Any absolute https URL works with the
   * networks above: our devnet `https://rpc.<host>`, publicnode, Alchemy... Default: Sepolia publicnode.
   */
  rpc?: { url?: string };
  /** Override the bootstrap RPC (must serve the specifier's chain: Sepolia for nox, mainnet for the others). */
  bootstrapRpcUrl?: string;
  /** Network-defined config, passed to the worker as-is (tor-js: `{ gateways: [...] }`). */
  config?: AnonPlainValue;
  /** Override the specifier contract (e.g. your own deployment of a network). */
  specifier?: `0x${string}`;
  /** Same-origin bootstrap page for strict CSPs (see harness README). */
  iframeUrl?: string;
  /** Default isolation key for every call (e.g. the shop pseudonym), so different keys are unlinkable. */
  isolationKey?: string;
  /** Fail open: send reads directly when the network is down. Default false (fail closed). Demo escape hatch only. */
  allowDirectFallback?: boolean;
  /** Give up on startup after this long (the harness's `ready` never settles under a blocking CSP). Default 90 s. */
  readyTimeoutMs?: number;
  /** Labels for the badge, per phase. */
  labels?: Partial<Record<AnonRpcPhase, string>>;
  onStatus?: (s: AnonRpcStatus) => void;
  /** Collect the worker's own log lines (mixnet bootstrap progress etc.). Claims them: they stop going to console. */
  onLog?: (e: AnonLogEntry) => void;
  /** Tests / custom harness: build the worker yourself. Default: `new AnonRpcWorker(init)` from the harness. */
  workerFactory?: (init: AnonWorkerInit) => AnonHarnessWorker | Promise<AnonHarnessWorker>;
  /** fetch for the bootstrap read and for direct fallback. Default globalThis.fetch. */
  directFetch?: (input: string, init?: RequestInit) => Promise<Response>;
};

/** What the harness constructor takes (WorkerInit, spec 0.4.0). */
export type AnonWorkerInit = {
  address: string;
  config?: AnonPlainValue;
  iframeUrl?: string;
  preExisting: { rpcProvider: { request(args: { method: string; params?: unknown[] }): Promise<unknown> } };
};

/** What the harness's AnonRpcWorker gives back. */
export type AnonHarnessWorker = {
  ready: Promise<unknown>;
  fetch: (input: string | URL | Request, init?: RequestInit & { anonOptions?: { isolationKey?: string } }) => Promise<Response>;
  acceptLog?: (opts?: { signal?: AbortSignal }) => Promise<AnonLogEntry>;
  close: () => void;
};

/** The handle. It IS an `AnonRpcWorkerLike`, so it plugs straight into `rpc.anonWorker`. */
export interface AnonRpc extends AnonRpcWorkerLike {
  readonly network: AnonNetwork;
  readonly anonymous: boolean;
  /** The RPC URL reads are sent to (through the network). */
  readonly url: string;
  /** Resolves when the network is up; rejects (ChainError anon_rpc_unavailable) if it failed to start. */
  readonly ready: Promise<void>;
  fetch: (input: string | URL | Request, init?: RequestInit & { anonOptions?: { isolationKey?: string } }) => Promise<Response>;
  status(): AnonRpcStatus;
  /** Subscribe to status changes; called immediately with the current status. Returns unsubscribe. */
  onStatus(fn: (s: AnonRpcStatus) => void): () => void;
  stats(): AnonRpcStats;
  /** Subscribe to counter changes (after every request). Returns unsubscribe. */
  onStats(fn: (s: AnonRpcStats) => void): () => void;
  resetStats(): void;
  /** `rpc` block for createMRA: `{ url, anonRpc: true, anonWorker: this, allowDirectFallback }`. */
  rpcConfig(): { url: string; anonRpc: true; anonWorker: AnonRpcWorkerLike; allowDirectFallback: boolean };
  /** A fetch bound to an isolation key (one per shop pseudonym), for `rpc.anonFetch`. */
  isolated(isolationKey: string): (input: string, init?: RequestInit) => Promise<Response>;
  close(): void;
}

const DEFAULT_LABELS: Record<AnonRpcPhase, string> = {
  connecting: "Connecting privately…",
  ready: "Private connection ready",
  failed: "Private connection unavailable. Nothing was sent.",
  closed: "Private connection closed",
};

function errInfo(e: unknown): { code: string; message: string } {
  const o = (e ?? {}) as { code?: unknown; name?: unknown; message?: unknown };
  const code = typeof o.code === "string" && o.code ? o.code : typeof o.name === "string" && o.name !== "Error" ? o.name : "worker_failed";
  return { code, message: typeof o.message === "string" ? o.message.slice(0, 200) : String(e).slice(0, 200) };
}

/** JSON-RPC method names in a request body (single or batch). Never reads params. */
function methodsOf(body: unknown): string[] {
  if (typeof body !== "string") return [];
  try {
    const j = JSON.parse(body) as unknown;
    const arr = Array.isArray(j) ? j : [j];
    return arr.map((x) => (x && typeof (x as { method?: unknown }).method === "string" ? (x as { method: string }).method : "?"));
  } catch {
    return [];
  }
}

function urlOf(input: string | URL | Request): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

export function createAnonRpc(opts: CreateAnonRpcOptions = {}): AnonRpc {
  const network = opts.network ?? "nox";
  const net = ANON_NETWORKS[network];
  if (!net) throw new ConfigError("config_invalid", `unknown Anon-RPC network: ${String(network)}`);
  const url = opts.rpc?.url ?? DEFAULT_ANON_TARGET;
  if (!/^https?:\/\//.test(url)) throw new ConfigError("config_invalid", "rpc.url must be an absolute http(s) URL");
  const bootstrapUrl = opts.bootstrapRpcUrl ?? BOOTSTRAP_RPC[net.specifierChainId];
  if (!bootstrapUrl) throw new ConfigError("config_invalid", `no bootstrap RPC for chain ${net.specifierChainId}; pass bootstrapRpcUrl`);
  const labels = { ...DEFAULT_LABELS, ...opts.labels };
  const allowDirect = opts.allowDirectFallback ?? false;
  const directFetch = opts.directFetch ?? ((i: string, init?: RequestInit) => globalThis.fetch(i, init));
  const t0 = Date.now();

  let current: AnonRpcStatus = { phase: "connecting", label: labels.connecting, network, anonymous: net.anonymous, elapsedMs: 0 };
  const statusSubs = new Set<(s: AnonRpcStatus) => void>();
  if (opts.onStatus) statusSubs.add(opts.onStatus);
  const setStatus = (phase: AnonRpcPhase, error?: { code: string; message: string }) => {
    if (current.phase === "closed" || (current.phase === "failed" && phase !== "closed")) return;
    current = { phase, label: labels[phase], network, anonymous: net.anonymous, elapsedMs: Date.now() - t0, ...(error ? { error } : {}) };
    for (const fn of statusSubs) fn(current);
  };

  const fresh = (): AnonRpcStats => ({ routed: 0, routedOk: 0, routedFailed: 0, direct: 0, refused: 0, methods: {}, bootstrap: 0, routedShare: 1 });
  let counters = fresh();
  const statsSubs = new Set<(s: AnonRpcStats) => void>();
  const snapshot = (): AnonRpcStats => {
    const sent = counters.routed + counters.direct;
    return { ...counters, methods: { ...counters.methods }, routedShare: sent === 0 ? 1 : counters.routed / sent };
  };
  const bump = (fn: (c: AnonRpcStats) => void) => {
    fn(counters);
    if (statsSubs.size) {
      const s = snapshot();
      for (const f of statsSubs) f(s);
    }
  };

  // The one direct read: the harness reads the specifier through this provider before the network exists.
  let rpcId = 0;
  const rpcProvider = {
    async request({ method, params }: { method: string; params?: unknown[] }) {
      bump((c) => void c.bootstrap++);
      const res = await directFetch(bootstrapUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params: params ?? [] }),
      });
      const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (body.error) throw new Error(body.error.message ?? "bootstrap rpc error");
      return body.result;
    },
  };

  const init: AnonWorkerInit = {
    address: opts.specifier ?? net.specifier,
    preExisting: { rpcProvider },
    ...(opts.iframeUrl ? { iframeUrl: opts.iframeUrl } : {}),
  };
  const config = opts.config !== undefined ? opts.config : net.defaultConfig;
  if (config !== undefined) init.config = config;

  const logAbort = new AbortController();
  const workerP: Promise<AnonHarnessWorker> = (async () => {
    if (opts.workerFactory) return opts.workerFactory(init);
    if (typeof window === "undefined" || typeof document === "undefined") {
      throw new ChainError("anon_rpc_unavailable", "Anon-RPC runs in the browser only (null-origin iframe + WebRTC)");
    }
    const { AnonRpcWorker } = await import("@anon-rpc/browser-harness");
    return new AnonRpcWorker(init as ConstructorParameters<typeof AnonRpcWorker>[0]) as unknown as AnonHarnessWorker;
  })();

  let failure: ChainError | undefined;
  const ready: Promise<void> = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const w = await workerP;
      if (opts.onLog && w.acceptLog) {
        void (async () => {
          for (;;) {
            try {
              opts.onLog?.(await w.acceptLog!({ signal: logAbort.signal }));
            } catch {
              return;
            }
          }
        })();
      }
      const timeout = new Promise<never>((_, rej) => {
        timer = setTimeout(
          () => rej(Object.assign(new Error("Anon-RPC did not become ready in time (CSP blocking the sandbox, or the network is down)"), { code: "ready_timeout" })),
          opts.readyTimeoutMs ?? 90_000,
        );
      });
      await Promise.race([w.ready, timeout]);
      setStatus("ready");
    } catch (e) {
      const info = errInfo(e);
      failure = new ChainError("anon_rpc_unavailable", `Anon-RPC (${network}) unavailable: ${info.code}`, e);
      setStatus("failed", info);
      throw failure;
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();
  ready.catch(() => undefined); // surfaced through status / fetch; never an unhandled rejection

  async function anonFetch(input: string | URL | Request, init?: RequestInit & { anonOptions?: { isolationKey?: string } }): Promise<Response> {
    const target = urlOf(input);
    const body = init?.body;
    if (current.phase === "closed") {
      bump((c) => void c.refused++);
      throw new ChainError("anon_rpc_unavailable", "Anon-RPC was closed");
    }
    try {
      await ready;
    } catch (e) {
      if (!allowDirect) {
        bump((c) => void c.refused++);
        throw failure ?? e;
      }
      bump((c) => void c.direct++);
      const { anonOptions: _drop, ...plain } = init ?? {};
      return directFetch(target, plain);
    }
    const w = await workerP;
    const key = init?.anonOptions?.isolationKey ?? opts.isolationKey;
    const fwd = key ? { ...init, anonOptions: { ...init?.anonOptions, isolationKey: key } } : init;
    bump((c) => {
      c.routed++;
      for (const m of methodsOf(body)) c.methods[m] = (c.methods[m] ?? 0) + 1;
    });
    try {
      const res = await w.fetch(input, fwd);
      bump((c) => void c.routedOk++);
      return res;
    } catch (e) {
      bump((c) => void c.routedFailed++);
      // Fail closed even per request: a routed read that failed is NOT retried directly.
      if ((e as { name?: string })?.name === "AbortError") throw e;
      throw new ChainError("anon_rpc_unavailable", `Anon-RPC request failed: ${errInfo(e).code}`, e);
    }
  }

  const handle: AnonRpc = {
    network,
    anonymous: net.anonymous,
    url,
    ready,
    fetch: anonFetch,
    status: () => current,
    onStatus(fn) {
      statusSubs.add(fn);
      fn(current);
      return () => statusSubs.delete(fn);
    },
    stats: snapshot,
    onStats(fn) {
      statsSubs.add(fn);
      return () => statsSubs.delete(fn);
    },
    resetStats() {
      const b = counters.bootstrap;
      counters = fresh();
      counters.bootstrap = b;
    },
    rpcConfig: () => ({ url, anonRpc: true as const, anonWorker: handle, allowDirectFallback: allowDirect }),
    isolated: (isolationKey: string) => (input: string, init?: RequestInit) => anonFetch(input, { ...init, anonOptions: { isolationKey } }),
    close() {
      logAbort.abort();
      setStatus("closed");
      workerP.then((w) => w.close()).catch(() => undefined);
    },
  };
  return handle;
}
