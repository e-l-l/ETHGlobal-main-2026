/**
 * Every in-app link reads from here, so cross-links between Person A's and
 * Person B's screens work before the target page exists.
 */
export const routes = {
  /* Person B: onboarding */
  welcome: "/",
  onboarding: {
    prove: "/onboarding/prove",
    verifying: "/onboarding/verifying",
    pass: "/onboarding/pass",
    failed: "/onboarding/failed",
    shop: "/onboarding/shop",
  },

  /* Person A: merchant app */
  home: "/home",
  advance: {
    details: "/advance",
    arrived: "/advance/arrived",
  },
  week: "/week",
  agent: {
    log: "/agent",
    manage: "/agent/manage",
    setup: "/agent/setup",
    approve: "/agent/approve",
    denied: "/agent/denied",
  },
  repaid: "/repaid",
  cashOut: "/cash-out",
  worldView: "/world-view",
  /* No dedicated QR screen yet: My QR shows the shop + QR screen (M06). */
  myQr: "/onboarding/shop",

  /* Person B: customer pay */
  pay: {
    index: "/pay/corner-kiosk",
    paid: "/pay/corner-kiosk/paid",
  },

  /* Person B: demo seller portal */
  portal: {
    login: "/portal/login",
    dashboard: "/portal",
  },

  /* Person B: lenders + public */
  earn: {
    index: "/earn",
    deposit: "/earn/deposit",
    position: "/earn/position",
  },
  junior: {
    index: "/junior",
    mint: "/junior/mint",
    trade: "/junior/trade",
  },
  protocol: "/protocol",
  risk: "/risk",
  explorer: "/explorer",
} as const;
