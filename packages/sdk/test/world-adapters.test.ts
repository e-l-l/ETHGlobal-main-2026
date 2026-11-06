// Real (non-mock) World / Reclaim adapters against fake issuer + agents API routes (no network).
import { describe, expect, it } from "vitest";
import {
  AgentsApi,
  IssuerApi,
  MRAError,
  agentPassBodyFromRedirect,
  idkitV4,
  issuerReclaim,
  worldDeviceAgentPass,
  type FetchFn,
} from "../src/index.js";

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

const LEAF = `0x${"AB".repeat(32)}` as const;

describe("issuerReclaim (issuer-held Reclaim session)", () => {
  it("starts a session for the leaf, polls with the status token, returns a session ref (never the proof)", async () => {
    let polls = 0;
    const { fn, calls } = fakeFetch((c) => {
      if (c.url.endsWith("/reclaim/session") && c.method === "POST") {
        return { json: { sessionId: "sess1", requestUrl: "https://portal.reclaimprotocol.org/?s=1", statusToken: "tok", expiresAt: 9e9, delivery: "callback" } };
      }
      polls++;
      return { json: { sessionId: "sess1", status: polls < 2 ? "waiting" : "proof_received", expiresAt: 9e9, delivery: "callback" } };
    });
    const r = issuerReclaim(new IssuerApi({ baseUrl: "https://issuer.test", fetch: fn }), { pollMs: 1 });
    const s = await r.start({ band: 2, commitment: LEAF });
    expect(s).toEqual({ requestUrl: "https://portal.reclaimprotocol.org/?s=1", sessionId: "sess1" });
    expect(calls[0]!.body).toEqual({ commitment: LEAF.toLowerCase(), band: 2 });
    const seen: string[] = [];
    const ref = await r.wait("sess1", { onStatus: (x) => seen.push(x) });
    expect(ref).toEqual({ reclaimSession: "sess1", statusToken: "tok" });
    expect(calls[1]!.url).toBe("https://issuer.test/reclaim/session/sess1");
    expect(calls[1]!.headers.authorization).toBe("Bearer tok");
    expect(seen).toEqual(["waiting", "proof_received"]);
  });

  it("a failed session throws its stable reason", async () => {
    const { fn } = fakeFetch((c) =>
      c.method === "POST"
        ? { json: { sessionId: "s", requestUrl: "https://x", statusToken: "t", expiresAt: 9e9, delivery: "poll" } }
        : { json: { sessionId: "s", status: "failed", reason: "cancelled", expiresAt: 9e9, delivery: "poll" } },
    );
    const r = issuerReclaim({ http: new IssuerApi({ baseUrl: "https://i", fetch: fn }).http }, { pollMs: 1, mode: "app" });
    await r.start({ band: 1, commitment: LEAF });
    await expect(r.wait("s")).rejects.toMatchObject({ code: "cancelled" });
    await expect(r.wait("unknown")).rejects.toBeInstanceOf(MRAError);
  });
});

describe("World Agent Pass, real", () => {
  it("redirect helper maps ?error= to a server-side denial", () => {
    expect(agentPassBodyFromRedirect("?error=access_denied&state=x", "v", "https://app/cb")).toEqual({ error: "access_denied" });
    expect(agentPassBodyFromRedirect("error=<script>", "v", "https://app/cb")).toEqual({ error: "access_denied" });
    expect(agentPassBodyFromRedirect(new URLSearchParams({ code: "c1", state: "x" }), "v".repeat(43), "https://app/cb"))
      .toEqual({ code: "c1", code_verifier: "v".repeat(43), redirect_uri: "https://app/cb" });
  });

  it("device flow: starts on the backend, shows the World link, polls until ready, returns the session body", async () => {
    let n = 0;
    const { fn, calls } = fakeFetch((c) => {
      if (c.method === "POST") return { json: { device_session: "ds_0123456789abcdef", verification_uri: "https://auth.world.org/device", verification_uri_complete: "https://auth.world.org/device?user_code=AB", user_code: "AB", expires_in: 600, expires_at: 9e9, interval: 0 } };
      return { json: { status: ++n < 2 ? "pending" : "ready" } };
    });
    const shown: unknown[] = [];
    const ap = worldDeviceAgentPass({ api: new AgentsApi({ baseUrl: "https://api.test", fetch: fn }), show: (p) => shown.push(p), manageToken: () => "mt" });
    const body = await ap.authorize({ agentId: "a".repeat(32), nonce: "n" });
    expect(body).toEqual({ device_session: "ds_0123456789abcdef" });
    expect(shown).toEqual([{ verificationUri: "https://auth.world.org/device", verificationUriComplete: "https://auth.world.org/device?user_code=AB", userCode: "AB", expiresIn: 600, interval: 0, expiresAt: 9e9 }]);
    expect(calls[0]!.url).toBe(`https://api.test/agents/${"a".repeat(32)}/agent-pass/device`);
    expect(calls[1]!.url).toBe(`https://api.test/agents/${"a".repeat(32)}/agent-pass/device/ds_0123456789abcdef`);
    expect(calls.every((c) => c.headers.authorization === "Bearer mt")).toBe(true);
  });

  it("device flow without a manage token is a config error", async () => {
    const ap = worldDeviceAgentPass({ api: new AgentsApi({ baseUrl: "https://api.test", fetch: fakeFetch(() => ({})).fn }), show: () => {} });
    await expect(ap.authorize({ agentId: "a".repeat(32), nonce: "n" })).rejects.toMatchObject({ code: "adapter_not_configured" });
  });
});

describe("idkitV4", () => {
  it("fetches a backend-signed rp_context and runs IDKit with it", async () => {
    const cfg = { app_id: "app_1", action: "credential-recovery-v1", environment: "production",
      rp_context: { rp_id: "rp_1", nonce: "0x00ab", created_at: 1, expires_at: 301, signature: "0x" + "11".repeat(65) } };
    const { fn, calls } = fakeFetch(() => ({ json: cfg }));
    const got: unknown[] = [];
    const adapter = idkitV4({ api: new AgentsApi({ baseUrl: "https://api.test", fetch: fn }), run: async (c) => (got.push(c), { protocol_version: "4.0", nonce: c.rp_context.nonce }) });
    expect(await adapter.verify()).toEqual({ protocol_version: "4.0", nonce: "0x00ab" });
    expect(calls[0]!.url).toBe("https://api.test/recovery/rp-context");
    expect(got).toEqual([cfg]);
  });

  it("refuses a WORLD_MOCK backend", async () => {
    const { fn } = fakeFetch(() => ({ json: { mock: true, action: "credential-recovery-v1" } }));
    const adapter = idkitV4({ api: new AgentsApi({ baseUrl: "https://api.test", fetch: fn }), run: async () => ({}) });
    await expect(adapter.verify()).rejects.toMatchObject({ code: "not_supported" });
  });
});
