// Real-mode path with the Reclaim SDK module mocked (its CJS namespace can't be spied on).
import { afterEach, describe, expect, it, vi } from "vitest";

const verifyProof = vi.hoisted(() => vi.fn());
vi.mock("@reclaimprotocol/js-sdk", () => ({ verifyProof }));

import { buildMockProof, MOCK_ACCOUNTS } from "../src/mock.js";
import { commitmentOf, makeApp, NOW_MS } from "./helpers.js";

const C1 = commitmentOf(0x1234n);
const NOW_S = Math.floor(NOW_MS / 1000);
const proof = () => buildMockProof({ account: MOCK_ACCOUNTS.donpepe, commitmentHex: C1, band: 2, timestampS: NOW_S });

afterEach(() => verifyProof.mockReset());

describe("real verifier path (SDK mocked)", () => {
  it("passes the pinned provider to verifyProof and uses its trusted data", async () => {
    const p = proof();
    const ctx = JSON.parse(p.claimData.context);
    verifyProof.mockResolvedValue({
      isVerified: true, error: undefined, publicData: [],
      data: [{ context: { contextMessage: ctx.contextMessage }, extractedParameters: ctx.extractedParameters }],
    });
    const { app } = await makeApp({ env: { ISSUER_MOCK: "0", RECLAIM_PROVIDER_ID: "prov-default", RECLAIM_PROVIDER_ID_BAND2: "prov-b2", RECLAIM_PROVIDER_VERSION: "1.0.0" } });
    const res = await app.inject({ method: "POST", url: "/issue", payload: { proof: p, commitment: C1, band: 2 } });
    expect(res.statusCode).toBe(200);
    expect(verifyProof).toHaveBeenCalledWith(p, { providerId: "prov-b2", providerVersion: "1.0.0" });
  });

  it("uses offline hash pins and TEE when configured", async () => {
    const p = proof();
    const ctx = JSON.parse(p.claimData.context);
    verifyProof.mockResolvedValue({ isVerified: true, isTeeAttestationVerified: true, data: [{ context: ctx, extractedParameters: ctx.extractedParameters }] });
    const { app } = await makeApp({ env: { ISSUER_MOCK: "0", RECLAIM_PROVIDER_HASHES: "0xaa,0xbb", RECLAIM_REQUIRE_TEE: "1", RECLAIM_APP_SECRET: "0x" + "33".repeat(32) } });
    expect((await app.inject({ method: "POST", url: "/issue", payload: { proof: p, commitment: C1, band: 2 } })).statusCode).toBe(200);
    expect(verifyProof.mock.calls[0][1]).toEqual({ hashes: ["0xaa", "0xbb"], teeAttestation: { appSecret: "0x" + "33".repeat(32) } });
  });

  it("a failed verification is a generic 422 that never echoes the SDK error", async () => {
    verifyProof.mockResolvedValue({ isVerified: false, error: new Error(`bad sig for ${MOCK_ACCOUNTS.donpepe.accountId}`), data: [], publicData: [] });
    const { app, lines } = await makeApp({ env: { ISSUER_MOCK: "0", RECLAIM_PROVIDER_HASHES: "0xabc" } });
    const res = await app.inject({ method: "POST", url: "/issue", payload: { proof: proof(), commitment: C1, band: 2 } });
    expect(res.json()).toEqual({ error: "proof_not_verified" });
    expect(lines.join("") + res.body).not.toContain("acc_");
  });

  it("an SDK that throws is a 500 without the message", async () => {
    verifyProof.mockRejectedValue(new Error(`boom ${MOCK_ACCOUNTS.donpepe.accountId}`));
    const { app, lines } = await makeApp({ env: { ISSUER_MOCK: "0", RECLAIM_PROVIDER_HASHES: "0xabc" } });
    const res = await app.inject({ method: "POST", url: "/issue", payload: { proof: proof(), commitment: C1, band: 2 } });
    expect(res.statusCode).toBe(500);
    expect(lines.join("") + res.body).not.toContain("acc_");
  });
});
