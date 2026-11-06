import { describe, expect, it } from "vitest";
import { ETA_MIN_SALES, etaFrom } from "../src/domains/merchant.js";
import { coveragePct, coverageStr } from "../src/domains/util.js";

const DAY = 86_400;
const now = 1_800_000_000;

describe("days-left estimate", () => {
  it("gives no estimate from fewer than 3 sales (one $1 sale is not a pace)", () => {
    expect(ETA_MIN_SALES).toBe(3);
    expect(etaFrom(115, [{ at: now - 60, repay: 0.1 }], now, 0)).toBe(0);
    expect(etaFrom(115, [{ at: now - 60, repay: 0.1 }, { at: now - 120, repay: 0.1 }], now, 23)).toBe(23);
  });

  it("uses the last 7 days' pace once there are enough sales", () => {
    const sales = [1, 2, 3, 4].map((d) => ({ at: now - d * DAY, repay: 7 }));
    expect(etaFrom(70, sales, now, 0)).toBe(18); // $28 a week → $4/day → 70/4
    expect(etaFrom(70, [...sales, { at: now - 9 * DAY, repay: 100 }], now, 0)).toBe(18); // older than 7 days: ignored
  });
});

describe("junior coverage", () => {
  const usd = (n: number) => BigInt(n * 1_000_000);
  it("is (junior + reserve) / outstanding", () => {
    expect(coveragePct(usd(42_000), usd(8_400), usd(248_000))).toBeCloseTo(20.32, 2);
    expect(coverageStr(coveragePct(usd(42_000), usd(8_400), usd(248_000)))).toBe("20.3%");
  });
  it("has no value with nothing outstanding, and caps the display", () => {
    expect(coverageStr(coveragePct(usd(10_000), 0n, 0n))).toBe("—");
    expect(coverageStr(coveragePct(usd(10_000), 0n, usd(100)))).toBe(">999%");
  });
});
