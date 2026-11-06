import { describe, expect, it } from "vitest";
import { createMRA } from "../src/index.js";
import * as sdkMock from "../src/mock/index.js";

/**
 * Mock mode must return EXACTLY what apps/web/src/lib/mock/* holds, so a screen switches to the SDK with zero
 * visual change. Two layers: (1) known literal values (works anywhere), (2) a deep comparison with the live
 * apps/web files when the monorepo has them.
 */
async function loadWeb() {
  try {
    // Variable specifiers: only vitest's alias resolves "@/…" (into apps/web); tsc never sees these modules.
    const load = (p: string) => import(/* @vite-ignore */ p);
    const [shop, merchant, lend] = await Promise.all([load("@/lib/mock/shop"), load("@/lib/mock/merchant"), load("@/lib/mock/lend")]);
    return { shop, merchant, lend } as unknown as { shop: typeof sdkMock; merchant: typeof sdkMock; lend: typeof sdkMock };
  } catch {
    // apps/web absent, or its tsconfig can't resolve @repo/typescript-config yet (run `pnpm install` at the root).
    return null;
  }
}
const web = await loadWeb();
const mra = createMRA({ mode: "mock" });

describe("mock mode: literal values from apps/web", () => {
  it("M10 home", async () => {
    const h = await mra.merchant.home();
    expect(h.source).toBe("mock");
    expect(h.shop).toEqual({ name: "Corner Kiosk", pseudonym: "shop_7f3a", localCurrency: "ARS", usdToLocal: 1500 });
    expect(h.advance).toMatchObject({ drawn: 100, fee: 15, total: 115, repaid: 46, left: 69, pct: 40, holdback: 10, etaDays: 23, drawnOn: "5 Nov" });
    expect(h.today).toEqual({ label: "Thursday 5 Nov", soldLocal: 142500, soldUsd: 95, salesCount: 18, toRepayment: 9.5, weekUsd: 475 });
    expect(h.sales.map((s) => s.total)).toEqual([15000, 4500, 22000, 7500]);
    expect(h.agentLimits).toEqual({ perAdvance: 100, perMonth: 200, purpose: "stock" });
    expect(h.currentTier).toBe(1);
    expect(mra.merchant.splitSale(15000, h.advance!.holdback)).toEqual({ you: 13500, repay: 1500 });
  });

  it("M12 advance details", async () => {
    const a = await mra.merchant.advance();
    expect(a.repaymentCurve.points).toEqual([0, 4, 10, 13, 20, 24, 29, 34, 38, 42, 46]);
    expect(a.daysLeftEstimates).toEqual([
      { label: "Slow week", days: 46 },
      { label: "Normal", days: 23 },
      { label: "Busy week", days: 14 },
    ]);
  });

  it("M16 repaid", async () => {
    const r = await mra.merchant.repaid();
    expect(r.currentTier).toBe(1);
    expect(r.limitsLadder).toEqual([
      { label: "First advance", cap: 50 },
      { label: "1 repaid", cap: 100 },
      { label: "2 repaid", cap: 250 },
      { label: "3 or more", cap: 500 },
    ]);
  });

  it("L01 earn", async () => {
    const e = await mra.lender.overview();
    expect(e.vault.apy).toBe("8.2%");
    expect(e.vault.tvl).toBe("$310,000");
    expect(e.vault.juniorBook).toBe(1);
    expect(e.feeSplit).toEqual([
      { k: "Senior", v: "60%" },
      { k: "Junior", v: "30%" },
      { k: "Reserve", v: "10%" },
    ]);
    expect(e.waterfall.map((t) => t.amount)).toEqual(["$42,000", "$8,400", "$310,000"]);
    expect(e.seniorSeries).toHaveLength(12);
  });

  it("returns copies: mutating a view-model never changes the next call", async () => {
    const h = await mra.merchant.home();
    h.advance!.left = 0;
    h.sales.pop();
    const again = await mra.merchant.home();
    expect(again.advance!.left).toBe(69);
    expect(again.sales).toHaveLength(4);
  });
});

describe.skipIf(!web)("mock mode deep-equals the live apps/web mocks", () => {
  const w = web!;
  const strip = <T extends { source?: unknown }>(v: T) => {
    const { source: _s, ...rest } = v;
    return rest;
  };

  it("the copied files are identical", () => {
    for (const k of ["SHOP", "WALLET", "SHOP_NAME_IDEAS", "shop", "advance", "agentLimits", "limitsLadder", "currentTier"] as const) expect(sdkMock[k]).toEqual(w.shop[k]);
    for (const k of ["today", "agentSummary", "sales", "drawReasons", "repaymentCurve", "daysLeftEstimates", "week", "agentStats", "agentActivity", "perAdvanceOptions", "perMonthStepper", "purposes", "agentPermissions", "cashOut", "myQr", "worldView"] as const) {
      expect(sdkMock[k]).toEqual(w.merchant[k]);
    }
    for (const k of ["VAULT", "FEE_SPLIT", "seniorSeries", "juniorSeries", "JUNIOR_WRITE_OFF_INDEX", "positionActivity", "TIER_CAPS", "signals", "riskLog", "explorerEvents", "waterfall", "positionRows", "tradeRows", "explorerShops", "lenderLinks"] as const) {
      expect(sdkMock[k]).toEqual(w.lend[k]);
    }
  });

  it("M10 home", async () => {
    expect(strip(await mra.merchant.home())).toEqual({
      shop: w.shop.shop,
      today: w.merchant.today,
      agentSummary: w.merchant.agentSummary,
      advance: w.shop.advance,
      agentLimits: w.shop.agentLimits,
      limitsLadder: w.shop.limitsLadder,
      currentTier: w.shop.currentTier,
      sales: w.merchant.sales,
    });
  });

  it("M11 / M12 / M13 / M14 / M18 / M21 / P01", async () => {
    expect(strip(await mra.merchant.arrived())).toEqual({ shop: w.shop.shop, advance: w.shop.advance, drawReasons: w.merchant.drawReasons });
    expect(strip(await mra.merchant.advance())).toEqual({ advance: w.shop.advance, repaymentCurve: w.merchant.repaymentCurve, daysLeftEstimates: w.merchant.daysLeftEstimates });
    expect(strip(await mra.merchant.week())).toEqual({ advance: w.shop.advance, week: w.merchant.week });
    expect(strip(await mra.agent.log())).toEqual({ agentLimits: w.shop.agentLimits, agentSummary: w.merchant.agentSummary, stats: w.merchant.agentStats, activity: w.merchant.agentActivity });
    expect(strip(await mra.merchant.cashOutView())).toEqual({ shop: w.shop.shop, available: w.merchant.cashOut.available, destinations: w.merchant.cashOut.destinations, defaultDestination: w.merchant.cashOut.defaultDestination });
    expect(strip(await mra.merchant.qr())).toEqual({ shop: w.shop.shop, today: w.merchant.today, payLink: w.merchant.myQr.payLink, howToPay: w.merchant.myQr.howToPay });
    const world = await mra.world.publicView();
    expect({ public: world.public, private: world.private }).toEqual(w.merchant.worldView);
  });

  it("M16 repaid", async () => {
    const r = await mra.merchant.repaid();
    expect(r.currentTier).toEqual(w.shop.currentTier);
    expect(r.limitsLadder).toEqual(w.shop.limitsLadder);
  });

  it("M07 setup options", async () => {
    const s = await mra.agent.setupOptions();
    expect(s.perAdvanceOptions).toEqual(w.merchant.perAdvanceOptions);
    expect(s.perMonthStepper).toEqual(w.merchant.perMonthStepper);
    expect(s.purposes).toEqual(w.merchant.purposes);
    expect(s.permissions).toEqual(w.merchant.agentPermissions);
  });

  it("L01 earn / L03 position / J01 / J03 / P02 / P03 / P04", async () => {
    expect(strip(await mra.lender.overview())).toEqual({ vault: w.lend.VAULT, feeSplit: w.lend.FEE_SPLIT, waterfall: w.lend.waterfall, seniorSeries: w.lend.seniorSeries });
    expect(strip(await mra.lender.position())).toEqual({ vault: w.lend.VAULT, positionRows: w.lend.positionRows, positionActivity: w.lend.positionActivity, seniorSeries: w.lend.seniorSeries });
    expect(strip(await mra.lender.junior.overview())).toEqual({ vault: w.lend.VAULT, juniorSeries: w.lend.juniorSeries, writeOffIndex: w.lend.JUNIOR_WRITE_OFF_INDEX, waterfall: w.lend.waterfall });
    expect(strip(await mra.lender.junior.trade())).toEqual({ vault: w.lend.VAULT, juniorSeries: w.lend.juniorSeries, writeOffIndex: w.lend.JUNIOR_WRITE_OFF_INDEX, tradeRows: w.lend.tradeRows });
    expect(strip(await mra.protocol.stats())).toEqual({ vault: w.lend.VAULT, feeSplit: w.lend.FEE_SPLIT, tierCaps: w.lend.TIER_CAPS, waterfall: w.lend.waterfall });
    const risk = await mra.protocol.risk();
    expect({ signals: risk.signals, riskLog: risk.riskLog, tierCaps: risk.tierCaps }).toEqual({ signals: w.lend.signals, riskLog: w.lend.riskLog, tierCaps: w.lend.TIER_CAPS });
    expect(strip(await mra.protocol.explorer())).toEqual({ events: w.lend.explorerEvents, shops: w.lend.explorerShops });
  });

  it("C01 pay header", async () => {
    const p = await mra.pay.shop();
    expect(p).toMatchObject({ name: w.shop.SHOP.name, id: w.shop.SHOP.id, initials: w.shop.SHOP.initials, wallet: w.shop.WALLET });
  });
});
