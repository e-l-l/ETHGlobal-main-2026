import { describe, expect, it } from "vitest";
import { AgentsApi, ApiError, IssuerApi, NetworkError, createMRA, failReasonFor, toJson, type FetchFn } from "../src/index.js";

type Call = { url: string; method: string; headers: Record<string, string>; body: string | undefined };

/** A fake fetch that records requests and replies from a route table. */
function fakeFetch(reply: (c: Call) => { status?: number; json?: unknown } | Promise<never>) {
  const calls: Call[] = [];
  const fn: FetchFn = async (url, init) => {
    const c: Call = { url, method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined };
    calls.push(c);
    const r = await reply(c);
    const status = r.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(r.json ?? {}), { status, headers: { "content-type": "application/json" } });
  };
  return { fn, calls };
}

const SHOP = `0x${"11".repeat(32)}` as const;
const ADDR = `0x${"22".repeat(20)}` as const;
const AGENT = "a".repeat(32);

describe("AgentsApi builds the FastAPI requests", () => {
  it("POST /offers with exact JSON integers (field elements > 2^53)", async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { decision_id: "d1", result: "offered" } }));
    const api = new AgentsApi({ baseUrl: "http://api.test/", fetch: fn });
    const nullifier = 2n ** 250n + 7n;
    await api.requestOffer({ shop_id: SHOP, tier: 0, recipient: ADDR, pass_nullifier: nullifier, min_revenue_band: 2 });
    expect(calls[0]!.url).toBe("http://api.test/offers");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers["content-type"]).toBe("application/json");
    expect(calls[0]!.body).toBe(`{"shop_id":"${SHOP}","tier":0,"recipient":"${ADDR}","pass_nullifier":${nullifier.toString()},"min_revenue_band":2}`);
  });

  it("agent routes send the manage token as a Bearer header only", async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { triggered: true, tick: null } }));
    const api = new AgentsApi({ baseUrl: "http://api.test", fetch: fn });
    await api.triggerAgent(AGENT, "secret-token", true);
    expect(calls[0]!.url).toBe(`http://api.test/agents/${AGENT}/trigger`);
    expect(calls[0]!.headers.authorization).toBe("Bearer secret-token");
    expect(calls[0]!.body).toBe('{"run_now":true}');
    expect(calls[0]!.url).not.toContain("secret-token");
  });

  it("covers every route path and method", async () => {
    const { fn, calls } = fakeFetch((c) => (c.method === "PUT" ? { status: 204 } : { json: {} }));
    const api = new AgentsApi({ baseUrl: "http://api.test", fetch: fn });
    await api.health();
    await api.decision("abc");
    await api.insights(SHOP);
    await api.riskStatus();
    await api.relayClaim(5n);
    await api.createAgent({ shop_id: SHOP, tier: 0, recipient: ADDR, limits: { max_per_draw: 100_000_000, max_per_period: 200_000_000, period: 2_592_000, expiry: 1_900_000_000 } });
    await api.agentPass(AGENT, "t", { mock: "approve" });
    await api.activateAgent(AGENT, "t", { mandate_id: "3" });
    await api.getAgent(AGENT, "t");
    await api.revokeAgent(AGENT, "t");
    await api.recoveryVerify({ mock: "approve", mock_human: "x" });
    await api.putBackup("rt", "QUJD");
    await api.getBackup("rt");
    expect(calls.map((c) => `${c.method} ${c.url.replace("http://api.test", "")}`)).toEqual([
      "GET /health",
      "GET /decisions/abc",
      `GET /shops/${SHOP}/insights`,
      "GET /risk/status",
      "POST /relay/claim/5",
      "POST /agents",
      `POST /agents/${AGENT}/agent-pass`,
      `POST /agents/${AGENT}/activate`,
      `GET /agents/${AGENT}`,
      `POST /agents/${AGENT}/revoke`,
      "POST /recovery/verify",
      "PUT /recovery/backup",
      "GET /recovery/backup",
    ]);
    expect(calls[10]!.body).toBe('{"idkit":{"mock":"approve","mock_human":"x"}}');
    expect(calls[11]!.body).toBe('{"ciphertext":"QUJD"}');
  });

  it("rejects malformed agent ids before any request", async () => {
    const { fn, calls } = fakeFetch(() => ({ json: {} }));
    const api = new AgentsApi({ baseUrl: "http://api.test", fetch: fn });
    expect(() => api.getAgent("../../admin", "t")).toThrow(TypeError);
    expect(calls).toHaveLength(0);
  });
});

describe("errors are typed and secret-free", () => {
  it("maps {detail: code} to ApiError.code", async () => {
    const { fn } = fakeFetch(() => ({ status: 429, json: { detail: "rate_limited" } }));
    const err = await new AgentsApi({ baseUrl: "http://api.test", fetch: fn }).health().catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("rate_limited");
    expect(err.status).toBe(429);
  });

  it("normalises api.py prose details", async () => {
    const { fn } = fakeFetch(() => ({ status: 502, json: { detail: "Upstream service failed" } }));
    const err = await new AgentsApi({ baseUrl: "http://api.test", fetch: fn }).requestOffer({ shop_id: SHOP, tier: 1, recipient: ADDR }).catch((e) => e);
    expect(err.code).toBe("upstream_failed");
  });

  it("issuer {error} codes map to M05 reasons", async () => {
    const { fn } = fakeFetch(() => ({ status: 422, json: { error: "predicate_failed:age_ok" } }));
    const err = await new IssuerApi({ baseUrl: "http://issuer.test", fetch: fn }).issue({ proof: {}, commitment: SHOP, band: 2 }).catch((e) => e);
    expect(err.code).toBe("predicate_failed:age_ok");
    expect(failReasonFor(err.code)).toBe("too-new");
    expect(failReasonFor("predicate_failed:active")).toBe("suspended");
    expect(failReasonFor("predicate_failed:band_ge_2")).toBe("revenue-low");
    expect(failReasonFor("proof_too_old")).toBe("error");
  });

  it("network failures surface as NetworkError codes, without the token or body", async () => {
    const fn: FetchFn = async () => {
      throw new TypeError("fetch failed");
    };
    const err = await new AgentsApi({ baseUrl: "http://api.test", fetch: fn }).getAgent(AGENT, "super-secret").catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.code).toBe("network_unreachable");
    expect(String(err.message)).not.toContain("super-secret");
  });

  it("times out with code timeout", async () => {
    const fn: FetchFn = (_u, init) => new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))));
    const err = await new AgentsApi({ baseUrl: "http://api.test", fetch: fn, timeoutMs: 20 }).health().catch((e) => e);
    expect(err.code).toBe("timeout");
  });

  it("toJson writes bigints as exact integers", () => {
    expect(toJson({ a: 1n, b: [2n ** 200n], c: "x" })).toBe(`{"a":1,"b":[${(2n ** 200n).toString()}],"c":"x"}`);
  });
});

describe("real-mode domains over the API (fetch mocked, no chain)", () => {
  it("agent.status and agent.log map GET /agents/{id} into view-models", async () => {
    const agent = {
      id: AGENT,
      shop_id: SHOP,
      agent_address: ADDR,
      limits: { max_per_draw: 100_000_000, max_per_period: 200_000_000, period: 2_592_000, expiry: 1_900_000_000 },
      limits_hash: SHOP,
      tier: 0,
      status: "active",
      mandate_id: "7",
      mandate_verified: true,
      trigger_pending: false,
      created_at: 1_760_000_000,
      updated_at: 1_760_000_000,
      draws: [{ ts: 1_760_100_000, amount: 100_000_000, offer_id: SHOP, tx_hash: SHOP, decision_id: null }],
      log: [
        { ts: 1_760_100_000, action: "draw", code: "drew", summary: "Drew $100 for stock. Inside your limits.", details: {} },
        { ts: 1_760_050_000, action: "skip", code: "sales_too_low", summary: "Skipped a draw; sales were low.", details: {} },
      ],
    };
    const { fn, calls } = fakeFetch(() => ({ json: agent }));
    const mra = createMRA({ mode: "local", fetch: fn });
    await mra.raw.vault.put("session", { shopId: SHOP, agentId: AGENT, manageToken: "tok", purpose: "stock" });
    const st = await mra.agent.status();
    expect(st).toMatchObject({ status: "active", active: true, agentLimits: { perAdvance: 100, perMonth: 200, purpose: "stock" }, mandateId: "7", source: "api" });
    const log = await mra.agent.log();
    expect(log.stats).toMatchObject({ draws: 1, skipped: 1, skippedReason: "sales too low" });
    expect(log.activity[0]).toMatchObject({ kind: "accent", title: "Drew $100 for stock" });
    expect(calls[0]!.url).toBe(`http://localhost:8000/agents/${AGENT}`);
    expect(calls[0]!.headers.authorization).toBe("Bearer tok");
  });

  it("sepolia without apiUrl fails with config_invalid, mock mode refuses raw API use", async () => {
    const sep = createMRA({ mode: "sepolia" });
    await sep.raw.vault.put("session", { agentId: AGENT, manageToken: "t" });
    await expect(sep.agent.status()).rejects.toMatchObject({ code: "config_invalid" });
    expect(() => createMRA({ mode: "mock" }).raw.api()).toThrow(/not available in mock mode/);
  });
});
