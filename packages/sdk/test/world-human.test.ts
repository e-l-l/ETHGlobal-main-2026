// World ID for borrowers: owner auth, IDKit borrower path, verifyHuman / humanStatus, and the human-limit VM fields.
import { describe, expect, it } from "vitest";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  AgentsApi,
  MemoryVault,
  createMRA,
  humanLimitFrom,
  idkitV4,
  loadOrCreateBurner,
  mockIdkit,
  ownerAuthHeader,
  ownerAuthMessage,
  reasonMessage,
  type FetchFn,
  type HumanLimitVM,
} from "../src/index.js";
import { fallbackHumanLimit } from "../src/domains/human.js";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

function fakeFetch(reply: (c: Call) => { status?: number; json?: unknown }) {
  const calls: Call[] = [];
  const fn: FetchFn = async (url, init) => {
    const c: Call = {
      url,
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(c);
    const r = reply(c);
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  };
  return { fn, calls };
}

/** A JSON-RPC node that refuses everything quickly (non-retried error): chain reads fail, local signing still works. */
const deadRpc: FetchFn = async (_url, init) => {
  const req = JSON.parse(String(init?.body));
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: -32602, message: "nope" } }), { headers: { "content-type": "application/json" } });
};

const SHOP = `0x${"Ab".repeat(32)}` as const;
const SHOP_LC = SHOP.toLowerCase();
const HUMAN_KEYS = ["humanVerified", "banned", "limit", "availableNow", "nextUnlockAt", "unlockSteps"].sort();

const UNLOCK = {
  tier: 1,
  limit_usd: 100,
  available_now_usd: 50,
  unlocked_pct: 50,
  good_weeks: 0,
  frozen: false,
  next_unlock_at: 1_900_000_000,
  steps: [
    { pct: 50, amount_usd: 50, unlocked: true },
    { pct: 75, amount_usd: 50, unlocked: false },
    { pct: 100, amount_usd: 100, unlocked: false },
  ],
  reasons: ["first advance at this level: 50% now"],
};

async function realMra(api: FetchFn, session = true, idkit?: ReturnType<typeof mockIdkit>) {
  const vault = new MemoryVault();
  const { wallet } = await loadOrCreateBurner(vault, { chainId: 11155111, rpcUrl: "http://rpc.test" });
  if (session) await vault.put("session", { shopId: SHOP, pseudonym: "shop_abab", payout: wallet.account!.address });
  const mra = createMRA({
    mode: "sepolia",
    apiUrl: "http://api.test",
    rpc: { url: "http://rpc.test", anonRpc: true, anonFetch: deadRpc, multicall: false },
    fetch: api,
    vault,
    wallet,
    faucet: false,
    ...(idkit ? { idkit } : {}),
  });
  return { mra, address: wallet.account!.address };
}

function parseOwner(header: string | undefined) {
  const m = /^Owner (\d+):(0x[0-9a-f]+)$/.exec(header ?? "");
  expect(m, `bad owner header: ${header}`).not.toBeNull();
  return { issuedAt: Number(m![1]), signature: m![2] as `0x${string}` };
}

describe("owner auth", () => {
  it("signs the exact message: lowercase shop id, decimal chain id, unix seconds", async () => {
    expect(ownerAuthMessage(SHOP, 11155111, 1_700_000_000)).toBe(`DripMoney shop owner\nshop: ${SHOP_LC}\nchain: 11155111\nissued: 1700000000`);
    expect(() => ownerAuthMessage("0x1234", 1, 1)).toThrow();

    const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
    const h = await ownerAuthHeader({ signMessage: (message) => account.signMessage({ message }) }, SHOP, 31337, 1_700_000_123);
    const { issuedAt, signature } = parseOwner(h);
    expect(issuedAt).toBe(1_700_000_123);
    expect(await verifyMessage({ address: account.address, message: ownerAuthMessage(SHOP, 31337, issuedAt), signature })).toBe(true);
  });

  it("AgentsApi sends it as a raw Authorization header (not Bearer)", async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { verified: true } }));
    const api = new AgentsApi({ baseUrl: "http://api.test", fetch: fn });
    await api.bindHuman(SHOP, "Owner 1:0xab", { mock: "approve" });
    await api.humanStatus(SHOP, undefined, 2);
    expect(calls[0]).toMatchObject({ url: `http://api.test/shops/${SHOP_LC}/human`, method: "POST", body: { idkit: { mock: "approve" } } });
    expect(calls[0]!.headers.authorization).toBe("Owner 1:0xab");
    expect(calls[1]!.url).toBe(`http://api.test/shops/${SHOP_LC}/human?tier=2`);
    expect(calls[1]!.headers.authorization).toBeUndefined();
    expect(() => api.humanStatus("0xnope" as `0x${string}`)).toThrow(/invalid shop id/);
  });
});

describe("idkitV4 purposes", () => {
  const cfg = { app_id: "app_x", action: "a", environment: "staging", rp_context: { rp_id: "rp", nonce: "n", created_at: 1, expires_at: 2, signature: "0x" } };

  it("borrower → POST /world/borrower/rp-context; default → /recovery/rp-context", async () => {
    const { fn, calls } = fakeFetch(() => ({ json: cfg }));
    const seen: string[] = [];
    const a = idkitV4({ api: new AgentsApi({ baseUrl: "http://api.test", fetch: fn }), run: async (c, purpose) => (seen.push(purpose), { proof: c.action }) });
    expect(await a.verify({ purpose: "borrower" })).toEqual({ proof: "a" });
    await a.verify();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST http://api.test/world/borrower/rp-context", "POST http://api.test/recovery/rp-context"]);
    expect(seen).toEqual(["borrower", "recovery"]);
  });

  it("WORLD_MOCK=1 backend → not_supported", async () => {
    const { fn } = fakeFetch(() => ({ json: { mock: true, action: "borrower" } }));
    const a = idkitV4({ api: new AgentsApi({ baseUrl: "http://api.test", fetch: fn }), run: async () => ({}) });
    await expect(a.verify({ purpose: "borrower" })).rejects.toMatchObject({ code: "not_supported" });
  });
});

describe("onboarding.verifyHuman / humanStatus", () => {
  it("mock: verified, no network; a denied mock proof is a typed failure", async () => {
    const steps: string[] = [];
    expect(await createMRA({ mode: "mock" }).onboarding.verifyHuman({ onStep: (s) => steps.push(s) })).toEqual({ verified: true });
    expect(steps).toEqual(["verifying_human", "verified"]);
    const denied = createMRA({ mode: "mock", idkit: mockIdkit({ outcome: "deny" }) });
    expect(await denied.onboarding.verifyHuman()).toEqual({ verified: false, reason: "verification_failed" });
    const st = await createMRA({ mode: "mock" }).onboarding.humanStatus();
    expect(st).toMatchObject({ humanVerified: true, banned: false, source: "mock", unlock: { limit: 100, availableNow: 50, unlockedPct: 50 } });
  });

  it("real: owner-signed POST /shops/{id}/human with the IDKit payload; never exposes a nullifier", async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { verified: true } }));
    const { mra, address } = await realMra(fn);
    const steps: string[] = [];
    const r = await mra.onboarding.verifyHuman({ onStep: (s) => steps.push(s) });
    expect(r).toEqual({ verified: true });
    expect(JSON.stringify(r)).not.toMatch(/nullifier/i);
    expect(steps).toEqual(["signing_owner", "verifying_human", "verified"]);
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c.method).toBe("POST");
    expect(c.url).toBe(`http://api.test/shops/${SHOP_LC}/human`);
    expect(c.body).toEqual({ idkit: { mock: "approve", mock_human: "demo-merchant" } });
    const { issuedAt, signature } = parseOwner(c.headers.authorization);
    expect(Math.abs(issuedAt - Math.floor(Date.now() / 1000))).toBeLessThan(60);
    expect(await verifyMessage({ address, message: ownerAuthMessage(SHOP, 11155111, issuedAt), signature })).toBe(true);
  });

  it("real: 4xx World errors come back typed; 5xx still throws", async () => {
    let status = 409;
    let detail = "shop_bound_to_other_human";
    const { fn } = fakeFetch(() => ({ status, json: { detail } }));
    const { mra } = await realMra(fn);
    expect(await mra.onboarding.verifyHuman()).toEqual({ verified: false, reason: "shop_bound_to_other_human" });
    status = 400;
    detail = "unknown_or_used_nonce";
    expect(await mra.onboarding.verifyHuman()).toEqual({ verified: false, reason: "unknown_or_used_nonce" });
    status = 500;
    detail = "x";
    await expect(mra.onboarding.verifyHuman()).rejects.toMatchObject({ status: 500 });
  });

  it("real: no shop on the device → session_missing", async () => {
    const { fn } = fakeFetch(() => ({ json: { verified: true } }));
    const { mra } = await realMra(fn, false);
    await expect(mra.onboarding.verifyHuman()).rejects.toMatchObject({ code: "session_missing" });
  });

  it("real humanStatus parses the owner view (tier passed as a query)", async () => {
    const { fn, calls } = fakeFetch(() => ({ json: { verified: true, banned: false, unlock: UNLOCK } }));
    const { mra } = await realMra(fn);
    const st = await mra.onboarding.humanStatus({ tier: 1 });
    expect(calls[0]!.url).toBe(`http://api.test/shops/${SHOP_LC}/human?tier=1`);
    expect(calls[0]!.headers.authorization).toMatch(/^Owner \d+:0x/);
    expect(st).toEqual({
      humanVerified: true,
      banned: false,
      source: "api",
      unlock: {
        tier: 1, limit: 100, availableNow: 50, unlockedPct: 50, goodWeeks: 0, frozen: false, nextUnlockAt: 1_900_000_000,
        steps: [{ pct: 50, amount: 50, unlocked: true }, { pct: 75, amount: 50, unlocked: false }, { pct: 100, amount: 100, unlocked: false }],
        reasons: ["first advance at this level: 50% now"],
      },
    });
    // The owner auth is reused for a few minutes: a second read doesn't re-sign.
    await mra.onboarding.humanStatus({ tier: 1 });
    expect(calls[1]!.headers.authorization).toBe(calls[0]!.headers.authorization);
  });

  it("humanLimitFrom: banned / unverified / public-only responses", () => {
    expect(humanLimitFrom({ verified: true, banned: true, unlock: null }, 100)).toEqual({ humanVerified: true, banned: true, limit: 100, availableNow: 0, nextUnlockAt: null, unlockSteps: [] });
    expect(humanLimitFrom({ verified: false }, 50)).toEqual({ humanVerified: false, banned: false, limit: 50, availableNow: 50, nextUnlockAt: null, unlockSteps: [] });
    expect(humanLimitFrom({ verified: true, banned: false, unlock: UNLOCK })).toMatchObject({ limit: 100, availableNow: 50, nextUnlockAt: 1_900_000_000 });
  });
});

describe("human-limit fields on merchant / agent views", () => {
  const keysOf = (v: HumanLimitVM) => HUMAN_KEYS.filter((k) => k in v).sort();

  it("mock home / advance / approveView carry the World + unlock fields", async () => {
    const mra = createMRA({ mode: "mock" });
    const now = Math.floor(Date.now() / 1000);
    for (const v of [await mra.merchant.home(), await mra.merchant.advance(), await mra.agent.approveView(), await mra.agent.approveView({ perAdvance: 100, perMonth: 200 })]) {
      expect(v).toMatchObject({
        humanVerified: true,
        banned: false,
        limit: 100,
        availableNow: 50,
        unlockSteps: [{ pct: 50, amount: 50, unlocked: true }, { pct: 75, amount: 50, unlocked: false }, { pct: 100, amount: 100, unlocked: false }],
      });
      expect(v.nextUnlockAt! - now).toBeGreaterThan(7 * 86_400 - 60);
      expect(v.nextUnlockAt! - now).toBeLessThanOrEqual(7 * 86_400 + 5);
      expect(keysOf(v)).toEqual(HUMAN_KEYS);
    }
  });

  it("real fallback has the same keys as mock (parity)", () => {
    expect(Object.keys(fallbackHumanLimit(50)).sort()).toEqual(HUMAN_KEYS);
  });

  it("real approveView: fills from GET /shops/{id}/human; falls back safely when it fails", async () => {
    const ok = fakeFetch(() => ({ json: { verified: true, banned: false, unlock: UNLOCK } }));
    const a = await (await realMra(ok.fn)).mra.agent.approveView({ perAdvance: 100, perMonth: 200 });
    expect(a).toMatchObject({ humanVerified: true, banned: false, limit: 100, availableNow: 50, nextUnlockAt: 1_900_000_000 });
    expect(ok.calls[0]!.url).toBe(`http://api.test/shops/${SHOP_LC}/human?tier=0`);

    const down = fakeFetch(() => ({ status: 503, json: { detail: "upstream_failed" } }));
    const b = await (await realMra(down.fn)).mra.agent.approveView({ perAdvance: 100, perMonth: 200 });
    // Chain reads fail too here, so the tier cap is unknown: 0.
    expect(b).toMatchObject({ humanVerified: false, banned: false, limit: 0, availableNow: 0, nextUnlockAt: null, unlockSteps: [] });
  });
});

describe("reason messages", () => {
  it("new World ID codes have plain merchant-facing English", () => {
    // Also the World ID stop-screen copy.
    expect(reasonMessage("human_banned")).toBe("This World ID can't borrow on DripMoney after a default.");
    expect(reasonMessage("human_has_open_advance")).toBe("Repay your open advance first.");
    expect(reasonMessage("human_not_verified")).toBe("Verify you're a unique human with World ID first.");
    expect(reasonMessage("few_payers")).toMatch(/fewer than 5 different customers/);
    expect(reasonMessage("some_new_code")).toBe("some new code");
  });
});

describe("World ID FIRST: checkHuman → ticket → createShop / bindHumanTicket", () => {
  it("mock: eligible stores a ticket and createShop binds it, then clears it", async () => {
    const mra = createMRA({ mode: "mock" });
    const steps: string[] = [];
    const r = await mra.onboarding.checkHuman({ onStep: (s) => steps.push(s) });
    expect(r).toMatchObject({ eligible: true, source: "mock" });
    expect(steps).toEqual(["verifying_human", "checking", "eligible"]);
    expect(await mra.raw.vault.get("world_ticket")).toMatchObject({ kind: "world_ticket" });
    const shop = await mra.onboarding.createShop("Corner Kiosk");
    expect(shop.human).toEqual({ verified: true });
    expect(await mra.raw.vault.get("world_ticket")).toBeUndefined();
    // No ticket left: the next bind asks for World ID again.
    expect(await mra.onboarding.bindHumanTicket()).toEqual({ verified: false, needsWorldId: true, reason: "no_ticket" });
  });

  it("mock: mockWorld=banned / open_advance → stop screen copy, no ticket", async () => {
    const banned = createMRA({ mode: "mock", mockWorld: "banned" });
    expect(await banned.onboarding.checkHuman()).toEqual({
      eligible: false, reason: "human_banned", message: "This World ID can't borrow on DripMoney after a default.", source: "mock",
    });
    expect(await banned.raw.vault.get("world_ticket")).toBeUndefined();
    const open = createMRA({ mode: "mock", mockWorld: "open_advance" });
    expect(await open.onboarding.checkHuman()).toMatchObject({ eligible: false, reason: "human_has_open_advance", message: "Repay your open advance first." });
  });

  it("mockWorldMode reads ?mockWorld= from the URL when not configured", async () => {
    const { mockWorldMode } = await import("../src/index.js");
    const g = globalThis as { location?: unknown };
    const saved = g.location;
    try {
      g.location = { search: "?mockWorld=banned" };
      expect(mockWorldMode()).toBe("banned");
      g.location = { search: "?mockWorld=open-advance" };
      expect(mockWorldMode()).toBe("open_advance");
      expect(mockWorldMode("eligible")).toBe("eligible");
      g.location = { search: "" };
      expect(mockWorldMode()).toBe("eligible");
    } finally {
      g.location = saved;
    }
  });

  it("real: POST /world/borrower/check with the burner, ticket saved, then bound with owner auth (no second scan)", async () => {
    let idkitCalls = 0;
    const { fn, calls } = fakeFetch((c) =>
      c.url.endsWith("/world/borrower/check") ? { json: { eligible: true, ticket: "v1:sealed", expires_at: Math.floor(Date.now() / 1000) + 1800 } } : { json: { verified: true } },
    );
    const counting = { kind: "mock" as const, verify: async () => (idkitCalls++, { mock: "approve", mock_human: "alice" }) };
    const { mra: mra2, address } = await realMra(fn, true, counting);
    const r = await mra2.onboarding.checkHuman();
    expect(r).toMatchObject({ eligible: true, source: "api" });
    expect(calls[0]).toMatchObject({ method: "POST", url: "http://api.test/world/borrower/check", body: { idkit: { mock: "approve", mock_human: "alice" }, owner: address } });
    expect(await mra2.raw.vault.get("world_ticket")).toMatchObject({ ticket: "v1:sealed", owner: address.toLowerCase() });
    expect(await mra2.onboarding.bindHumanTicket()).toEqual({ verified: true });
    expect(calls[1]).toMatchObject({ method: "POST", url: `http://api.test/shops/${SHOP_LC}/human`, body: { ticket: "v1:sealed" } });
    expect(calls[1]!.headers.authorization).toMatch(/^Owner \d+:0x[0-9a-f]{130}$/);
    expect(idkitCalls).toBe(1);
    expect(await mra2.raw.vault.get("world_ticket")).toBeUndefined();
  });

  it("real: banned → stop screen; expired / used tickets → needsWorldId; transient errors keep the ticket", async () => {
    const banned = fakeFetch(() => ({ json: { eligible: false, reason: "human_banned" } }));
    const a = await realMra(banned.fn);
    expect(await a.mra.onboarding.checkHuman()).toEqual({ eligible: false, reason: "human_banned", message: "This World ID can't borrow on DripMoney after a default.", source: "api" });
    expect(await a.mra.raw.vault.get("world_ticket")).toBeUndefined();

    const now = Math.floor(Date.now() / 1000);
    const used = fakeFetch(() => ({ status: 409, json: { detail: "ticket_used" } }));
    const b = await realMra(used.fn);
    await b.mra.raw.vault.put("world_ticket", { kind: "world_ticket", ticket: "v1:x", owner: b.address.toLowerCase(), expiresAt: now - 1, chainId: 11155111 });
    expect(await b.mra.onboarding.bindHumanTicket()).toEqual({ verified: false, needsWorldId: true, reason: "ticket_expired" });
    expect(used.calls).toHaveLength(0);
    await b.mra.raw.vault.put("world_ticket", { kind: "world_ticket", ticket: "v1:x", owner: b.address.toLowerCase(), expiresAt: now + 1800, chainId: 11155111 });
    expect(await b.mra.onboarding.bindHumanTicket()).toEqual({ verified: false, needsWorldId: true, reason: "ticket_used" });
    expect(await b.mra.raw.vault.get("world_ticket")).toBeUndefined();

    const busy = fakeFetch(() => ({ status: 429, json: { detail: "rate_limited" } }));
    const c = await realMra(busy.fn);
    await c.mra.raw.vault.put("world_ticket", { kind: "world_ticket", ticket: "v1:x", owner: c.address.toLowerCase(), expiresAt: now + 1800, chainId: 11155111 });
    expect(await c.mra.onboarding.bindHumanTicket()).toMatchObject({ verified: false, needsWorldId: false });
    expect(await c.mra.raw.vault.get("world_ticket")).toBeDefined();

    // A ticket for another wallet never reaches the API.
    const other = fakeFetch(() => ({ json: { verified: true } }));
    const d = await realMra(other.fn);
    await d.mra.raw.vault.put("world_ticket", { kind: "world_ticket", ticket: "v1:x", owner: "0x" + "99".repeat(20), expiresAt: now + 1800, chainId: 11155111 });
    expect(await d.mra.onboarding.bindHumanTicket()).toEqual({ verified: false, needsWorldId: true, reason: "ticket_owner_mismatch" });
    expect(other.calls).toHaveLength(0);
  });
});
