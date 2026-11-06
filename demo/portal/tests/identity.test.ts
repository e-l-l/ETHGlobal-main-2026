import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { ID_RE, loadAccounts, resetAccountCache, validateAccount } from "@/lib/accounts";
import { buildSummary, serializeSummary } from "@/lib/summary";
import {
  ISSUER_ACCOUNT_ID_REDACTION,
  ISSUER_ACCOUNT_ID_REGEX,
  PREDICATE_REGEX,
  extractAccountId,
  issuerProviderConfig,
  providerConfig,
} from "@/lib/reclaim";

const NOW = new Date("2026-11-05T12:00:00Z");

/** Shannon entropy of the hex chars, in bits per symbol (max 4 for hex). */
function hexEntropyBits(hex: string): number {
  const freq = new Map<string, number>();
  for (const c of hex) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) h -= (n / hex.length) * Math.log2(n / hex.length);
  return h;
}

describe("account_id is opaque, high-entropy and stable", () => {
  const accounts = loadAccounts();

  it("every id is acc_ + 128 bits of hex", () => {
    for (const a of accounts) {
      expect(a.id).toMatch(ID_RE);
      expect(a.id.length - 4).toBe(32); // 32 hex = 128 bits
    }
  });

  it("ids look random: high symbol entropy, no long runs, unique, not sequential", () => {
    const hexes = accounts.map((a) => a.id.slice(4));
    expect(new Set(hexes).size).toBe(hexes.length);
    for (const h of hexes) {
      expect(hexEntropyBits(h), h).toBeGreaterThan(3.0); // uniform random 32-hex averages ~3.5
      expect(h).not.toMatch(/(.)\1{4,}/);
    }
    // not sequential: no two ids differ by a small integer
    const nums = hexes.map((h) => BigInt("0x" + h)).sort((x, y) => (x < y ? -1 : 1));
    for (let i = 1; i < nums.length; i++) expect(nums[i] - nums[i - 1] > 1n << 64n).toBe(true);
  });

  it("validation rejects low-entropy / legacy formats", () => {
    const base = { ...accounts[0], email: "x@example.com" };
    for (const bad of ["acc_1", "acc_AR7KDP2024", "acc_00000000000000000000000000000001".slice(0, 20), "1", "acc_" + "G".repeat(32), "acc_" + "A".repeat(32)]) {
      expect(() => validateAccount({ ...base, id: bad }), bad).toThrow(/128 random bits/);
    }
  });

  it("is stable: same id across reloads and across summaries over time", () => {
    const before = accounts.map((a) => a.id);
    resetAccountCache();
    expect(loadAccounts().map((a) => a.id)).toEqual(before);
    for (const a of loadAccounts()) {
      const ids = ["2026-11-05T12:00:00Z", "2027-06-01T00:00:00Z"].map((d) => JSON.parse(serializeSummary(buildSummary(a, new Date(d)))).account_id);
      expect(ids).toEqual([a.id, a.id]);
    }
  });

  it("the nullifier HMAC(pepper, account_id) is stable per business and distinct across businesses", () => {
    const pepper = "test-pepper";
    const nul = (id: string) => createHmac("sha256", pepper).update(id).digest("hex");
    const ns = loadAccounts().map((a) => nul(extractAccountId(serializeSummary(buildSummary(a, NOW)))!));
    expect(new Set(ns).size).toBe(ns.length);
    expect(ns).toEqual(loadAccounts().map((a) => nul(a.id)));
  });
});

describe("issuer-only match set (set 2)", () => {
  it("extracts exactly the account_id from each seeded body", () => {
    for (const a of loadAccounts()) {
      expect(extractAccountId(serializeSummary(buildSummary(a, NOW)))).toBe(a.id);
    }
  });

  it("has exactly one named capture group; the public set has none", () => {
    expect(new RegExp(`${ISSUER_ACCOUNT_ID_REGEX}|`).exec("")!.length - 1).toBe(1);
    const pub = providerConfig("https://x", 2);
    for (const m of pub.responseMatches) expect(m.value).not.toMatch(/\((?!\?:)/);
    expect(JSON.stringify(pub)).not.toContain("account_id");
  });

  it("cannot be forged through business_name (inner quotes are escaped)", () => {
    const a = loadAccounts()[0];
    const evil = { ...a, business_name: `x","account_id":"acc_${"f".repeat(32)}","y":"` };
    const body = serializeSummary(buildSummary(evil, NOW));
    expect(extractAccountId(body)).toBe(a.id);
    expect([...body.matchAll(new RegExp(ISSUER_ACCOUNT_ID_REDACTION, "g"))]).toHaveLength(1);
  });

  it("the issuer redaction reveals only the account_id token, not the name or numbers", () => {
    for (const a of loadAccounts()) {
      const [m] = serializeSummary(buildSummary(a, NOW)).match(new RegExp(ISSUER_ACCOUNT_ID_REDACTION))!;
      expect(m).toBe(`"account_id":"${a.id}",`);
    }
  });

  it("the issuer provider = public predicates + extraction, bound in one proof", () => {
    const pub = providerConfig("https://x", 2);
    const iss = issuerProviderConfig("https://x", 2);
    expect(iss.url).toBe(pub.url);
    expect(iss.responseMatches.slice(0, pub.responseMatches.length)).toEqual(pub.responseMatches);
    expect(iss.responseMatches.at(-1)!.value).toBe(ISSUER_ACCOUNT_ID_REGEX);
    expect(iss.responseRedactions.at(-1)!.regex).toBe(ISSUER_ACCOUNT_ID_REDACTION);
    const don = loadAccounts().find((a) => a.business_name === "Kiosco Don Pepe")!;
    const body = serializeSummary(buildSummary(don, NOW));
    expect(iss.responseMatches.every((m) => new RegExp(m.value).test(body))).toBe(true);
    expect(new RegExp(PREDICATE_REGEX.band_ge_3).test(body)).toBe(false);
  });
});
