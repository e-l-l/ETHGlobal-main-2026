/**
 * Every screen's SDK read, named once. Server pages pass one to `serverView()` and the client screen passes the
 * same one to `useMRA()`, so both sides always ask for the same thing. The README's screen → method table, in code.
 */
import type { MRA } from "./mra";

export type AgentLimitsInput = { perAdvance: number; perMonth: number; purpose?: string };

export const q = {
  /* merchant app */
  home: (m: MRA) => m.merchant.home(), // M10
  arrived: (m: MRA) => m.merchant.arrived(), // M11
  advance: (m: MRA) => m.merchant.advance(), // M12
  week: (m: MRA) => m.merchant.week(), // M13
  repaid: (m: MRA) => m.merchant.repaid(), // M16
  cashOut: (m: MRA) => m.merchant.cashOutView(), // M18
  myQr: (m: MRA) => m.merchant.qr(), // M21
  world: (m: MRA) => m.world.publicView(), // P01

  /* agent */
  agentSetup: (m: MRA) => m.agent.setupOptions(), // M07
  agentApprove: (limits?: AgentLimitsInput) => (m: MRA) => m.agent.approveView(limits), // M08
  agentLog: (m: MRA) => m.agent.log(), // M14
  agentStatus: (m: MRA) => m.agent.status(), // M15

  /* onboarding */
  pass: (m: MRA) => m.onboarding.pass(), // M04
  /** M06: name ideas, plus the pseudonym this device already has (mock: shop_7f3a). */
  shopDraft: async (m: MRA) => ({
    nameIdeas: m.onboarding.nameIdeas(),
    pseudonym: (await m.merchant.settings()).shop.pseudonym,
  }),

  /* customer */
  payShop: (shopId?: string, name?: string) => (m: MRA) => m.pay.shop(shopId, name ? { name } : {}), // C01 / C02

  /* lenders and public */
  earn: (m: MRA) => m.lender.overview(), // L01
  deposit: (m: MRA) => m.lender.depositView(), // L02
  position: (m: MRA) => m.lender.position(), // L03
  junior: (m: MRA) => m.lender.junior.overview(), // J01
  mint: (m: MRA) => m.lender.junior.mintView(), // J02
  trade: (m: MRA) => m.lender.junior.trade(), // J03
  protocol: (m: MRA) => m.protocol.stats(), // P02
  risk: (m: MRA) => m.protocol.risk(), // P03
  explorer: (m: MRA) => m.protocol.explorer(), // P04
};

/** Parse limits from M07 → M08 query params (`?perAdvance=100&perMonth=200&purpose=stock`). */
export function limitsFrom(sp: { perAdvance?: string; perMonth?: string; purpose?: string }): AgentLimitsInput | undefined {
  const perAdvance = Number(sp.perAdvance);
  const perMonth = Number(sp.perMonth);
  if (!(perAdvance > 0) || !(perMonth > 0)) return undefined;
  return { perAdvance, perMonth, ...(sp.purpose ? { purpose: sp.purpose } : {}) };
}
