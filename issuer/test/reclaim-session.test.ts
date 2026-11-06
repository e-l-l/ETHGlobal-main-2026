// Real Reclaim path, fully offline: the Reclaim backend (init / status URL) is a fake, and the SDK's verifyProof is
// mocked to behave like the real one on a VALID proof (trusted data = context minus extractedParameters).
// The proofs are recorded-shape fixtures (test/fixtures/reclaim-proof.*.json); swap in a captured real proof per
// RECLAIM_PROVIDER.md and these tests keep working (set FIXTURE_* below to its commitment/time).
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const verifyProof = vi.hoisted(() => vi.fn());
vi.mock("@reclaimprotocol/js-sdk", () => ({ verifyProof }));

import { businessNullifier, toHex32 } from "../src/nullifier.js";
import { parseCallbackBody, type ReclaimBackend, type ReclaimRequestLike } from "../src/sessions.js";
import { commitmentOf, makeApp as baseMakeApp, NOW_MS, TEST_REGISTRY } from "./helpers.js";

const C1 = commitmentOf(0x1234n);
const C2 = commitmentOf(0x5678n);
const NOW_S = Math.floor(NOW_MS / 1000);
const ACC = "acc_18bf65eab2bc1711af938e15a335f20c";
const APP_SECRET = "0x" + "5e".repeat(32);
const SID = "a1b2c3d4e5"; // the fixture's reclaimSessionId

function fixture(kind: "literal" | "template", commitment = C1, ts = NOW_S) {
  const raw = readFileSync(new URL(`./fixtures/reclaim-proof.${kind}.json`, import.meta.url), "utf8")
    .replaceAll("__COMMITMENT__", commitment)
    .replace('"__TIMESTAMP__"', String(ts));
  const { _comment, ...proof } = JSON.parse(raw);
  return proof;
}

/** Mirrors js-sdk verifyProof's success shape for a valid proof. */
function sdkAccepts() {
  verifyProof.mockImplementation(async (p: { claimData: { context: string } }) => {
    const { extractedParameters, ...context } = JSON.parse(p.claimData.context);
    return { isVerified: true, data: [{ context, extractedParameters }], publicData: [] };
  });
}

class FakeBackend implements ReclaimBackend {
  inits: unknown[][] = [];
  last?: Record<string, unknown>;
  status: { statusV2?: string; proofs?: unknown[] } | undefined = { statusV2: "SESSION_STARTED" };
  fail = false;
  async createRequest(appId: string, appSecret: string, providerId: string, opts: { providerVersion?: string }): Promise<ReclaimRequestLike> {
    this.inits.push([appId, appSecret, providerId, opts]);
    if (this.fail) throw new Error(`init failed for secret ${appSecret}`);
    const rec: Record<string, unknown> = {};
    this.last = rec;
    return {
      setContext: (a, m) => void (rec.context = [a, m]),
      setAppCallbackUrl: (u, j) => void (rec.callback = [u, j]),
      setCancelCallbackUrl: (u) => void (rec.cancel = u),
      getRequestUrl: async (o) => ((rec.mode = o?.verificationMode), `https://portal.reclaimprotocol.org/?session=${SID}`),
      getSessionId: () => SID,
      getProviderVersion: () => ({ providerId, providerVersion: "1.2.3" }),
    };
  }
  async fetchStatus() {
    return this.status;
  }
}

const REAL = { ISSUER_MOCK: "0", RECLAIM_APP_ID: "0x" + "ab".repeat(20), RECLAIM_APP_SECRET: APP_SECRET, RECLAIM_PROVIDER_ID: "prov-default", RECLAIM_PROVIDER_ID_BAND2: "prov-b2" };

async function makeApp(env: Record<string, string> = {}, backend = new FakeBackend()) {
  const built = await baseMakeApp({ env: { ...REAL, ISSUER_PUBLIC_URL: "https://issuer.example-host.xyz", ...env }, reclaimBackend: backend });
  return { ...built, backend };
}

async function start(app: Awaited<ReturnType<typeof makeApp>>["app"], body: object = { commitment: C1, band: 2 }) {
  const r = await app.inject({ method: "POST", url: "/reclaim/session", payload: body });
  return { res: r, body: r.json() };
}

const statusOf = (app: Awaited<ReturnType<typeof makeApp>>["app"], token: string, id = SID) =>
  app.inject({ url: `/reclaim/session/${id}`, headers: { authorization: `Bearer ${token}` } });

function callbackPath(backend: FakeBackend) {
  const [url] = backend.last!.callback as [string, boolean];
  return new URL(url).pathname;
}

afterEach(() => verifyProof.mockReset());

describe("POST /reclaim/session (server-side init with the app secret)", () => {
  it("inits the band's provider, binds the context to the leaf, routes the proof to the issuer", async () => {
    const { app, backend } = await makeApp();
    const { res, body } = await start(app);
    expect(res.statusCode).toBe(200);
    expect(backend.inits).toEqual([[REAL.RECLAIM_APP_ID, APP_SECRET, "prov-b2", { providerVersion: undefined }]]);
    expect(backend.last!.context).toEqual([TEST_REGISTRY.toLowerCase(), C1]);
    const [cb, json] = backend.last!.callback as [string, boolean];
    expect(json).toBe(true);
    expect(cb).toMatch(new RegExp(`^https://issuer\\.example-host\\.xyz/reclaim/callback/${SID}/[0-9a-f]{48}$`));
    expect(backend.last!.cancel).toMatch(new RegExp(`/reclaim/cancel/${SID}/[0-9a-f]{48}$`));
    expect(backend.last!.mode).toBe("portal");
    expect(Object.keys(body).sort()).toEqual(["delivery", "expiresAt", "requestUrl", "sessionId", "statusToken"]);
    expect(body).toMatchObject({ sessionId: SID, delivery: "callback", requestUrl: expect.stringMatching(/^https:\/\//), expiresAt: NOW_S + 900 });
    expect(res.body).not.toContain(APP_SECRET);
    expect(res.body).not.toContain(cb.split("/").pop()!); // the callback secret is never returned to the app
  });

  it("validates input, and never echoes SDK errors", async () => {
    const backend = new FakeBackend();
    backend.fail = true;
    const { app, lines } = await makeApp({}, backend);
    expect((await start(app, { commitment: C1, band: 7 })).res.statusCode).toBe(400);
    expect((await start(app, { commitment: "0x0", band: 2 })).res.statusCode).toBe(400);
    expect((await start(app, { commitment: C1, band: 2, mode: "x" })).res.statusCode).toBe(400);
    const { res } = await start(app);
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: "reclaim_upstream" });
    expect(lines.join("") + res.body).not.toContain(APP_SECRET);
  });

  it("503 without app credentials; absent in mock mode", async () => {
    const { app } = await makeApp({ RECLAIM_APP_SECRET: "" });
    expect((await start(app)).body).toEqual({ error: "reclaim_not_configured" });
    const mock = await baseMakeApp();
    expect((await mock.app.inject({ method: "POST", url: "/reclaim/session", payload: { commitment: C1, band: 2 } })).statusCode).toBe(404);
  });
});

describe("callback delivery -> /issue with a session reference", () => {
  it("issues from the held proof; the proof never goes back to the app; single use", async () => {
    sdkAccepts();
    const { app, backend, cfg, lines } = await makeApp();
    const { body: s } = await start(app);
    expect((await statusOf(app, s.statusToken)).json()).toMatchObject({ status: "waiting" });

    const cb = await app.inject({ method: "POST", url: callbackPath(backend), payload: fixture("literal") });
    expect(cb.statusCode).toBe(200);
    const st = await statusOf(app, s.statusToken);
    expect(st.json()).toEqual({ sessionId: SID, status: "proof_received", expiresAt: NOW_S + 900, delivery: "callback" });

    const ref = { reclaimSession: SID, statusToken: s.statusToken };
    const res = await app.inject({ method: "POST", url: "/issue", payload: { proof: ref, commitment: C1, band: 2 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().businessNullifier).toBe(toHex32(businessNullifier(cfg.pepper, ACC)));
    // Verified against the session's exact provider version.
    expect(verifyProof.mock.calls[0][1]).toEqual({ providerId: "prov-b2", providerVersion: "1.2.3" });
    expect((await statusOf(app, s.statusToken)).json().status).toBe("issued");
    const again = await app.inject({ method: "POST", url: "/issue", payload: { proof: ref, commitment: C1, band: 2 } });
    expect(again.statusCode).toBe(409);

    const all = lines.join("\n") + st.body + res.body + again.body + cb.body;
    expect(all).not.toContain("acc_");
    expect(all).not.toContain("extractedParameters");
  });

  it("accepts Reclaim's default urlencoded body and an array of one proof", async () => {
    sdkAccepts();
    const { app, backend } = await makeApp();
    const { body: s } = await start(app);
    const enc = encodeURIComponent(JSON.stringify([fixture("literal")]));
    const cb = await app.inject({ method: "POST", url: callbackPath(backend), payload: enc, headers: { "content-type": "application/x-www-form-urlencoded" } });
    expect(cb.statusCode).toBe(200);
    expect((await statusOf(app, s.statusToken)).json().status).toBe("proof_received");
  });

  it("parseCallbackBody handles json, urlencoded, and `<json>=` form encodings", () => {
    const p = { a: 1 };
    expect(parseCallbackBody(p)).toBe(p);
    expect(parseCallbackBody(JSON.stringify(p))).toEqual(p);
    expect(parseCallbackBody(encodeURIComponent(JSON.stringify(p)))).toEqual(p);
    expect(parseCallbackBody(encodeURIComponent(JSON.stringify(p)) + "=")).toEqual(p);
    expect(() => parseCallbackBody("nope")).toThrow("bad_proof");
  });

  it("rejects a wrong callback secret, a wrong status token, and unknown sessions", async () => {
    const { app, backend } = await makeApp();
    const { body: s } = await start(app);
    const bad = callbackPath(backend).replace(/[0-9a-f]{48}$/, "0".repeat(48));
    expect((await app.inject({ method: "POST", url: bad, payload: fixture("literal") })).statusCode).toBe(401);
    expect((await statusOf(app, "wrong")).statusCode).toBe(401);
    expect((await statusOf(app, s.statusToken, "nosuchsession")).statusCode).toBe(404);
    expect((await app.inject({ url: `/reclaim/session/${SID}` })).statusCode).toBe(401);
  });

  it("a proof bound to another leaf fails the session (anti-theft)", async () => {
    const { app, backend } = await makeApp();
    const { body: s } = await start(app);
    const cb = await app.inject({ method: "POST", url: callbackPath(backend), payload: fixture("literal", C2) });
    expect(cb.statusCode).toBe(422);
    expect((await statusOf(app, s.statusToken)).json()).toMatchObject({ status: "failed", reason: "context_mismatch" });
    const res = await app.inject({ method: "POST", url: "/issue", payload: { proof: { reclaimSession: SID, statusToken: s.statusToken }, commitment: C1, band: 2 } });
    expect(res.json()).toEqual({ error: "context_mismatch" });
  });

  it("the session ref only issues for its own commitment and band", async () => {
    sdkAccepts();
    const { app, backend } = await makeApp();
    const { body: s } = await start(app);
    await app.inject({ method: "POST", url: callbackPath(backend), payload: fixture("literal") });
    const ref = { reclaimSession: SID, statusToken: s.statusToken };
    expect((await app.inject({ method: "POST", url: "/issue", payload: { proof: ref, commitment: C2, band: 2 } })).json()).toEqual({ error: "context_mismatch" });
    expect((await app.inject({ method: "POST", url: "/issue", payload: { proof: ref, commitment: C1, band: 1 } })).json()).toEqual({ error: "bad_band" });
    expect((await app.inject({ method: "POST", url: "/issue", payload: { proof: { ...ref, statusToken: "x" }, commitment: C1, band: 2 } })).statusCode).toBe(401);
  });

  it("/issue before the proof arrives is 409 proof_pending; cancel marks the session failed", async () => {
    const { app, backend } = await makeApp();
    const { body: s } = await start(app);
    const ref = { reclaimSession: SID, statusToken: s.statusToken };
    expect((await app.inject({ method: "POST", url: "/issue", payload: { proof: ref, commitment: C1, band: 2 } })).json()).toEqual({ error: "proof_pending" });
    const cancel = callbackPath(backend).replace("/callback/", "/cancel/");
    expect((await app.inject({ method: "POST", url: cancel, payload: { error: "user cancelled" } })).statusCode).toBe(200);
    expect((await statusOf(app, s.statusToken)).json()).toMatchObject({ status: "failed", reason: "cancelled" });
  });
});

describe("poll delivery (no ISSUER_PUBLIC_URL): the issuer reads Reclaim's status URL itself", () => {
  it("picks up the proof from the status URL", async () => {
    sdkAccepts();
    const backend = new FakeBackend();
    const { app } = await makeApp({ ISSUER_PUBLIC_URL: "" }, backend);
    const { body: s } = await start(app);
    expect(s.delivery).toBe("poll");
    expect(backend.last!.callback).toBeUndefined(); // default Reclaim callback
    expect((await statusOf(app, s.statusToken)).json().status).toBe("waiting");
    backend.status = { statusV2: "PROOF_SUBMITTED", proofs: [fixture("literal")] };
    // throttled: the poll within 2 s of the last one does not hit Reclaim (fixed test clock), so build a new app
    const b2 = new FakeBackend();
    b2.status = { statusV2: "PROOF_SUBMITTED", proofs: [fixture("literal")] };
    const { app: app2 } = await makeApp({ ISSUER_PUBLIC_URL: "" }, b2);
    const { body: s2 } = await start(app2);
    expect((await statusOf(app2, s2.statusToken)).json().status).toBe("proof_received");
    const res = await app2.inject({ method: "POST", url: "/issue", payload: { proof: { reclaimSession: SID, statusToken: s2.statusToken }, commitment: C1, band: 2 } });
    expect(res.statusCode).toBe(200);
  });

  it("a failed Reclaim session becomes failed", async () => {
    const backend = new FakeBackend();
    backend.status = { statusV2: "PROOF_GENERATION_FAILED" };
    const { app } = await makeApp({ ISSUER_PUBLIC_URL: "" }, backend);
    const { body: s } = await start(app);
    expect((await statusOf(app, s.statusToken)).json()).toMatchObject({ status: "failed", reason: "proof_generation_failed" });
  });
});

describe("provider-builder template style ({{param}} matches)", () => {
  it("issues when the verified extracted values satisfy the predicates", async () => {
    sdkAccepts();
    const { app, backend, cfg } = await makeApp();
    const { body: s } = await start(app);
    expect((await app.inject({ method: "POST", url: callbackPath(backend), payload: fixture("template") })).statusCode).toBe(200);
    const res = await app.inject({ method: "POST", url: "/issue", payload: { proof: { reclaimSession: SID, statusToken: s.statusToken }, commitment: C1, band: 2 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().businessNullifier).toBe(toHex32(businessNullifier(cfg.pepper, ACC)));
  });

  it.each([
    ["status", "suspended", "predicate_failed:active"],
    ["age_ok", "false", "predicate_failed:age_ok"],
    ["band_ge_2", "false", "predicate_failed:band_ge_2"],
    ["country", "US", "predicate_failed:country"],
  ])("rejects extracted %s=%s", async (k, v, code) => {
    verifyProof.mockImplementation(async (p: { claimData: { context: string } }) => {
      const { extractedParameters, ...context } = JSON.parse(p.claimData.context);
      return { isVerified: true, data: [{ context, extractedParameters: { ...extractedParameters, [k]: v } }] };
    });
    const { app } = await makeApp();
    const res = await app.inject({ method: "POST", url: "/issue", payload: { proof: fixture("template"), commitment: C1, band: 2 } });
    expect(res.json()).toEqual({ error: code });
  });

  it("a raw proof (no session) still works in real mode, with the env pin", async () => {
    sdkAccepts();
    const { app } = await makeApp({ RECLAIM_EXPECTED_URL: "https://portal.example-host.xyz/api/me/summary" });
    const res = await app.inject({ method: "POST", url: "/issue", payload: { proof: fixture("literal"), commitment: C1, band: 2 } });
    expect(res.statusCode).toBe(200);
    expect(verifyProof.mock.calls[0][1]).toEqual({ providerId: "prov-b2" });
    const { app: pinned } = await makeApp({ RECLAIM_EXPECTED_URL: "https://elsewhere.example/api/me/summary" });
    expect((await pinned.inject({ method: "POST", url: "/issue", payload: { proof: fixture("literal"), commitment: C1, band: 2 } })).json()).toEqual({ error: "wrong_provider_url" });
  });
});

describe("config", () => {
  it("CORS_ALLOW_ORIGINS (shared name) and CORS_ORIGINS both feed the allow-list; '*' is ignored", async () => {
    const { app } = await makeApp({ CORS_ALLOW_ORIGINS: "https://app.example-host.xyz,*", CORS_ORIGINS: "https://portal.example-host.xyz" });
    for (const o of ["https://app.example-host.xyz", "https://portal.example-host.xyz"]) {
      const r = await app.inject({ method: "OPTIONS", url: "/reclaim/session", headers: { origin: o, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
      expect(r.headers["access-control-allow-origin"]).toBe(o);
    }
    const bad = await app.inject({ url: "/health", headers: { origin: "https://evil.example" } });
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("ISSUER_PUBLIC_URL must be https (except localhost)", async () => {
    await expect(makeApp({ ISSUER_PUBLIC_URL: "http://issuer.example-host.xyz" })).rejects.toThrow(/https/);
    await expect(makeApp({ ISSUER_PUBLIC_URL: "http://localhost:8787" })).resolves.toBeTruthy();
  });
});

describe("fixture capture (debug)", () => {
  it("RECLAIM_CAPTURE_FIXTURE_DIR writes the received proof, mode 0600", async () => {
    const { mkdtempSync, readdirSync, statSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "rc-"));
    try {
      const { app, backend } = await makeApp({ RECLAIM_CAPTURE_FIXTURE_DIR: dir });
      await start(app);
      await app.inject({ method: "POST", url: callbackPath(backend), payload: fixture("literal") });
      const files = readdirSync(dir);
      expect(files).toEqual([`reclaim-proof.${SID}.json`]);
      expect(statSync(join(dir, files[0]!)).mode & 0o777).toBe(0o600);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
