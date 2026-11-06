// A REAL captured proof (RECLAIM_PROVIDER.md, "Capture a real proof as a fixture"). Skipped until the file exists.
//   test/fixtures/reclaim-proof.captured.json   (a demo-portal account only: it contains that account's id)
// Offline: the claim identifier is recomputed from claimData and the attestor signatures are recovered locally,
// then the issuer's predicate + context + account_id reading runs on it. Online (RECLAIM_E2E=1): the real
// verifyProof against RECLAIM_PROVIDER_ID (needs network; proofs older than the attestor epoch may fail).
import { existsSync, readFileSync } from "node:fs";
import { getIdentifierFromClaimInfo, recoverSignersOfSignedClaim, verifyProof } from "@reclaimprotocol/js-sdk";
import { describe, expect, it } from "vitest";
import { checkPredicates } from "../src/predicates.js";
import { assertProofShape, parseContext } from "../src/reclaim.js";

const path = new URL("./fixtures/reclaim-proof.captured.json", import.meta.url);
const have = existsSync(path);
const env = process.env;

describe.skipIf(!have)("captured real Reclaim proof", () => {
  const proof = have ? JSON.parse(readFileSync(path, "utf8")) : null;
  const band = Number(env.CAPTURED_BAND ?? 2) as 1 | 2 | 3;

  it("is internally consistent: identifier = hash(claimInfo), signatures recover to the listed witnesses", () => {
    assertProofShape(proof);
    const { provider, parameters, context } = proof.claimData;
    expect(getIdentifierFromClaimInfo({ provider, parameters, context }).toLowerCase()).toBe(proof.identifier.toLowerCase());
    const signers = recoverSignersOfSignedClaim({
      claim: proof.claimData,
      signatures: proof.signatures.map((s: string) => Uint8Array.from(Buffer.from(s.replace(/^0x/, ""), "hex"))),
    }).map((a) => a.toLowerCase());
    expect(signers).toEqual(proof.witnesses.map((w: { id: string }) => w.id.toLowerCase()));
  });

  it("satisfies the issuer's predicates and carries a context message + account_id", () => {
    const { context, extractedParameters } = parseContext(proof);
    expect(String(context.contextMessage)).toMatch(/^0x[0-9a-f]{64}$/);
    expect(extractedParameters.account_id).toMatch(/^acc_[0-9a-f]{32}$/);
    const p = checkPredicates(proof.claimData.parameters, band, { allowedCountries: ["AR", "NG", "KE"] }, extractedParameters);
    expect(p.url).toMatch(/\/api\/me\/summary$/);
  });

  it.skipIf(env.RECLAIM_E2E !== "1" || !env.RECLAIM_PROVIDER_ID)("passes the real verifyProof (network)", async () => {
    const res = await verifyProof(proof, { providerId: env.RECLAIM_PROVIDER_ID!, ...(env.RECLAIM_PROVIDER_VERSION ? { providerVersion: env.RECLAIM_PROVIDER_VERSION } : {}) });
    expect(res.isVerified).toBe(true);
  });
});
