import { describe, expect, it } from "vitest";
import { loadAccounts } from "@/lib/accounts";
import { buildSummary, serializeSummary } from "@/lib/summary";
import { NEVER_REVEALED_KEYS, PREDICATE_REGEX, countryExact, providerConfig } from "@/lib/reclaim";

const NOW = new Date("2026-11-05T12:00:00Z");
const bodies = Object.fromEntries(loadAccounts().map((a) => [a.business_name, serializeSummary(buildSummary(a, NOW))]));

function captureGroups(re: string): number {
  return new RegExp(`${re}|`).exec("")!.length - 1;
}

describe("Reclaim response matches against every seeded account", () => {
  const cases: Record<string, Partial<Record<keyof typeof PREDICATE_REGEX, boolean>>> = {
    "Kiosco Don Pepe": { active: true, age_ok: true, country_allowed: true, band_ge_1: true, band_ge_2: true, band_ge_3: false },
    "Mama Nkechi Provisions": { active: true, age_ok: true, country_allowed: true, band_ge_1: true, band_ge_2: false, band_ge_3: false },
    "Duka la Wanjiru": { active: true, age_ok: true, country_allowed: true, band_ge_1: true, band_ge_2: true, band_ge_3: true },
    "New Shop": { active: true, age_ok: false, country_allowed: true, band_ge_1: true, band_ge_2: false, band_ge_3: false },
    "Suspended Store": { active: false, age_ok: true, country_allowed: true, band_ge_1: true, band_ge_2: true, band_ge_3: false },
  };
  for (const [name, preds] of Object.entries(cases)) {
    it(name, () => {
      for (const [k, want] of Object.entries(preds)) {
        expect(new RegExp(PREDICATE_REGEX[k as keyof typeof PREDICATE_REGEX]).test(bodies[name]), `${name} ${k}`).toBe(want);
      }
    });
  }

  it("demo story: Don Pepe passes the band-2 provider; New Shop and Suspended Store fail it", () => {
    const allMatch = (body: string, band: 1 | 2 | 3) =>
      providerConfig("https://x", band).responseMatches.every((m) => new RegExp(m.value).test(body));
    expect(allMatch(bodies["Kiosco Don Pepe"], 2)).toBe(true);
    expect(allMatch(bodies["Mama Nkechi Provisions"], 1)).toBe(true);
    expect(allMatch(bodies["Mama Nkechi Provisions"], 2)).toBe(false);
    expect(allMatch(bodies["Duka la Wanjiru"], 3)).toBe(true);
    expect(allMatch(bodies["New Shop"], 1)).toBe(false); // age
    expect(allMatch(bodies["Suspended Store"], 1)).toBe(false); // status
  });

  it("per-country exact matches work", () => {
    expect(new RegExp(countryExact("AR")).test(bodies["Kiosco Don Pepe"])).toBe(true);
    expect(new RegExp(countryExact("NG")).test(bodies["Kiosco Don Pepe"])).toBe(false);
  });

  it("an unlisted country fails the allowed-list match", () => {
    expect(new RegExp(PREDICATE_REGEX.country_allowed).test(bodies["Kiosco Don Pepe"].replace('"AR"', '"BR"'))).toBe(false);
  });
});

describe("redactions reveal predicates only", () => {
  it("no regex has a capture group (nothing gets extracted into public context)", () => {
    for (const re of Object.values(PREDICATE_REGEX)) expect(captureGroups(re), re).toBe(0);
  });

  it("each revealed span is exactly a predicate token and never touches a sensitive field", () => {
    for (const band of [1, 2, 3] as const) {
      const cfg = providerConfig("https://x", band);
      for (const [name, body] of Object.entries(bodies)) {
        const account = loadAccounts().find((a) => a.business_name === name)!;
        for (const { regex } of cfg.responseRedactions) {
          for (const m of body.matchAll(new RegExp(regex, "g"))) {
            const span = m[0];
            for (const k of NEVER_REVEALED_KEYS) expect(span).not.toContain(k);
            expect(span).not.toContain(account.id);
            expect(span).not.toContain(account.business_name);
            expect(span).not.toContain(String(account.revenue_90d_cents));
          }
        }
      }
    }
  });

  it("every match is covered by a redaction (so matches run on revealed text)", () => {
    const cfg = providerConfig("https://x", 2);
    expect(cfg.responseRedactions.map((r) => r.regex)).toEqual(cfg.responseMatches.map((m) => m.value));
  });
});
