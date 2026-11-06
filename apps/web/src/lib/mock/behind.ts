import type { AdvanceVM, HumanLimitVM } from "@repo/sdk";

/*
 * Demo-only "behind the weekly minimum" state, for previewing the late-fee screens in mock mode
 * (`?demo=behind` on /merchant and /merchant/advance). Never used in live modes: live data carries its own
 * `isBehind`, `lateFee` and `lateFeeHint` from the contract.
 */

export const BEHIND_LATE_FEE = 0.4;

export function behindAdvance(a: AdvanceVM): AdvanceVM {
  const late = BEHIND_LATE_FEE;
  return {
    ...a,
    isBehind: true,
    lateFee: late,
    lateFeePaid: 0,
    owedNow: a.owedNow + late,
    total: a.total + late,
    left: a.left + late,
    lateFeeHint: "You're behind this week's minimum. Your fee is 1% a week until sales catch you up.",
  };
}

/** Applies the behind state to any view that carries an advance (and pauses the unlock). */
export function withBehind<V extends { advance: AdvanceVM | null } & Partial<HumanLimitVM>>(view: V): V {
  if (!view.advance) return view;
  return { ...view, advance: behindAdvance(view.advance), nextUnlockAt: view.nextUnlockAt === undefined ? undefined : null };
}

export function isBehindDemo(demo: string | string[] | undefined): boolean {
  return demo === "behind";
}
