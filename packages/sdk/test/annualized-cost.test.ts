import { describe, expect, it } from "vitest";
import { annualizedCost } from "../src/domains/util.js";

describe("annualized flat-fee cost", () => {
  it("uses the same repayment duration and increases for faster repayment", () => {
    expect(annualizedCost(100, 15, 30)).toBeCloseTo(182.5);
    expect(annualizedCost(100, 15, 60)).toBeCloseTo(91.25);
    expect(annualizedCost(100, 15, 0)).toBeUndefined();
  });
});
