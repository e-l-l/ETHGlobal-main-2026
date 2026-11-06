/**
 * Merchant-facing English for the reason codes in a Decision's `redline_hits` (POST /offers → result "rejected").
 * The red-line texts mirror agents/src/mra_agents/redlines.py MESSAGES["en"]; the human_* codes are the World ID
 * eligibility checks (one proven human per shop, defaulters banned on all their shops, one open advance per human).
 */
import type { RedlineCode } from "./api/types.js";

export const REASON_MESSAGES: Record<string, string> = {
  few_payers:
    "In the last 30 days your sales came from fewer than 5 different customers. Keep selling through your link to more customers, then try again.",
  payer_concentration:
    "More than 40% of your sales in the last 30 days came from a single customer. We need sales spread across more customers before we can offer an advance.",
  circular_funding:
    "Some of your sales were paid with money that came from your own payout account or from one shared source. We can only count sales from independent customers.",
  few_active_days: "You sold on fewer than 7 of the last 30 days. Sell through your link on more days, then try again.",
  sales_spike:
    "Your sales in the last 3 days were more than 4 times your usual pace. We'll look again once your sales settle. Try again in about a week.",
  payer_velocity: "Too many first-time customers paid you in a short time. We'll look again once your sales settle.",
  human_not_verified: "Verify you're a unique human with World ID first.",
  // Also the World ID stop-screen copy (onboarding.checkHuman, before any business step).
  human_banned: "This World ID can't borrow on DripMoni after a default.",
  human_has_open_advance: "Repay your open advance first.",
};

/** Plain English for one reason code; unknown codes come back as readable words ("some_code" → "some code"). */
export function reasonMessage(code: RedlineCode): string {
  return REASON_MESSAGES[code] ?? String(code).replace(/_/g, " ");
}

export function reasonMessages(codes: readonly RedlineCode[]): string[] {
  return codes.map(reasonMessage);
}
