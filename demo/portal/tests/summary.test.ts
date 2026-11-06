import { describe, expect, it } from "vitest";
import { loadAccounts, validateAccount, type Account } from "@/lib/accounts";
import {
  ageOk,
  bandGe,
  buildSummary,
  monthsBetween,
  revenueBand,
  serializeSummary,
  subtractMonths,
} from "@/lib/summary";
import { dailyTotals } from "@/lib/ledger";

const NOW = new Date("2026-11-05T12:00:00Z");

describe("revenue bands (monthly average over 90 days)", () => {
  // band 1 = $500/mo -> 150_000 cents / 90d; band 2 = $2,000/mo -> 600_000; band 3 = $10,000/mo -> 3_000_000
  it.each([
    [1, 149_999, false],
    [1, 150_000, true],
    [2, 599_999, false],
    [2, 600_000, true],
    [3, 2_999_999, false],
    [3, 3_000_000, true],
  ] as const)("band_ge_%i at %i cents = %s", (band, cents, expected) => {
    expect(bandGe(band, cents)).toBe(expected);
  });

  it("revenueBand picks the highest band reached", () => {
    expect(revenueBand(0)).toBe(0);
    expect(revenueBand(149_999)).toBe(0);
    expect(revenueBand(150_000)).toBe(1);
    expect(revenueBand(600_000)).toBe(2);
    expect(revenueBand(3_000_000)).toBe(3);
  });
});

describe("account age", () => {
  it("counts whole calendar months, at the boundary", () => {
    const opened = new Date("2026-05-05T12:00:00Z");
    expect(monthsBetween(opened, NOW)).toBe(6);
    expect(ageOk(monthsBetween(opened, NOW))).toBe(true);
    const oneSecondLater = new Date("2026-05-05T12:00:01Z");
    expect(monthsBetween(oneSecondLater, NOW)).toBe(5);
    expect(ageOk(5)).toBe(false);
    expect(ageOk(6)).toBe(true);
  });

  it("handles month-end and year boundaries", () => {
    expect(monthsBetween(new Date("2026-01-31T00:00:00Z"), new Date("2026-02-28T00:00:00Z"))).toBe(0);
    expect(monthsBetween(new Date("2025-12-15T00:00:00Z"), new Date("2026-06-15T00:00:00Z"))).toBe(6);
    expect(monthsBetween(new Date("2027-01-01T00:00:00Z"), NOW)).toBe(0); // future -> clamp 0
    expect(subtractMonths(new Date("2026-03-31T00:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("relative seeds stay stable on awkward dates", () => {
    const a = { ...loadAccounts()[0], opened_months_ago: 6 };
    for (const d of ["2026-03-31T00:00:00Z", "2026-01-01T00:00:00Z", "2028-02-29T23:59:59Z"]) {
      expect(buildSummary(a, new Date(d)).account_age_months).toBe(6);
    }
  });
});

describe("seeded accounts produce the expected predicates", () => {
  const expected: Record<string, [string, string, number, boolean, boolean, boolean, boolean]> = {
    // business name: status, country, age months, age_ok, band_ge_1, band_ge_2, band_ge_3
    "Kiosco Don Pepe": ["active", "AR", 20, true, true, true, false],
    "Mama Nkechi Provisions": ["active", "NG", 14, true, true, false, false],
    "Duka la Wanjiru": ["active", "KE", 31, true, true, true, true],
    "New Shop": ["active", "AR", 2, false, true, false, false],
    "Suspended Store": ["suspended", "NG", 26, true, true, true, false],
  };

  it("has exactly the five seeded accounts", () => {
    expect(loadAccounts().map((a) => a.business_name).sort()).toEqual(Object.keys(expected).sort());
  });

  for (const [name, [status, country, months, age, b1, b2, b3]] of Object.entries(expected)) {
    it(name, () => {
      const a = loadAccounts().find((x) => x.business_name === name)!;
      const s = buildSummary(a, NOW);
      expect(s).toMatchObject({ status, country, account_age_months: months, age_ok: age, band_ge_1: b1, band_ge_2: b2, band_ge_3: b3 });
    });
  }

  it("Kiosco Don Pepe serializes to the exact documented body", () => {
    const a = loadAccounts().find((x) => x.business_name === "Kiosco Don Pepe")!;
    expect(serializeSummary(buildSummary(a, NOW))).toBe(
      '{"v":1,"status":"active","country":"AR","age_ok":true,"band_ge_1":true,"band_ge_2":true,"band_ge_3":false,' +
        '"account_age_months":20,"revenue_90d_cents":1234567,"currency":"USD","account_id":"acc_18bf65eab2bc1711af938e15a335f20c","business_name":"Kiosco Don Pepe"}',
    );
  });

  it("dashboard daily totals sum exactly to revenue_90d_cents", () => {
    for (const a of loadAccounts()) {
      expect(dailyTotals(a, NOW).reduce((s, d) => s + d.cents, 0)).toBe(a.revenue_90d_cents);
    }
  });
});

describe("summary hardening", () => {
  it("key order is fixed and sensitive fields come last", () => {
    const keys = Object.keys(buildSummary(loadAccounts()[0], NOW));
    expect(keys).toEqual([
      "v", "status", "country", "age_ok", "band_ge_1", "band_ge_2", "band_ge_3",
      "account_age_months", "revenue_90d_cents", "currency", "account_id", "business_name",
    ]);
  });

  it("a hostile business name cannot forge a predicate token", () => {
    const base = loadAccounts().find((x) => x.business_name === "New Shop")!;
    const evil: Account = { ...base, business_name: 'x","age_ok":true,"band_ge_3":true,"status":"active",' };
    const body = serializeSummary(buildSummary(evil, NOW));
    expect(body.match(/"age_ok":true,/g)).toBeNull();
    expect(body.match(/"band_ge_3":true,/g)).toBeNull();
    expect(body.match(/"status":"active",/g)?.length).toBe(1); // only the real field
  });

  it("validation rejects bad accounts", () => {
    const ok = loadAccounts()[0];
    expect(() => validateAccount({ ...ok, country: "ar" })).toThrow();
    expect(() => validateAccount({ ...ok, status: "pending" })).toThrow();
    expect(() => validateAccount({ ...ok, id: "123" })).toThrow();
    expect(() => validateAccount({ ...ok, business_name: "a\nb" })).toThrow();
    expect(() => validateAccount({ ...ok, revenue_90d_cents: 1.5 })).toThrow();
  });
});
