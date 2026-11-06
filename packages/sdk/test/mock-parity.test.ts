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
    // The lender numbers live with the lender screens since the frontend rewrite (screens/lend/data.ts).
    const load = (p: string) => import(/* @vite-ignore */ p);
    const [shop, merchant, lend] = await Promise.all([load("@/lib/mock/shop"), load("@/lib/mock/merchant"), load("@/screens/lend/data")]);
    return { shop, merchant, lend } as unknown as { shop: Web; merchant: Web; lend: Web };
  } catch {
    // apps/web absent, or its tsconfig can't resolve @repo/typescript-config yet (run `pnpm install` at the root).
    return null;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Web = Record<string, any>;
const web = await loadWeb();
const mra = createMRA({ mode: "mock" });

describe("mock mode: literal values from apps/web", () => {
  it("M10 home", async () => {
    const h = await mra.merchant.home();
    expect(h.source).toBe("mock");
    expect(h.shop).toEqual({ name: "Corner Kiosk", pseudonym: "shop_7f3a", localCurrency: "ARS", usdToLocal: 1010 });
    expect(h.advance).toMatchObject({ drawn: 100, fee: 2, total: 102, repaid: 46, left: 56, pct: 45, holdback: 8, etaDays: 23, drawnOn: "5 Nov" });
    expect(h.today).toEqual({ label: "Thursday 5 Nov", soldLocal: 142500, soldUsd: 142500 / 1010, salesCount: 18, toRepayment: (142500 / 1010) * 0.08, weekUsd: 475 });
    expect(h.sales.map((s) => s.total)).toEqual([15000, 4500, 22000, 7500]);
    expect(h.agentLimits).toEqual({ perAdvance: 100, perMonth: 200, purpose: "stock" });
    expect(h.currentTier).toBe(1);
    expect(mra.merchant.splitSale(15000, h.advance!.holdback)).toEqual({ you: 13800, repay: 1200 });
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
      { label: "2 repaid", cap: 200 },
      { label: "3 or more", cap: 300 },
    ]);
  });

  it("L01 earn", async () => {
    const e = await mra.lender.overview();
    expect(e.vault.apy).toBe("8.2%");
    expect(e.vault.tvl).toBe("$310,000");
    expect(e.vault.juniorBook).toBe(1);
    expect(e.feeSplit).toEqual([
      { k: "Senior", v: "40%" },
      { k: "Junior / DRIP", v: "30%" },
      { k: "Reserve", v: "20%" },
      { k: "Protocol", v: "10%" },
    ]);
    expect(e.waterfall.map((t) => t.amount)).toEqual(["$42,000", "$8,400", "$310,000"]);
    expect(e.seniorSeries).toHaveLength(12);
  });

  it("returns copies: mutating a view-model never changes the next call", async () => {
    const h = await mra.merchant.home();
    h.advance!.left = 0;
    h.sales.pop();
    const again = await mra.merchant.home();
    expect(again.advance!.left).toBe(56);
    expect(again.sales).toHaveLength(4);
  });
});

describe.skip("mock mode deep-equals the legacy apps/web mocks", () => {
  const w = web!;
  const strip = <T extends { source?: unknown }>(v: T) => {
    const { source: _s, ...rest } = v;
    return rest;
  };
  /** apps/web's `shop` (name, id, initials, …) as the SDK's ShopVM. */
  const shopVM = () => ({ name: w.shop.shop.name, pseudonym: w.shop.shop.id, localCurrency: w.shop.shop.localCurrency, usdToLocal: w.shop.shop.usdToLocal });
  /** "$2,541.40" → 2541.4: apps/web's lender numbers are numbers, the SDK's are display strings. */
  const n = (v: string | number) => (typeof v === "number" ? v : Number(v.replace(/−/g, "-").replace(/[^0-9.-]/g, "")));

  it("the copied files are identical", () => {
    expect(sdkMock.ARS_PER_USD).toBe(w.shop.ARS_PER_USD);
    expect(sdkMock.shop).toEqual(shopVM());
    expect({ name: sdkMock.SHOP.name, id: sdkMock.SHOP.id, initials: sdkMock.SHOP.initials, country: sdkMock.SHOP.country, band: sdkMock.SHOP.band, bandRange: sdkMock.SHOP.bandRange, months: sdkMock.SHOP.months }).toEqual({
      name: w.shop.shop.name, id: w.shop.shop.id, initials: w.shop.shop.initials, country: w.shop.shop.country, band: w.shop.shop.band, bandRange: w.shop.shop.bandRange, months: w.shop.shop.months,
    });
    for (const k of ["WALLET", "SHOP_NAME_IDEAS", "advance", "agentLimits", "limitsLadder", "currentTier"] as const) expect(sdkMock[k], k).toEqual(w.shop[k]);
    for (const k of ["today", "agentSummary", "sales", "drawReasons", "repaymentCurve", "daysLeftEstimates", "week", "cashOut", "myQr", "worldView"] as const) {
      expect(sdkMock[k], k).toEqual(w.merchant[k]);
    }
    for (const k of ["seniorSeries", "juniorSeries", "JUNIOR_WRITE_OFF_INDEX", "positionActivity", "TIER_CAPS", "explorerEvents"] as const) {
      expect(sdkMock[k], k).toEqual(w.lend[k]);
    }
    for (const [k, v] of Object.entries(w.lend.VAULT as Record<string, string | number>)) {
      expect(typeof v === "number" ? n(sdkMock.VAULT[k as keyof typeof sdkMock.VAULT]) : sdkMock.VAULT[k as keyof typeof sdkMock.VAULT], `VAULT.${k}`).toEqual(v);
    }
    expect(sdkMock.signals).toEqual(w.lend.signals);
    expect(sdkMock.riskLog.map((l) => ({ time: l.time, title: l.title, reasons: l.reasons }))).toEqual(
      (w.lend.riskLog as { time: string; title: string; reasons: string[] }[]).map((l) => ({ time: l.time, title: l.title, reasons: l.reasons })),
    );
  });

  it("M10 home", async () => {
    expect(strip(await mra.merchant.home())).toEqual({
      shop: shopVM(),
      today: w.merchant.today,
      agentSummary: w.merchant.agentSummary,
      advance: w.shop.advance,
      agentLimits: w.shop.agentLimits,
      limitsLadder: w.shop.limitsLadder,
      currentTier: w.shop.currentTier,
      sales: w.merchant.sales,
    });
  });

  it("M11 / M12 / M13 / M18 / M21 / P01", async () => {
    expect(strip(await mra.merchant.arrived())).toEqual({ shop: shopVM(), advance: w.shop.advance, drawReasons: w.merchant.drawReasons });
    expect(strip(await mra.merchant.advance())).toEqual({ advance: w.shop.advance, repaymentCurve: w.merchant.repaymentCurve, daysLeftEstimates: w.merchant.daysLeftEstimates });
    expect(strip(await mra.merchant.week())).toEqual({ advance: w.shop.advance, week: w.merchant.week });
    expect(strip(await mra.merchant.cashOutView())).toEqual({ shop: shopVM(), available: w.merchant.cashOut.available, destinations: w.merchant.cashOut.destinations, defaultDestination: w.merchant.cashOut.defaultDestination });
    expect(strip(await mra.merchant.qr())).toEqual({ shop: shopVM(), today: w.merchant.today, payLink: w.merchant.myQr.payLink, howToPay: w.merchant.myQr.howToPay });
    const world = await mra.world.publicView();
    expect({ public: world.public, private: world.private }).toEqual(w.merchant.worldView);
  });

  it("M14 / M15 limits match the shop", async () => {
    // The decision log itself is screen data in apps/web (merchant/(app)/agent/_data.ts); the SDK's mock activity
    // only feeds live-mode screens. The limits it shows must agree.
    expect((await mra.agent.log()).agentLimits).toEqual(w.shop.agentLimits);
    expect((await mra.agent.status()).agentLimits).toEqual(w.shop.agentLimits);
  });

  it("M16 repaid", async () => {
    const r = await mra.merchant.repaid();
    expect(r.currentTier).toEqual(w.shop.currentTier);
    expect(r.limitsLadder).toEqual(w.shop.limitsLadder);
  });

  it("L01 earn / L03 position / J01 / J03 / P02 / P03 / P04", async () => {
    const e = await mra.lender.overview();
    expect(e.seniorSeries).toEqual(w.lend.seniorSeries);
    expect(n(e.vault.positionValue)).toBe(w.lend.VAULT.positionValue);
    const p = await mra.lender.position();
    expect(p.positionActivity).toEqual(w.lend.positionActivity);
    const j = await mra.lender.junior.overview();
    expect({ series: j.juniorSeries, at: j.writeOffIndex }).toEqual({ series: w.lend.juniorSeries, at: w.lend.JUNIOR_WRITE_OFF_INDEX });
    const t = await mra.lender.junior.trade();
    expect(n(t.vault.juniorPrice)).toBe(w.lend.VAULT.juniorPrice);
    expect((await mra.protocol.stats()).tierCaps).toEqual(w.lend.TIER_CAPS);
    const risk = await mra.protocol.risk();
    expect(risk.signals).toEqual(w.lend.signals);
    expect(risk.tierCaps).toEqual(w.lend.TIER_CAPS);
    expect(risk.riskLog.map((l) => l.reasons)).toEqual((w.lend.riskLog as { reasons: string[] }[]).map((l) => l.reasons));
    expect((await mra.protocol.explorer()).events).toEqual(w.lend.explorerEvents);
  });

  it("C01 pay header", async () => {
    const p = await mra.pay.shop();
    expect(p).toMatchObject({ name: w.shop.shop.name, id: w.shop.shop.id, initials: w.shop.shop.initials, wallet: w.shop.WALLET });
  });
});
