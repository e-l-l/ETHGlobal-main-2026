/**
 * Every screen link goes through here. One table, one place to move a route.
 *
 *   /            landing page (marketing, reserved)
 *   /home        web-app entry: pick merchant, lender or the public dashboard
 *   /onboarding  merchant sign-up (welcome → prove → verifying → pass → shop → world-id)
 *   /merchant    the merchant app after sign-up
 *   /pay         what a customer sees
 *   /portal      demo seller portal the private check reads from
 *   /earn …      lenders (the vault), /dripcoin (DRIP, first loss), public dashboard
 */
export const routes = {
  landing: "/",
  /** The first landing page (feat/landing-page), kept for reference. */
  oldLanding: "/old-landing",
  home: "/home",
  blockPattern: "/block-pattern",

  /* Merchant onboarding */
  welcome: "/onboarding",
  prove: "/onboarding/prove",
  verifying: "/onboarding/verifying",
  pass: "/onboarding/pass",
  failed: "/onboarding/failed",
  shop: "/onboarding/shop",
  /** After the shop exists: prove a unique human with World ID (verifyHuman needs the shop id). */
  worldId: "/onboarding/world-id",

  /* Merchant app */
  merchant: "/merchant",
  advance: {
    details: "/merchant/advance",
    arrived: "/merchant/advance/arrived",
  },
  week: "/merchant/week",
  agent: {
    log: "/merchant/agent",
    manage: "/merchant/agent/manage",
    setup: "/merchant/agent/setup",
    approve: "/merchant/agent/approve",
    denied: "/merchant/agent/denied",
  },
  repaid: "/merchant/repaid",
  cashOut: "/merchant/cash-out",
  worldView: "/merchant/world-view",
  myQr: "/merchant/qr",
  /** World ID can't borrow (banned), or ?reason=open_advance. */
  blocked: "/merchant/blocked",
  /** Local currency and other device settings. */
  settings: "/merchant/settings",
  /** Back up this device's passes with World ID + a passphrase. */
  backup: "/merchant/settings/backup",
  /** New device: restore the passes from a World ID backup. */
  restore: "/merchant/restore",

  /* Customer */
  pay: "/pay/corner-kiosk",
  paid: "/pay/corner-kiosk/paid",

  /* Demo seller portal */
  portalLogin: "/portal/login",
  portal: "/portal",

  /* Lenders and public */
  earn: "/earn",
  deposit: "/earn/deposit",
  position: "/earn/position",
  dripcoin: "/dripcoin",
  mint: "/dripcoin/mint",
  trade: "/dripcoin/trade",
  protocol: "/protocol",
  risk: "/risk",
  explorer: "/explorer",
  simulator: "/simulator",

  /* Dev */
  screens: "/screens",
  kit: "/final/components",
} as const;

export type FailReason = "too-new" | "suspended" | "revenue-low";

export function isFailReason(value: string | undefined): value is FailReason {
  return value === "too-new" || value === "suspended" || value === "revenue-low";
}

/** M09 with a reason: `expired` when the World approval timed out. */
export function agentDeniedHref(reason?: "expired") {
  return reason ? `${routes.agent.denied}?reason=${reason}` : routes.agent.denied;
}

export type BlockedReason = "banned" | "open_advance";

export function blockedHref(reason: BlockedReason = "banned") {
  return reason === "open_advance" ? `${routes.blocked}?reason=open_advance` : routes.blocked;
}

/** Where a World ID red line (POST /offers `redline_hits`, or a setup error code) sends the merchant; undefined for others. */
export function redlineHref(code: string | undefined): string | undefined {
  if (code === "human_not_verified") return routes.worldId;
  if (code === "human_banned") return blockedHref("banned");
  if (code === "human_has_open_advance") return blockedHref("open_advance");
  return undefined;
}

export function failedHref(reason: FailReason) {
  return `${routes.failed}?reason=${reason}`;
}

/** The proof screen, ending in a pass or in one of the failures. */
export function verifyingHref(outcome?: FailReason) {
  return outcome ? `${routes.verifying}?outcome=${outcome}` : routes.verifying;
}
