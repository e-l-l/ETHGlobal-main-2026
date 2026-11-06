/**
 * Every screen link goes through here, so a route can be empty
 * and the other person's buttons still point at the right place.
 *
 * Welcome is the app front door at "/". Onboarding follows the work-split.md paths (/onboarding/…).
 */
export const routes = {
  welcome: "/",
  prove: "/onboarding/prove",
  verifying: "/onboarding/verifying",
  pass: "/onboarding/pass",
  failed: "/onboarding/failed",
  shop: "/onboarding/shop",

  pay: "/pay/corner-kiosk",
  paid: "/pay/corner-kiosk/paid",

  portalLogin: "/portal/login",
  portal: "/portal",

  earn: "/earn",
  deposit: "/earn/deposit",
  position: "/earn/position",
  junior: "/junior",
  mint: "/junior/mint",
  trade: "/junior/trade",
  protocol: "/protocol",
  risk: "/risk",
  explorer: "/explorer",

  screens: "/screens",
  kit: "/dev/components",
  kit2: "/dev2/components",

  /** Person A. Linked before those screens exist. */
  agentSetup: "/agent/setup",
  home: "/home",
  worldView: "/world-view",
} as const;

export type FailReason = "too-new" | "suspended" | "revenue-low";

export function isFailReason(value: string | undefined): value is FailReason {
  return value === "too-new" || value === "suspended" || value === "revenue-low";
}

export function failedHref(reason: FailReason) {
  return `${routes.failed}?reason=${reason}`;
}

/** The proof screen, ending in a pass or in one of the failures. */
export function verifyingHref(outcome?: FailReason) {
  return outcome ? `${routes.verifying}?outcome=${outcome}` : routes.verifying;
}
