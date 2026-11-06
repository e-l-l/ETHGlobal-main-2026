/**
 * Anon-RPC transport (EF anon-rpc, `@anon-rpc/browser-harness` ≥ 0.4).
 *
 * The harness is browser-only (null-origin iframe + WebRTC), so the SDK does not depend on it. The app constructs
 * ONE long-lived `AnonRpcWorker` and passes it (or just its `fetch`) to createMRA:
 *
 *   import { AnonRpcWorker } from "@anon-rpc/browser-harness";
 *   const worker = new AnonRpcWorker({
 *     address: ANON_SPECIFIERS.nox.specifier,        // the network's specifier contract
 *     preExisting: { rpcProvider: bootstrapProvider("https://ethereum-sepolia-rpc.publicnode.com") },
 *   });
 *   createMRA({ mode: "sepolia", rpc: { anonRpc: true, anonWorker: worker } });
 *
 * Every chain read then goes `viem http(url, { fetchFn: worker.fetch })`. Writes go through our relayer or the
 * user's wallet (anon-rpc is for reads). `worker.fetch` is this-bound, so passing it as a free function is fine.
 */
import type { FetchFn } from "../http.js";

/** Structural type of `AnonRpcWorker` from @anon-rpc/browser-harness. */
export type AnonRpcWorkerLike = {
  fetch: (input: string | URL | Request, init?: RequestInit & { anonOptions?: { isolationKey?: string } }) => Promise<Response>;
  ready?: Promise<unknown>;
  close?: () => void;
};

/** Known networks (github.com/ethereum/anon-rpc adopters.json5). `chainId` = where the SPECIFIER lives (bootstrap read). */
export const ANON_SPECIFIERS = {
  /** Reference only: plain fetch inside the sandbox, NOT anonymous. Good for wiring tests. */
  passthrough: { specifier: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27", chainId: 1, anonymous: false },
  torJs: { specifier: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e", chainId: 1, anonymous: true },
  nym: { specifier: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0", chainId: 1, anonymous: true },
  /** Specifier published on Sepolia, so a Sepolia bootstrap RPC is enough. */
  nox: { specifier: "0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A", chainId: 11155111, anonymous: true },
} as const;

/** An EIP-1193-style provider over a plain JSON-RPC URL, for the harness's one bootstrap read. */
export function bootstrapProvider(url: string, fetchFn: FetchFn = (i, init) => globalThis.fetch(i, init)) {
  let id = 0;
  return {
    async request({ method, params }: { method: string; params?: unknown }) {
      const res = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params: params ?? [] }),
      });
      const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (body.error) throw new Error(body.error.message ?? "rpc error");
      return body.result;
    },
  };
}

/** Turn a worker into a `FetchFn`, optionally with an isolation key (e.g. one per shop pseudonym). */
export function anonFetchFrom(worker: AnonRpcWorkerLike, isolationKey?: string): FetchFn {
  return (input, init) => worker.fetch(input, isolationKey ? { ...init, anonOptions: { isolationKey } } : init);
}
