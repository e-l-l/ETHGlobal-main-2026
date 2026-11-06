/**
 * createAnonRpc (@repo/sdk/browser/anon) with a fake harness worker: SDK chain reads go 100% through it, the
 * counter is right, it fails closed, honours a custom RPC URL and isolation keys, and reports status for the UI.
 * The real harness needs a browser (iframe + WebRTC); see README "Anon-RPC" for the live check.
 */
import { describe, expect, it, vi } from "vitest";
import { createMRA } from "../src/index.js";
import { createAnonRpc, type AnonHarnessWorker, type AnonRpcStatus, type AnonWorkerInit } from "../src/browser/anon.js";

/** Minimal JSON-RPC server: enough for blockNumber, readContract (zero words) and getLogs (empty). */
function rpcAnswer(body: string): unknown {
  const req = JSON.parse(body) as { id: number; method: string } | { id: number; method: string }[];
  const one = (r: { id: number; method: string }) => {
    const result =
      r.method === "eth_blockNumber" ? "0xb94000" /* deployBlock + ~70k: a few eth_getLogs chunks per tree */ : r.method === "eth_chainId" ? "0xaa36a7" : r.method === "eth_getLogs" ? [] : r.method === "eth_call" ? `0x${"00".repeat(128)}` : null;
    return { jsonrpc: "2.0", id: r.id, result };
  };
  return Array.isArray(req) ? req.map(one) : one(req);
}

type Seen = { url: string; isolationKey?: string; method?: string };

function fakeHarness(opts: { fail?: { code: string; message: string }; never?: boolean } = {}) {
  const seen: Seen[] = [];
  const inits: AnonWorkerInit[] = [];
  let closed = false;
  const factory = (init: AnonWorkerInit): AnonHarnessWorker => {
    inits.push(init);
    const ready = opts.never
      ? new Promise<void>(() => undefined)
      : opts.fail
        ? Promise.reject(Object.assign(new Error(opts.fail.message), { code: opts.fail.code }))
        : // the real harness reads the specifier through the bootstrap provider before it is ready
          init.preExisting.rpcProvider.request({ method: "eth_call", params: [{ to: init.address, data: "0x" }, "latest"] }).then(() => undefined);
    ready.catch(() => undefined);
    return {
      ready,
      async fetch(input, init) {
        if (closed) throw new Error("closed");
        const body = String(init?.body ?? "");
        const key = init?.anonOptions?.isolationKey;
        seen.push({ url: String(input), ...(key ? { isolationKey: key } : {}), method: (JSON.parse(body) as { method?: string }).method });
        return new Response(JSON.stringify(rpcAnswer(body)), { headers: { "content-type": "application/json" } });
      },
      close: () => void (closed = true),
    };
  };
  return { factory, seen, inits };
}

const bootstrapOk = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x" })));

describe("createAnonRpc", () => {
  it("routes 100% of SDK chain reads through the anon network (createMRA sepolia)", async () => {
    const h = fakeHarness();
    const direct = vi.fn((u: string, i?: RequestInit) => bootstrapOk(u, i));
    const statuses: AnonRpcStatus["phase"][] = [];
    const anon = createAnonRpc({ workerFactory: h.factory, directFetch: direct, onStatus: (s) => statuses.push(s.phase) });
    expect(anon.status()).toMatchObject({ phase: "connecting", label: "Connecting privately…", network: "nox", anonymous: true });

    const mra = createMRA({ mode: "sepolia", apiUrl: "https://api.test", rpc: anon.rpcConfig() });
    expect(mra.network()).toMatchObject({ rpc: "anon", chainId: 11155111 });
    const chain = mra.raw.chain();
    await chain.blockNumber();
    await chain.protocol();
    await chain.leaves("standing");
    await chain.leaves("business");
    await chain.countrySet();

    await anon.ready;
    expect(statuses).toEqual(["ready"]);
    const s = anon.stats();
    expect(s.routed).toBe(h.seen.length);
    expect(s.routed).toBeGreaterThan(20);
    expect(s.routedOk).toBe(s.routed);
    expect(s.direct).toBe(0);
    expect(s.routedShare).toBe(1);
    expect(s.methods.eth_getLogs).toBeGreaterThan(0);
    expect(s.methods.eth_call).toBeGreaterThan(0);
    // The only direct request was the harness bootstrap (specifier read), on Sepolia for nox.
    expect(s.bootstrap).toBe(1);
    expect(direct).toHaveBeenCalledTimes(1);
    expect(direct.mock.calls[0]![0]).toBe("https://ethereum-sepolia-rpc.publicnode.com");
    expect(h.inits[0]!.address).toBe("0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A");
    // Every routed read went to the configured RPC URL.
    expect(new Set(h.seen.map((x) => x.url.replace(/\/$/, "")))).toEqual(new Set(["https://ethereum-sepolia-rpc.publicnode.com"]));
  });

  it("targets any https RPC URL (our devnet) and forwards isolation keys", async () => {
    const h = fakeHarness();
    const anon = createAnonRpc({ network: "tor-js", rpc: { url: "https://rpc.devnet.example" }, isolationKey: "shop_ab12", workerFactory: h.factory, directFetch: bootstrapOk });
    const mra = createMRA({ mode: "sepolia", apiUrl: "https://api.test", rpc: anon.rpcConfig() });
    await mra.raw.chain().blockNumber();
    await anon.isolated("shop_other")("https://rpc.devnet.example", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "eth_chainId" }) });
    expect(h.seen[0]).toMatchObject({ url: expect.stringMatching(/^https:\/\/rpc\.devnet\.example\/?$/), isolationKey: "shop_ab12" });
    expect(h.seen[1]).toMatchObject({ isolationKey: "shop_other" });
    // tor-js: mainnet specifier + bootstrap, demo gateway config by default.
    expect(h.inits[0]!.address).toBe("0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e");
    expect(h.inits[0]!.config).toMatchObject({ gateways: [expect.stringContaining("152.236.3.22")] });
  });

  it("fails closed: worker failure → reads throw anon_rpc_unavailable, nothing sent directly", async () => {
    const h = fakeHarness({ fail: { code: "bad-config", message: "gateways missing" } });
    const direct = vi.fn((u: string, i?: RequestInit) => bootstrapOk(u, i));
    const anon = createAnonRpc({ workerFactory: h.factory, directFetch: direct });
    const mra = createMRA({ mode: "sepolia", apiUrl: "https://api.test", rpc: anon.rpcConfig() });
    await expect(anon.ready).rejects.toMatchObject({ code: "anon_rpc_unavailable" });
    await expect(mra.raw.chain().blockNumber()).rejects.toMatchObject({ code: "chain_read_failed" });
    expect(anon.status()).toMatchObject({ phase: "failed", error: { code: "bad-config" } });
    expect(anon.stats()).toMatchObject({ routed: 0, direct: 0 });
    expect(anon.stats().refused).toBeGreaterThan(0);
    expect(direct).not.toHaveBeenCalled();
    expect(h.seen).toHaveLength(0);
  });

  it("fails closed on a ready timeout (CSP-blocked sandbox never settles)", async () => {
    const h = fakeHarness({ never: true });
    const anon = createAnonRpc({ workerFactory: h.factory, directFetch: bootstrapOk, readyTimeoutMs: 20 });
    await expect(anon.fetch("https://x.test", { method: "POST", body: "{}" })).rejects.toMatchObject({ code: "anon_rpc_unavailable" });
    expect(anon.status().error?.code).toBe("ready_timeout");
  });

  it("allowDirectFallback sends directly and counts it (share < 1)", async () => {
    const h = fakeHarness({ fail: { code: "unsupported-platform", message: "no WebRTC" } });
    const direct = vi.fn(async (_u: string, init?: RequestInit) => new Response(JSON.stringify(rpcAnswer(String(init?.body)))));
    const anon = createAnonRpc({ workerFactory: h.factory, directFetch: direct, allowDirectFallback: true });
    const mra = createMRA({ mode: "sepolia", apiUrl: "https://api.test", rpc: anon.rpcConfig() });
    await mra.raw.chain().blockNumber();
    expect(anon.stats()).toMatchObject({ routed: 0, direct: 1, routedShare: 0 });
  });

  it("outside a browser, without a factory, it fails closed instead of crashing SSR", async () => {
    const anon = createAnonRpc({ directFetch: bootstrapOk });
    await expect(anon.ready).rejects.toMatchObject({ code: "anon_rpc_unavailable" });
    expect(anon.status().phase).toBe("failed");
  });

  it("rejects a non-http RPC URL and closes cleanly", async () => {
    expect(() => createAnonRpc({ rpc: { url: "ws://x" } })).toThrow(/http/);
    const h = fakeHarness();
    const anon = createAnonRpc({ workerFactory: h.factory, directFetch: bootstrapOk });
    await anon.ready;
    anon.close();
    expect(anon.status().phase).toBe("closed");
    await expect(anon.fetch("https://x.test")).rejects.toMatchObject({ code: "anon_rpc_unavailable" });
  });
});
