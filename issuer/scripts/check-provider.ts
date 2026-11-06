// Pre-demo check: does the Reclaim provider configured in env produce proofs THIS issuer will accept?
//
//   cd issuer && set -a && . ./.env && set +a && npm run check:provider            # reads public provider config only
//   ... npm run check:provider -- --init                                            # also inits a real session (app id + secret)
//
// Prints only public data (provider URL, match/redaction patterns, OK/FAIL). Never prints RECLAIM_APP_SECRET.
import { fetchProviderConfigs, ReclaimProofRequest } from "@reclaimprotocol/js-sdk";
import { checkPredicates } from "../src/predicates.js";

const env = process.env;
const allowed = (env.ALLOWED_COUNTRIES ?? "AR,NG,KE").split(",").map((s) => s.trim().toUpperCase());
const accountParam = env.ACCOUNT_ID_PARAM ?? "account_id";
const NEVER = ["business_name", "revenue_90d_cents", "account_age_months"];
let failed = false;
const bad = (m: string) => ((failed = true), console.log(`  FAIL ${m}`));
const ok = (m: string) => console.log(`  ok   ${m}`);

for (const band of [1, 2, 3] as const) {
  const id = env[`RECLAIM_PROVIDER_ID_BAND${band}`] || env.RECLAIM_PROVIDER_ID || undefined;
  const version = env[`RECLAIM_PROVIDER_VERSION_BAND${band}`] || env.RECLAIM_PROVIDER_VERSION || undefined;
  console.log(`\nband ${band}: provider ${id ?? "(unset)"}${version ? ` @ ${version}` : " (latest)"}`);
  if (!id) {
    bad("RECLAIM_PROVIDER_ID / _BAND" + band + " is not set");
    continue;
  }
  let specs: { url: string; method: string; responseMatches: { type: string; value: string; invert?: boolean; isOptional?: boolean }[]; responseRedactions: { jsonPath?: string; regex?: string }[] }[];
  try {
    const res = await fetchProviderConfigs(id, version ?? null, []);
    specs = (res.providers?.[0]?.requestData ?? []) as typeof specs;
    console.log(`  provider version: ${res.providerVersionString ?? "?"}  login: ${res.providers?.[0]?.loginUrl ?? "?"}`);
  } catch {
    bad("could not fetch the provider config from Reclaim (wrong id? network?)");
    continue;
  }
  if (specs.length !== 1) bad(`expected exactly 1 request spec, got ${specs.length}`);
  for (const s of specs) {
    console.log(`  ${s.method} ${s.url}`);
    for (const m of s.responseMatches) console.log(`    match     ${m.type} ${JSON.stringify(m.value)}${m.invert ? " INVERT" : ""}${m.isOptional ? " OPTIONAL" : ""}`);
    for (const r of s.responseRedactions) console.log(`    redaction ${JSON.stringify(r)}`);
    if (!/\/api\/me\/summary$/.test(s.url) || s.url.includes("?")) bad("url must be https://<portal>/api/me/summary with no query");
    if (env.RECLAIM_EXPECTED_URL && s.url !== env.RECLAIM_EXPECTED_URL) bad(`url != RECLAIM_EXPECTED_URL (${env.RECLAIM_EXPECTED_URL})`);
    // Simulate a satisfying account; literal regexes or {{template}} params must cover every predicate.
    const extracted = { status: "active", age_ok: "true", country: allowed[0], [`band_ge_${band}`]: "true" };
    try {
      checkPredicates(JSON.stringify({ url: s.url, responseMatches: s.responseMatches }), band, { allowedCountries: allowed }, extracted);
      ok("predicates: active, age_ok, country, band_ge_" + band);
    } catch (e) {
      bad(`issuer would reject: ${(e as Error).message}`);
    }
    const values = s.responseMatches.filter((m) => !m.invert && !m.isOptional).map((m) => m.value);
    if (values.some((v) => v.includes(`(?<${accountParam}>`) || v.includes(`{{${accountParam}}}`))) ok(`extracts ${accountParam} (issuer-only)`);
    else bad(`no ${accountParam} extraction: add the issuer-only match (see RECLAIM_PROVIDER.md step 5)`);
    const red = JSON.stringify(s.responseRedactions);
    for (const k of NEVER) if (red.includes(k)) bad(`a redaction reveals ${k}`);
  }
}

if (process.argv.includes("--init")) {
  console.log("\nsession init (app id + secret):");
  const id = env.RECLAIM_PROVIDER_ID_BAND1 || env.RECLAIM_PROVIDER_ID;
  if (!env.RECLAIM_APP_ID || !env.RECLAIM_APP_SECRET || !id) bad("RECLAIM_APP_ID / RECLAIM_APP_SECRET / provider id missing");
  else {
    try {
      const req = await ReclaimProofRequest.init(env.RECLAIM_APP_ID, env.RECLAIM_APP_SECRET, id);
      req.setContext("0x0000000000000000000000000000000000000000", "0x" + "00".repeat(31) + "01");
      const url = await req.getRequestUrl();
      ok(`session ${req.getSessionId()} -> ${new URL(url).origin}`);
    } catch {
      bad("ReclaimProofRequest.init failed (app id/secret pair, or provider not added to the app)");
    }
  }
}

console.log(failed ? "\nRESULT: FAIL" : "\nRESULT: OK");
process.exit(failed ? 1 : 0);
