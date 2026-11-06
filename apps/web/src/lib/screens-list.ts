import { failedHref, routes, verifyingHref, worldIdStoppedHref } from "@/lib/routes";

export type ScreenItem = { id: string; title: string; href: string };

/** Every route with its canvas ID. Shared by /screens and the /screenshots capture. */
export const SCREEN_GROUPS: { group: string; screens: ScreenItem[] }[] = [
  { group: "Entry", screens: [{ id: "—", title: "Home hub", href: routes.home }] },
  {
    group: "Merchant onboarding",
    screens: [
      { id: "M01", title: "Welcome", href: routes.welcome },
      { id: "M01a", title: "World ID first", href: routes.worldId },
      { id: "M01b", title: "World ID stopped: banned", href: worldIdStoppedHref("human_banned") },
      { id: "M01c", title: "World ID stopped: open advance", href: worldIdStoppedHref("human_has_open_advance") },
      { id: "M02", title: "Prove your business", href: routes.prove },
      { id: "M03", title: "Verifying", href: verifyingHref() },
      { id: "M04", title: "Business Pass", href: routes.pass },
      { id: "M05", title: "Verification failed", href: failedHref("too-new") },
      { id: "M06", title: "Create your shop", href: routes.shop },
    ],
  },
  {
    group: "Merchant app",
    screens: [
      { id: "M07", title: "Agent setup", href: routes.agent.setup },
      { id: "M08", title: "Approve", href: routes.agent.approve },
      { id: "M09", title: "Agent denied", href: routes.agent.denied },
      { id: "M10", title: "Dashboard", href: routes.merchant },
      { id: "M11", title: "Advance arrived", href: routes.advance.arrived },
      { id: "M12", title: "Advance details", href: routes.advance.details },
      { id: "M13", title: "Bad week", href: routes.week },
      { id: "M14", title: "Agent log", href: routes.agent.log },
      { id: "M15", title: "Manage agent", href: routes.agent.manage },
      { id: "M16", title: "Repaid", href: routes.repaid },
      { id: "M18", title: "Cash out", href: routes.cashOut },
      { id: "M19", title: "Settings", href: routes.settings },
      { id: "M20", title: "Back up passes", href: routes.backup },
      { id: "M21", title: "Restore on a new device", href: routes.restore },
      { id: "P01", title: "My QR", href: routes.myQr },
      { id: "P01", title: "World view", href: routes.worldView },
    ],
  },
  {
    group: "Customer",
    screens: [
      { id: "C01", title: "Scan and pay", href: routes.pay },
      { id: "C02", title: "Paid", href: routes.paid },
    ],
  },
  {
    group: "Demo seller portal",
    screens: [
      { id: "S01", title: "Portal login", href: routes.portalLogin },
      { id: "S02", title: "Portal dashboard", href: routes.portal },
    ],
  },
  {
    group: "Lenders",
    screens: [
      { id: "L01", title: "Vault", href: routes.earn },
      { id: "L02", title: "Deposit or withdraw", href: routes.deposit },
      { id: "L03", title: "My position", href: routes.position },
      { id: "J01", title: "DripCoin", href: routes.dripcoin },
      { id: "J02", title: "Mint or redeem DRIP", href: routes.mint },
      { id: "J03", title: "Trade DRIP", href: routes.trade },
    ],
  },
  {
    group: "Public",
    screens: [
      { id: "P02", title: "Protocol", href: routes.protocol },
      { id: "P03", title: "Risk status", href: routes.risk },
      { id: "P04", title: "Explorer", href: routes.explorer },
    ],
  },
];
