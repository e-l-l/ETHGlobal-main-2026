// Predicate checks over a Reclaim proof's attested request spec.
//
// How Reclaim exposes predicates: the provider's `responseMatches` are part of the HTTP claim parameters,
// i.e. proof.claimData.parameters = JSON {url, method, responseMatches:[{type, value, invert?, isOptional?}], ...}.
// The attestors only sign a claim if every non-optional, non-inverted match held on the real HTTPS response,
// and claimData (parameters included) is covered by the claim identifier the attestors signed.
// So "predicate P is true" == "a match with exactly P's regex is present, not inverted, not optional".
// The redacted response itself is NOT in the proof; we never see the values, only that the patterns matched.
//
// Regexes are byte-identical to demo/portal/lib/reclaim.ts (PREDICATE_REGEX).
import type { Band } from "./config.js";

export class IssueError extends Error {
  constructor(readonly code: string, readonly status = 422) {
    super(code);
  }
}

export const PRED = {
  active: `"status":"active",`,
  age_ok: `"age_ok":true,`,
  band: (b: Band) => `"band_ge_${b}":true,`,
} as const;

/** `"country":"(?:AR|NG|KE)",` (allow-list) or `"country":"AR",` (exact). Returns the proven set or null. */
export function parseCountryMatch(value: string): string[] | null {
  const m = /^"country":"(?:\(\?:([A-Z]{2}(?:\|[A-Z]{2})*)\)|([A-Z]{2}))",$/.exec(value);
  if (!m) return null;
  return m[1] ? m[1].split("|") : [m[2]];
}

interface Match {
  type?: unknown;
  value?: unknown;
  invert?: unknown;
  isOptional?: unknown;
}

export interface ProvenPredicates {
  band: Band;
  ageOk: 1;
  /** Countries the proof shows the account is in (one of). Exact-country providers give a single entry. */
  countries: string[];
  url: string;
}

/**
 * `extracted` = the VERIFIED `extractedParameters` (from verifyProof's trusted data, never from the raw proof).
 *
 * A predicate holds if EITHER
 *  1. literal mode (preferred, what demo/portal/lib/reclaim.ts specifies): a mandatory, positive match whose value
 *     is exactly the predicate regex, e.g. `"status":"active",`; OR
 *  2. template mode (what Reclaim's provider builder emits when you tick a field to "verify"): a mandatory,
 *     positive match containing `{{name}}` AND the attested extracted value equals the expected value
 *     (status = "active", age_ok = "true", band_ge_k = "true", country in the allow-list).
 * Both are bound by the provider pin: verifyProof content-validates `parameters` against our provider's hash.
 * Template values reach only this issuer (the proof is never sent onchain), and they are yes/no answers anyway.
 */
export function checkPredicates(
  parametersJson: string,
  band: Band,
  opts: { allowedCountries: string[]; expectedUrl?: string },
  extracted: Record<string, unknown> = {},
): ProvenPredicates {
  let params: { url?: unknown; responseMatches?: unknown };
  try {
    params = JSON.parse(parametersJson);
  } catch {
    throw new IssueError("bad_parameters");
  }
  if (!Array.isArray(params.responseMatches)) throw new IssueError("bad_parameters");
  const url = typeof params.url === "string" ? params.url : "";
  if (opts.expectedUrl && url !== opts.expectedUrl) throw new IssueError("wrong_provider_url");

  // Only positive, mandatory matches count as proven.
  const proven = (params.responseMatches as Match[])
    .filter((m) => m && (m.type === "regex" || m.type === "contains") && typeof m.value === "string" && !m.invert && !m.isOptional)
    .map((m) => m.value as string);
  const has = (v: string) => proven.includes(v);
  const templated = (name: string) => proven.some((v) => v.includes(`{{${name}}}`));
  const tmpl = (name: string, want: string) => templated(name) && extracted[name] === want;

  if (!has(PRED.active) && !tmpl("status", "active")) throw new IssueError("predicate_failed:active");
  if (!has(PRED.age_ok) && !tmpl("age_ok", "true")) throw new IssueError("predicate_failed:age_ok");
  if (!has(PRED.band(band)) && !tmpl(`band_ge_${band}`, "true")) throw new IssueError(`predicate_failed:band_ge_${band}`);

  const sets = proven.map(parseCountryMatch).filter((s): s is string[] => s !== null);
  const ec = extracted.country;
  if (templated("country") && typeof ec === "string") sets.push([ec]);
  // Every country match must be within the allow-list (a match that admits a disallowed country proves nothing).
  const good = sets.filter((s) => s.length > 0 && s.every((c) => opts.allowedCountries.includes(c)));
  if (good.length === 0) throw new IssueError("predicate_failed:country");
  // If several country matches exist, the account satisfies all of them: intersect.
  const countries = good.reduce((acc, s) => acc.filter((c) => s.includes(c)));
  if (countries.length === 0) throw new IssueError("predicate_failed:country");

  return { band, ageOk: 1, countries, url };
}
