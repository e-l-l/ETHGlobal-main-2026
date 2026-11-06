import { describe, expect, it } from "vitest";
import type { AdvanceOnchain } from "../src/chain/chain.js";
import { advanceVM, feeRuleCopy, lateFeeHint } from "../src/domains/merchant.js";

const COPY =
  "Paying on time keeps your fee at 0.5% a week, max 3%. If you fall behind the minimum, the fee doubles to 1% a week (max 6% total) until you catch up; the extra goes to the safety reserve.";

const base: AdvanceOnchain = {
  id: 1n, shopId: "0x00", principal: 100_000_000n, totalOwed: 103_000_000n, repaid: 0n, principalRepaid: 0n,
  feePaid: 0n, feeSoFar: 1_500_000n, feeRateBpsPerWeek: 50, feeCapBps: 300, holdbackBps: 800, tier: 0,
  lastSaleAt: 0n, status: 1, credentialClaimed: false,
};

describe("late-fee step-up in AdvanceVM", () => {
  it("exact merchant copy", () => {
    expect(feeRuleCopy()).toBe(COPY);
    expect(feeRuleCopy(50, 300)).toBe(COPY);
  });

  it("on time: no late fee, no hint, owedNow unchanged", () => {
    const vm = advanceVM({ ...base, owedNow: 101_500_000n, lateFee: 0n, lateFeePaid: 0n, isBehind: false }, undefined, "stock", 10, 0);
    expect(vm).toMatchObject({ lateFee: 0, lateFeePaid: 0, isBehind: false, lateFeeHint: null, owedNow: 101.5, feeRule: COPY });
    expect(vm.lateFeeRateBpsPerWeek).toBe(50);
    expect(vm.maxLateFeeBps).toBe(300);
  });

  it("behind: late fee shown, owedNow (from owedOf) includes it", () => {
    // 3 weeks, never repaid: fee 1.5 + late 1.0 (2 weeks behind)
    const vm = advanceVM({ ...base, owedNow: 102_500_000n, lateFee: 1_000_000n, lateFeePaid: 0n, isBehind: true }, undefined, "stock", 10, 0);
    expect(vm.lateFee).toBe(1);
    expect(vm.isBehind).toBe(true);
    expect(vm.owedNow).toBe(102.5);
    expect(vm.feeSoFar).toBe(1.5);
    expect(vm.lateFeeHint).toContain("1% a week until you catch up");
  });

  it("caught up: hint says it stopped; older chain fakes without late fields read as on time", () => {
    expect(lateFeeHint(0.5, false)).toBe("You're back on time: the late fee stopped at $0.50. It goes to the safety reserve.");
    const legacy = advanceVM({ ...base, owedNow: 101_500_000n }, undefined, "stock", 10, 0);
    expect(legacy).toMatchObject({ lateFee: 0, isBehind: false, lateFeeHint: null });
  });
});
