import { describe, expect, it } from "vitest";
import { bizLeaf, TAG_BIZ } from "../src/leaf.js";

// The issuer must recompute the SAME leaf as the circuit (circuits/business_pass/src/main.nr), the SDK
// (packages/sdk credentials.ts businessLeaf) and agents zk.py: Poseidon2([TAG_BIZ, h, country, band, age_ok]).
// Vector from agents zk.business_leaf_from_h(123456789, 32, 2, 1) (the Python reference implementation).
describe("bizLeaf matches the circuit's 5-input leaf", () => {
  it("cross-language vector", async () => {
    expect(TAG_BIZ).toBe(0x104d2fb8aab0b467b4fb9269b2395a660fe2b557eb266091aa8e601ccb1a6f8bn);
    expect(await bizLeaf(123456789n, 32, 2, 1)).toBe(0xf7926a8738e19fe40783f6f3ca9156153df58f729f244904ba768f55b20d0can);
  });
});
