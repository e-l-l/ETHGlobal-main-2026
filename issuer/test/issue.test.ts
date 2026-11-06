import { recoverTypedDataAddress } from "viem";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { bizLeaf } from "../src/leaf.js";
import { buildMockProof, MOCK_ACCOUNTS } from "../src/mock.js";
import { businessNullifier, toHex32 } from "../src/nullifier.js";
import { checkPredicates } from "../src/predicates.js";
import type { ReclaimProof } from "../src/reclaim.js";
import { commitmentOf, makeApp, NOW_MS, TEST_ADDR, testEnv } from "./helpers.js";

const C1 = commitmentOf(0x1234n);
const C2 = commitmentOf(0x5678n);
const ALL_IDS = Object.values(MOCK_ACCOUNTS).map((a) => a.accountId);
const NOW_S = Math.floor(NOW_MS / 1000);

const proofFor = (account: keyof typeof MOCK_ACCOUNTS, commitmentHex: string, band: 1 | 2 | 3, extra: { timestampS?: number } = {}) =>
  buildMockProof({ account: MOCK_ACCOUNTS[account], commitmentHex, band, timestampS: extra.timestampS ?? NOW_S });

async function post(app: Awaited<ReturnType<typeof makeApp>>["app"], body: unknown, headers: Record<string, string> = {}) {
  return app.inject({ method: "POST", url: "/issue", payload: body as object, headers });
}

afterEach(() => vi.restoreAllMocks());

describe("POST /issue (mock mode)", () => {
  it("issues a real attestation that recovers to the issuer", async () => {
    const { app, attester, cfg } = await makeApp();
    const res = await post(app, { proof: proofFor("donpepe", C1, 2), commitment: C1, band: 2 });
    expect(res.statusCode).toBe(200);
    const out = res.json();
    expect(Object.keys(out).sort()).toEqual(["businessNullifier", "commitment", "expiresAt", "signature"]);
    expect(out.commitment).toBe(C1);
    expect(out.expiresAt).toBe(NOW_S + 600);
    expect(out.businessNullifier).toBe(toHex32(businessNullifier(cfg.pepper, MOCK_ACCOUNTS.donpepe.accountId)));
    const signer = await recoverTypedDataAddress({
      domain: attester.domain,
      types: attester.types,
      primaryType: "BusinessVerified",
      message: { businessNullifier: BigInt(out.businessNullifier), commitment: BigInt(out.commitment), expiresAt: BigInt(out.expiresAt) },
      signature: out.signature,
    });
    expect(signer).toBe(TEST_ADDR);
  });

  it("same business, two different proofs and commitments -> same nullifier", async () => {
    const { app } = await makeApp();
    const a = (await post(app, { proof: proofFor("donpepe", C1, 2), commitment: C1, band: 2 })).json();
    const b = (await post(app, { proof: proofFor("donpepe", C2, 1), commitment: C2, band: 1 })).json();
    const c = (await post(app, { proof: proofFor("wanjiru", C2, 3), commitment: C2, band: 3 })).json();
    expect(a.businessNullifier).toBe(b.businessNullifier);
    expect(c.businessNullifier).not.toBe(a.businessNullifier);
  });

  it("rejects a replay of the same proof identifier", async () => {
    const { app } = await makeApp();
    const proof = proofFor("donpepe", C1, 2);
    expect((await post(app, { proof, commitment: C1, band: 2 })).statusCode).toBe(200);
    const again = await post(app, { proof, commitment: C1, band: 2 });
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: "proof_replayed" });
  });

  it("rejects a wrong commitment (proof bound to another commitment)", async () => {
    const { app } = await makeApp();
    const res = await post(app, { proof: proofFor("donpepe", C1, 2), commitment: C2, band: 2 });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: "context_mismatch" });
  });

  it("requires the exact canonical lowercase 0x+64 context", async () => {
    const { app } = await makeApp();
    const proof = buildMockProof({ account: MOCK_ACCOUNTS.donpepe, commitmentHex: "0x1234", band: 2, timestampS: NOW_S });
    expect((await post(app, { proof, commitment: "0x1234", band: 2 })).json()).toEqual({ error: "context_mismatch" });
  });

  it.each([
    ["newshop", 1, "predicate_failed:age_ok"],
    ["suspended", 2, "predicate_failed:active"],
    ["nkechi", 2, "predicate_failed:band_ge_2"],
    ["donpepe", 3, "predicate_failed:band_ge_3"],
  ] as const)("rejects a failed predicate: %s band %d -> %s", async (acct, band, code) => {
    const { app } = await makeApp();
    const res = await post(app, { proof: proofFor(acct, C1, band), commitment: C1, band });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({ error: code });
  });

  it("rejects a country outside the allow-list, and a proof for a lower band than requested", async () => {
    const { app } = await makeApp({ env: { ALLOWED_COUNTRIES: "AR,NG" } });
    const ke = buildMockProof({ account: MOCK_ACCOUNTS.wanjiru, commitmentHex: C1, band: 1, allowedCountries: ["AR", "NG", "KE"], timestampS: NOW_S });
    expect((await post(app, { proof: ke, commitment: C1, band: 1 })).json()).toEqual({ error: "predicate_failed:country" });
    const lower = proofFor("donpepe", C1, 1);
    expect((await post(app, { proof: lower, commitment: C1, band: 2 })).json()).toEqual({ error: "predicate_failed:band_ge_2" });
  });

  it("rejects stale and future proofs", async () => {
    const { app } = await makeApp();
    expect((await post(app, { proof: proofFor("donpepe", C1, 2, { timestampS: NOW_S - 901 }), commitment: C1, band: 2 })).json()).toEqual({ error: "proof_too_old" });
    expect((await post(app, { proof: proofFor("donpepe", C1, 2, { timestampS: NOW_S + 121 }), commitment: C1, band: 2 })).json()).toEqual({ error: "proof_from_future" });
  });

  it("rejects malformed input with 400", async () => {
    const { app } = await makeApp();
    const p = proofFor("donpepe", C1, 2);
    for (const body of [
      { proof: p, commitment: C1, band: 4 },
      { proof: p, commitment: "0x" + "f".repeat(64), band: 2 }, // >= P
      { proof: p, commitment: "0x0", band: 2 },
      { proof: { identifier: "x" }, commitment: C1, band: 2 },
    ]) {
      expect((await post(app, body)).statusCode).toBe(400);
    }
  });

  it("serves /mock/proof for the demo flow", async () => {
    const { app } = await makeApp();
    const r = await app.inject({ method: "POST", url: "/mock/proof", payload: { account: "wanjiru", commitment: C1, band: 3 } });
    expect(r.statusCode).toBe(200);
    expect((await post(app, { proof: r.json().proof, commitment: C1, band: 3 })).statusCode).toBe(200);
  });

  it("/mock/proof does not exist in real mode", async () => {
    const verifier = { kind: "reclaim" as const, verify: vi.fn() };
    const { app } = await makeApp({ env: { ISSUER_MOCK: "0", RECLAIM_PROVIDER_ID: "prov" }, verifier });
    expect((await app.inject({ method: "POST", url: "/mock/proof", payload: {} })).statusCode).toBe(404);
  });
});

describe("predicate reading", () => {
  const base = { allowedCountries: ["AR", "NG", "KE"] };
  const params = (matches: object[]) => JSON.stringify({ url: "u", method: "GET", responseMatches: matches });
  const good = [
    { type: "regex", value: `"status":"active",` },
    { type: "regex", value: `"age_ok":true,` },
    { type: "regex", value: `"country":"(?:AR|NG|KE)",` },
    { type: "regex", value: `"band_ge_2":true,` },
  ];
  it("accepts the demo-portal provider's matches", () => {
    expect(checkPredicates(params(good), 2, base).countries).toEqual(["AR", "NG", "KE"]);
  });
  it("ignores inverted and optional matches", () => {
    expect(() => checkPredicates(params([...good.slice(0, 3), { ...good[3], invert: true }]), 2, base)).toThrow("band_ge_2");
    expect(() => checkPredicates(params([good[0], { ...good[1], isOptional: true }, good[2], good[3]]), 2, base)).toThrow("age_ok");
  });
  it("accepts an exact-country match and narrows to it", () => {
    expect(checkPredicates(params([...good.slice(0, 2), { type: "regex", value: `"country":"KE",` }, good[3]]), 2, base).countries).toEqual(["KE"]);
  });
  it("pins the request URL when configured", () => {
    expect(() => checkPredicates(params(good), 2, { ...base, expectedUrl: "https://x/api/me/summary" })).toThrow("wrong_provider_url");
  });
});

describe("leaf recomputation (h + country)", () => {
  const H = 0x2ec47277166c767a5b39738264b6f6bc35d9094c37f903c9166b790a06b5da9bn; // = Poseidon2(123456789)

  it("accepts a commitment equal to Poseidon2(TAG_BIZ, h, attrs) with the proven band", async () => {
    const leaf = commitmentOf(await bizLeaf(H, 32, 2, 1));
    const { app } = await makeApp({ env: { ISSUER_REQUIRE_LEAF_CHECK: "1" } });
    const res = await post(app, { proof: proofFor("donpepe", leaf, 2), commitment: leaf, band: 2, h: commitmentOf(H), country: "AR" });
    expect(res.statusCode).toBe(200);
  });

  it("rejects a leaf that claims a higher band than proven", async () => {
    const leaf = commitmentOf(await bizLeaf(H, 32, 3, 1));
    const { app } = await makeApp();
    const res = await post(app, { proof: proofFor("donpepe", leaf, 2), commitment: leaf, band: 2, h: commitmentOf(H), country: 32 });
    expect(res.json()).toEqual({ error: "commitment_mismatch" });
  });

  it("requires h + country when ISSUER_REQUIRE_LEAF_CHECK=1", async () => {
    const { app } = await makeApp({ env: { ISSUER_REQUIRE_LEAF_CHECK: "1" } });
    expect((await post(app, { proof: proofFor("donpepe", C1, 2), commitment: C1, band: 2 })).json()).toEqual({ error: "leaf_inputs_required" });
  });
});

describe("privacy: account_id never leaves the issue path", () => {
  it("never appears in logs (pino + console) or responses, across success and failure paths", async () => {
    const consoleCalls: unknown[][] = [];
    for (const k of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, k).mockImplementation((...a: unknown[]) => void consoleCalls.push(a));
    }
    const { app, lines } = await makeApp();
    const bodies: string[] = [];
    const go = async (b: unknown) => bodies.push((await post(app, b)).body);
    const ok = proofFor("donpepe", C1, 2);
    await go({ proof: ok, commitment: C1, band: 2 }); // success
    await go({ proof: ok, commitment: C1, band: 2 }); // replay
    await go({ proof: proofFor("nkechi", C1, 1), commitment: C2, band: 1 }); // context mismatch
    await go({ proof: proofFor("newshop", C1, 1), commitment: C1, band: 1 }); // predicate
    await go({ proof: proofFor("suspended", C1, 2), commitment: C1, band: 2 });
    await go({ proof: { ...ok, claimData: { ...ok.claimData, context: "{not json" } }, commitment: C1, band: 2 });
    const badId = buildMockProof({ account: { ...MOCK_ACCOUNTS.wanjiru, accountId: "acc_NOT_VALID_FORMAT" }, commitmentHex: C1, band: 1, timestampS: NOW_S });
    await go({ proof: badId, commitment: C1, band: 1 }); // id fails pattern

    expect(lines.length).toBeGreaterThan(0); // the logger did run
    const haystack = [lines.join("\n"), bodies.join("\n"), JSON.stringify(consoleCalls)].join("\n");
    for (const id of [...ALL_IDS, "acc_NOT_VALID_FORMAT"]) expect(haystack).not.toContain(id);
    expect(haystack).not.toContain("acc_");
    expect(haystack).not.toContain("extractedParameters");
  });
});

describe("service endpoints and hardening", () => {
  it("GET /issuer returns the issuer address and domain; /health is ok", async () => {
    const { app } = await makeApp();
    const r = (await app.inject({ url: "/issuer" })).json();
    expect(r.address).toBe(TEST_ADDR);
    expect(r.domain).toEqual({ name: "BusinessPassRegistry", version: "1", chainId: 31337, verifyingContract: "0x5FbDB2315678afecb367f032d93F642f64180aa3" });
    expect(r.types).toEqual({ BusinessVerified: [
      { name: "businessNullifier", type: "uint256" }, { name: "commitment", type: "uint256" }, { name: "expiresAt", type: "uint64" },
    ] });
    expect((await app.inject({ url: "/health" })).json()).toEqual({ ok: true, mode: "mock", chainId: 31337 });
  });

  it("CORS allow-list", async () => {
    const { app } = await makeApp();
    const ok = await app.inject({ url: "/health", headers: { origin: "http://localhost:3000" } });
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    const bad = await app.inject({ url: "/health", headers: { origin: "https://evil.example" } });
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("rate-limits /issue", async () => {
    const { app } = await makeApp({ env: { RATE_LIMIT_MAX: "2" } });
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await post(app, { band: 9 })).statusCode);
    expect(codes).toEqual([400, 400, 429]);
  });

  it("config: refuses mock on mainnet and real mode without a provider pin", () => {
    expect(() => loadConfig(testEnv({ CHAIN_ID: "1" }))).toThrow(/chain 1/);
    expect(() => loadConfig(testEnv({ ISSUER_MOCK: "0" }))).toThrow(/RECLAIM_PROVIDER_ID/);
  });
});

// keep the type import used
export type _P = ReclaimProof;


describe("secure defaults", () => {
  it("leaf check is ON when ISSUER_REQUIRE_LEAF_CHECK is unset", () => {
    const env = testEnv();
    delete (env as Record<string, string>)["ISSUER_REQUIRE_LEAF_CHECK"];
    expect(loadConfig(env).requireLeafCheck).toBe(true);
    expect(loadConfig(testEnv({ ISSUER_REQUIRE_LEAF_CHECK: "0" })).requireLeafCheck).toBe(false);
  });
});
