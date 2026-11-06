/** COPIED from apps/web/src/lib/routes.ts (route table only). Source of truth stays in apps/web. */
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
  myQr: "/qr",
} as const;

export type FailReason = "too-new" | "suspended" | "revenue-low";
