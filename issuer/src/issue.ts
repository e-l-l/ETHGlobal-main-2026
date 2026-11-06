// POST /issue core. Order: cheap structural checks -> Reclaim verification -> context binding -> (optional)
// leaf recomputation -> replay claim -> account_id -> nullifier (account_id dropped) -> EIP-712 signature.
//
// Privacy invariants (tested): account_id is read once into a block-scoped const, never logged, never put in an
// error, never stored, never returned. Logs carry only an outcome code and the band.
import type { Band, Config } from "./config.js";
import { ISO_NUMERIC } from "./config.js";
import type { Attester } from "./eip712.js";
import { bizLeaf } from "./leaf.js";
import { businessNullifier, P, toHex32 } from "./nullifier.js";
import { checkPredicates, IssueError } from "./predicates.js";
import { assertProofShape, type ProofVerifier } from "./reclaim.js";
import type { ReplayCache } from "./replay.js";
import { isSessionRef, type ReclaimSessions } from "./sessions.js";

export interface IssueResponse {
  businessNullifier: `0x${string}`;
  commitment: `0x${string}`;
  expiresAt: number;
  signature: `0x${string}`;
}

export interface Log {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
}

export interface IssueDeps {
  cfg: Config;
  verifier: ProofVerifier;
  attester: Attester;
  replay: ReplayCache;
  now: () => number; // ms
  log: Log;
  leaf?: typeof bizLeaf;
  /** Real Reclaim sessions: lets `proof` be `{reclaimSession, statusToken}` (the issuer already holds the proof). */
  sessions?: ReclaimSessions;
}

function parseBand(b: unknown): Band {
  if (b === 1 || b === 2 || b === 3) return b;
  throw new IssueError("bad_band", 400);
}

export function parseField(x: unknown, code: string): bigint {
  if (typeof x !== "string" || !/^0x[0-9a-fA-F]{1,64}$/.test(x)) throw new IssueError(code, 400);
  const v = BigInt(x);
  if (v === 0n || v >= P) throw new IssueError(code, 400);
  return v;
}

function parseCountry(c: unknown): string {
  if (typeof c === "string" && /^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  if (typeof c === "number") {
    const hit = Object.entries(ISO_NUMERIC).find(([, n]) => n === c);
    if (hit) return hit[0];
  }
  throw new IssueError("bad_country", 400);
}

function requestUrlOf(parametersJson: string): string | undefined {
  try {
    const u = (JSON.parse(parametersJson) as { url?: unknown }).url;
    return typeof u === "string" ? u : undefined;
  } catch {
    throw new IssueError("bad_parameters");
  }
}

export async function issue(body: unknown, d: IssueDeps): Promise<IssueResponse> {
  const { cfg } = d;
  if (!body || typeof body !== "object") throw new IssueError("bad_body", 400);
  const b = body as Record<string, unknown>;

  const band = parseBand(b.band);
  const commitment = parseField(b.commitment, "bad_commitment");
  const commitmentHex = toHex32(commitment);
  const wantLeaf = b.h !== undefined || b.country !== undefined;
  if (cfg.requireLeafCheck && !wantLeaf) throw new IssueError("leaf_inputs_required", 400);

  // `proof` is either the Reclaim proof itself, or a reference to a /reclaim/session whose proof the issuer
  // received directly from Reclaim (it never passed through the app).
  let proof: unknown = b.proof;
  let held: ReturnType<ReclaimSessions["take"]> | undefined;
  if (isSessionRef(proof)) {
    if (!d.sessions) throw new IssueError("bad_proof", 400);
    held = d.sessions.take(proof, band, commitmentHex);
    proof = held.proof;
  }
  assertProofShape(proof);

  // Freshness: a revenue band is only as good as its date.
  const nowS = Math.floor(d.now() / 1000);
  const ts = proof.claimData.timestampS;
  if (ts + cfg.proofMaxAgeSec < nowS) throw new IssueError("proof_too_old");
  if (ts > nowS + cfg.clockSkewSec) throw new IssueError("proof_from_future");

  // Cheap pre-check before the network-bound verification: the request URL pin.
  if (cfg.expectedUrl && requestUrlOf(proof.claimData.parameters) !== cfg.expectedUrl) throw new IssueError("wrong_provider_url");

  // Attestor signatures + provider pin (real) or structural parse (mock).
  const claim = await d.verifier.verify(proof, band, held?.pin);

  // Predicates, read from the attested request spec (literal regexes) or the VERIFIED extracted values (template).
  const proven = checkPredicates(proof.claimData.parameters, band, {
    allowedCountries: cfg.allowedCountries,
    expectedUrl: cfg.expectedUrl,
  }, claim.extractedParameters);

  // Anti-theft binding: the proof was generated for exactly this commitment.
  if (claim.context.contextMessage !== commitmentHex) throw new IssueError("context_mismatch");
  if (cfg.reclaim.appId) {
    const nd = claim.context.attestationNonceData as { applicationId?: string } | undefined;
    if (nd?.applicationId && nd.applicationId.toLowerCase() !== cfg.reclaim.appId.toLowerCase()) {
      throw new IssueError("wrong_app");
    }
  }

  // Optional: recompute the leaf from h and the PROVEN attributes, so the merchant can't claim a higher band.
  if (wantLeaf) {
    const h = parseField(b.h, "bad_h");
    const country = parseCountry(b.country);
    if (!proven.countries.includes(country)) throw new IssueError("predicate_failed:country");
    const leaf = await (d.leaf ?? bizLeaf)(h, ISO_NUMERIC[country], band, proven.ageOk);
    if (leaf !== commitment) throw new IssueError("commitment_mismatch");
  }

  // ---- synchronous from here to the nullifier: no await between the replay claim and account_id handling.
  if (!d.replay.claim(proof.claimData.identifier)) throw new IssueError("proof_replayed", 409);
  held?.done(); // the held proof (and its account_id) is dropped now

  let nullifier: bigint;
  {
    const accountId = claim.extractedParameters[cfg.accountIdParam];
    if (typeof accountId !== "string" || !cfg.accountIdPattern.test(accountId)) throw new IssueError("account_id_missing");
    nullifier = businessNullifier(cfg.pepper, accountId);
    // Drop every reference we own to the id. (The caller's request object is discarded after the response.)
    delete claim.extractedParameters[cfg.accountIdParam];
  }

  const expiresAt = nowS + cfg.attestationTtlSec;
  const signature = await d.attester.sign({
    businessNullifier: nullifier,
    commitment,
    expiresAt: BigInt(expiresAt),
    revenueBand: BigInt(band),
  });
  d.log.info({ event: "issued", band, mode: d.verifier.kind }, "business pass attestation issued");
  return { businessNullifier: toHex32(nullifier), commitment: commitmentHex, expiresAt, signature };
}
