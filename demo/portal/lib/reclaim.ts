// Single source of truth for the Reclaim custom provider. The README copies these values and the
// tests run every regex against every seeded account's real response body.
//
// Reclaim semantics, which are easy to get backwards:
//  - responseMatches: patterns that MUST match the revealed response, or no proof is produced.
//  - responseRedactions: the ONLY parts of the response revealed to the attestor. Everything not
//    selected stays hidden. So we "redact" account_id, business_name and the exact numbers by never
//    selecting them: each redaction selects exactly one predicate token.
//
// No capture groups anywhere: a (named) capture group becomes an extracted parameter, which is
// public in the proof's context onchain. `(?:...)` is non-capturing.

export const SUMMARY_PATH = "/api/me/summary";

export interface Match {
  type: "regex";
  value: string;
  invert?: boolean;
}
export interface Redaction {
  regex: string;
}

export const ALLOWED_COUNTRIES = ["AR", "NG", "KE"] as const;

export const PREDICATE_REGEX = {
  active: `"status":"active",`,
  age_ok: `"age_ok":true,`,
  band_ge_1: `"band_ge_1":true,`,
  band_ge_2: `"band_ge_2":true,`,
  band_ge_3: `"band_ge_3":true,`,
  country_allowed: `"country":"(?:${ALLOWED_COUNTRIES.join("|")})",`,
} as const;

/** Per-country exact match, for when the issuer must learn WHICH country (see README trade-off). */
export function countryExact(cc: string): string {
  return `"country":"${cc}",`;
}

/** Values that must never be revealed. The tests check no redaction can ever select them. */
export const NEVER_REVEALED_KEYS = ["account_id", "business_name", "revenue_90d_cents", "account_age_months"] as const;

export function providerConfig(origin: string, band: 1 | 2 | 3) {
  const bandKey = `band_ge_${band}` as const;
  const preds = [PREDICATE_REGEX.active, PREDICATE_REGEX.age_ok, PREDICATE_REGEX.country_allowed, PREDICATE_REGEX[bandKey]];
  return {
    name: `Demo Seller Portal: active, 6+ months, allowed country, revenue band >= ${band}`,
    loginUrl: `${origin}/login`,
    url: `${origin}${SUMMARY_PATH}`,
    method: "GET" as const,
    responseType: "json",
    responseMatches: preds.map((value): Match => ({ type: "regex", value })),
    responseRedactions: preds.map((regex): Redaction => ({ regex })),
  };
}

// ---------------------------------------------------------------------------------------------
// Match set 2: ISSUER-ONLY extraction of account_id (per-business nullifier input).
//
// This is the one place a capture group is allowed. The named group becomes an extracted
// parameter in the proof's claim context, so a proof containing it must ONLY ever be sent to our
// issuer (offchain), never submitted onchain or to anyone else. The issuer verifies the proof,
// computes nullifier = HMAC(pepper, account_id), discards account_id, and signs an attestation
// carrying only the predicates + nullifier. The registry checks that signature.
//
// The extraction must live in the SAME proof as the predicates (issuerProviderConfig below). Two
// separate proofs could not be linked to one account: someone holding a qualifying account and N
// throwaway accounts could pair the good predicates with N different nullifiers.
// ---------------------------------------------------------------------------------------------

export const ISSUER_ACCOUNT_ID_REGEX = `"account_id":"(?<account_id>acc_[0-9a-f]{32})",`;
/** The span revealed to the attestor/issuer for set 2: the account_id token, nothing else. */
export const ISSUER_ACCOUNT_ID_REDACTION = `"account_id":"acc_[0-9a-f]{32}",`;

/** Pull account_id out of a response body exactly as the issuer-only match does (used by tests and as an issuer reference). */
export function extractAccountId(body: string): string | null {
  const all = [...body.matchAll(new RegExp(ISSUER_ACCOUNT_ID_REGEX, "g"))];
  return all.length === 1 ? all[0].groups!.account_id : null;
}

/**
 * Issuer provider = set 1 (public predicates) + set 2 (account_id extraction) in ONE proof.
 * Its proofs go to the issuer only. Onchain sees just the issuer's signed attestation.
 */
export function issuerProviderConfig(origin: string, band: 1 | 2 | 3) {
  const pub = providerConfig(origin, band);
  return {
    ...pub,
    name: `Demo Seller Portal (ISSUER ONLY, never onchain): band >= ${band} + account_id for HMAC nullifier`,
    responseMatches: [...pub.responseMatches, { type: "regex", value: ISSUER_ACCOUNT_ID_REGEX } as Match],
    responseRedactions: [...pub.responseRedactions, { regex: ISSUER_ACCOUNT_ID_REDACTION } as Redaction],
  };
}
