// Reclaim proof verification. Real mode: @reclaimprotocol/js-sdk 5.8.x `verifyProof(proof, config)`, which
//  1. recovers the attestor signatures over the claim identifier and checks them against the epoch's attestors
//     (`assertVerifiedProof`, network call to fetch attestors), and
//  2. content-validates claimData.parameters against our provider (`assertValidateProof`): either the hash
//     requirements fetched for {providerId, providerVersion} from Reclaim's backend, or hashes we pin offline.
// It returns { isVerified, data: [{ context, extractedParameters }] }: `context` is JSON.parse(claimData.context)
// minus `extractedParameters`, which is returned separately (that is where `account_id` lives).
import type { Proof, VerificationConfig } from "@reclaimprotocol/js-sdk";
import type { Band, Config } from "./config.js";
import { IssueError } from "./predicates.js";

export type ReclaimProof = Proof;

export interface VerifiedClaim {
  context: Record<string, unknown>;
  extractedParameters: Record<string, string>;
}

export interface ProofVerifier {
  readonly kind: "reclaim" | "mock";
  /** `pin` (from a /reclaim/session) overrides the env pin's providerVersion: the exact version used in the session. */
  verify(proof: ReclaimProof, band: Band, pin?: { providerId: string; providerVersion?: string }): Promise<VerifiedClaim>;
}

/** Structural check before anything touches the proof. Throws IssueError("bad_proof"). */
export function assertProofShape(p: unknown): asserts p is ReclaimProof {
  const o = p as Record<string, any>;
  const cd = o?.claimData;
  const ok =
    o && typeof o === "object" &&
    typeof o.identifier === "string" &&
    cd && typeof cd === "object" &&
    typeof cd.provider === "string" &&
    typeof cd.parameters === "string" &&
    typeof cd.context === "string" &&
    typeof cd.owner === "string" &&
    typeof cd.identifier === "string" &&
    Number.isSafeInteger(cd.timestampS) &&
    Number.isSafeInteger(cd.epoch) &&
    Array.isArray(o.signatures) &&
    Array.isArray(o.witnesses);
  if (!ok) throw new IssueError("bad_proof", 400);
  if (o.identifier.toLowerCase() !== cd.identifier.toLowerCase()) throw new IssueError("bad_proof", 400);
}

export function parseContext(proof: ReclaimProof): VerifiedClaim {
  let ctx: Record<string, unknown>;
  try {
    ctx = JSON.parse(proof.claimData.context);
  } catch {
    throw new IssueError("bad_context");
  }
  if (!ctx || typeof ctx !== "object") throw new IssueError("bad_context");
  const { extractedParameters, ...rest } = ctx as { extractedParameters?: Record<string, string> };
  return { context: rest, extractedParameters: extractedParameters ?? {} };
}

export class ReclaimVerifier implements ProofVerifier {
  readonly kind = "reclaim" as const;
  constructor(private cfg: Config) {}

  configFor(band: Band, session?: { providerId: string; providerVersion?: string }): VerificationConfig {
    const pin = this.cfg.reclaim.pins[band];
    // Offline hashes win. Otherwise the env-pinned version, else the exact version Reclaim resolved for the session.
    const version = pin.providerVersion ?? session?.providerVersion;
    const base: VerificationConfig = pin.hashes
      ? { hashes: pin.hashes }
      : { providerId: pin.providerId!, ...(version ? { providerVersion: version } : {}) };
    if (this.cfg.reclaim.requireTee) return { ...base, teeAttestation: { appSecret: this.cfg.reclaim.appSecret! } };
    return base;
  }

  async verify(proof: ReclaimProof, band: Band, session?: { providerId: string; providerVersion?: string }): Promise<VerifiedClaim> {
    // A session created for another provider can never be verified against this band's pin.
    const pin = this.cfg.reclaim.pins[band];
    if (session && pin.providerId && session.providerId !== pin.providerId) throw new IssueError("wrong_provider");
    const { verifyProof } = await import("@reclaimprotocol/js-sdk");
    const res = await verifyProof(proof, this.configFor(band, session));
    // Never surface res.error: its message may quote proof content.
    if (!res.isVerified || res.data.length !== 1) throw new IssueError("proof_not_verified");
    if (this.cfg.reclaim.requireTee && res.isTeeAttestationVerified !== true) throw new IssueError("tee_not_verified");
    const d = res.data[0];
    return { context: d.context ?? {}, extractedParameters: d.extractedParameters ?? {} };
  }
}

/**
 * MOCK mode: skips attestor signatures and provider-hash validation ONLY. Context binding, predicates,
 * freshness, replay, nullifier and signing run exactly as in real mode. Proofs come from buildMockProof().
 */
export class MockVerifier implements ProofVerifier {
  readonly kind = "mock" as const;
  async verify(proof: ReclaimProof): Promise<VerifiedClaim> {
    return parseContext(proof);
  }
}
