import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parsePepper } from "../src/config.js";
import { businessNullifier, P } from "../src/nullifier.js";
import { TEST_PEPPER } from "./helpers.js";

const pepper = parsePepper(TEST_PEPPER);
const DON = "acc_18bf65eab2bc1711af938e15a335f20c";
const NKE = "acc_cd2d56357e003e6dd777d43f04a601f9";

describe("businessNullifier", () => {
  it("is deterministic: the same account always gives the same nullifier", () => {
    expect(businessNullifier(pepper, DON)).toBe(businessNullifier(pepper, DON));
    expect(businessNullifier(parsePepper(TEST_PEPPER), DON)).toBe(businessNullifier(pepper, DON));
  });

  it("differs per account and per pepper", () => {
    expect(businessNullifier(pepper, DON)).not.toBe(businessNullifier(pepper, NKE));
    expect(businessNullifier(parsePepper("0x" + "22".repeat(32)), DON)).not.toBe(businessNullifier(pepper, DON));
  });

  it("equals HMAC-SHA256(pepper, id) mod P (independent recomputation) and is in the field", () => {
    const want = BigInt("0x" + createHmac("sha256", Buffer.alloc(32, 0x11)).update(DON).digest("hex")) % P;
    const got = businessNullifier(pepper, DON);
    expect(got).toBe(want);
    expect(got > 0n && got < P).toBe(true);
    // Pinned vector (pepper = 0x11 * 32, id = Don Pepe's fictional demo id).
    expect("0x" + got.toString(16).padStart(64, "0")).toMatchInlineSnapshot(`"0x0e0bcebbf3b835501d7fcd11a9cb2a68b2ba12f2075c6eef9ce44061fc324de5"`);
  });

  it("rejects short peppers", () => {
    expect(() => parsePepper("0x" + "11".repeat(16))).toThrow(/32 bytes/);
    expect(() => parsePepper("short")).toThrow(/32 bytes/);
  });
});
