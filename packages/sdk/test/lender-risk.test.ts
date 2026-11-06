import { describe, expect, it } from "vitest";
import { createMRA, deploymentFor, gatherRiskRaw, riskPanelFrom, waterfallFrom, type Chain, type RiskRaw, type RiskStatus } from "../src/index.js";
import * as L from "../src/mock/index.js";

const DAY = 86_400;
const NOW = 1_800_000_000;
const $ = (n: number) => BigInt(Math.round(n * 1_000_000));
const SHOP = `0x${"ab".repeat(32)}` as const;

/** A small book: 4 advances of $100 (fee $15 each), drawn 40, 20, 10 and 2 days ago. */
function raw(over: Partial<RiskRaw> = {}): RiskRaw {
  return {
    now: NOW,
    chainId: 11_155_111,
    snap: {
      juniorAssets: $(60),
      reserve: $(5),
      seniorOutstanding: $(250),
      seniorAssets: $(1_000),
      juniorSharePrice: $(1),
      tierCaps: [$(50), $(100), $(250), $(250)],
      tierCapFloors: [$(25), $(50), $(100), $(100)],
    },
    opened: [
      { id: 1n, principal: $(100), totalOwed: $(115), at: NOW - 40 * DAY },
      { id: 2n, principal: $(100), totalOwed: $(115), at: NOW - 20 * DAY },
      { id: 3n, principal: $(100), totalOwed: $(115), at: NOW - 10 * DAY },
      { id: 4n, principal: $(100), totalOwed: $(115), at: NOW - 2 * DAY },
    ],
    splits: [
      // #1: $30 principal back in its first week, then nothing (written off)
      { advanceId: 1n, principalPart: $(30), at: NOW - 36 * DAY },
      // #2: $50 by day 5, last sale 12 days ago → "slow"
      { advanceId: 2n, principalPart: $(50), at: NOW - 15 * DAY },
      { advanceId: 2n, principalPart: $(10), at: NOW - 12 * DAY },
      // #3: repaying yesterday → "on track"
      { advanceId: 3n, principalPart: $(20), at: NOW - 1 * DAY },
    ],
    repaidIds: [],
    writeOffs: [{ id: 1n, loss: $(70), at: NOW - 5 * DAY }],
    active: [
      { id: 2n, principal: $(100), principalRepaid: $(60), totalOwed: $(115), repaid: $(69), lastSaleAt: NOW - 12 * DAY },
      { id: 3n, principal: $(100), principalRepaid: $(20), totalOwed: $(115), repaid: $(23), lastSaleAt: NOW - 1 * DAY },
      { id: 4n, principal: $(100), principalRepaid: 0n, totalOwed: $(115), repaid: 0n, lastSaleAt: NOW - 2 * DAY },
    ],
    defaultWindow: 30 * DAY,
    ticks: { spot: -200, twap1h: -150, twap24h: 0 },
    limitsChanged: [
      { caps: [$(50), $(100), $(250), $(500)], at: NOW - 30 * DAY },
      { caps: [$(50), $(100), $(250), $(250)], at: NOW - 2 * 3600 },
    ],
    risk: null,
    mine: { senior: $(500), junior: 0n },
    contracts: [{ label: "AdvanceBook", address: "0x873bb34ad35a66947dbd2f9482d15ba5d400d8db" }],
    timesEstimated: false,
    ...over,
  };
}

describe("riskPanelFrom (pure)", () => {
  it("default rate is principal lost over principal advanced, with the count", () => {
    const p = riskPanelFrom(raw());
    expect(p.defaultRate).toMatchObject({ value: "17.5%", lost: "$70", advanced: "$400", writeOffs: 1, advances: 4, tone: "risk" });
    expect(p.defaultRate.note).toContain("1 of 4 advances written off (25.0% by count)");
  });

  it("buckets open advances by days since the last repaying sale", () => {
    const p = riskPanelFrom(raw());
    expect(p.repayment.open).toBe(3);
    expect(p.repayment.buckets.map((b) => [b.key, b.count, b.principal])).toEqual([
      ["on_track", 2, "$180"], // #3 (1 day) + #4 (no sale yet, drawn 2 days ago)
      ["slow", 1, "$40"], // #2 (12 days)
      ["quiet", 0, "$0"],
    ]);
    expect(p.repayment.eligibleNow).toBe(0);
    expect(p.repayment.note).toContain("after 30 days");
  });

  it("counts write-off eligibility with the contract's own default window", () => {
    const p = riskPanelFrom(raw({ defaultWindow: 7 * DAY }));
    expect(p.repayment.eligibleNow).toBe(1); // #2: last qualifying sale 12 days ago
    expect(p.repayment.note).toContain("after 7 days");
    expect(p.repayment.note).toContain("1 can be written off now");
  });

  it("cohort: only advances old enough count, and thin data says so", () => {
    const p = riskPanelFrom(raw());
    // day 7: #1, #2, #3 are 7+ days old. Repaid by their day 7: #1 $30, #2 $50 (day 5), #3 $0 → 80/300
    expect(p.cohort.points[0]).toEqual({ day: 7, pct: 26.7, value: "27%", advances: 3 });
    // day 14: #1, #2 → #1 $30 + #2 $60 (day 8) → 90/200
    expect(p.cohort.points[1]).toEqual({ day: 14, pct: 45, value: "45%", advances: 2 });
    expect(p.cohort.points[2]).toMatchObject({ day: 30, advances: 1, value: "30%" });
    expect(p.cohort.enough).toBe(true);

    const young = riskPanelFrom(raw({ opened: raw().opened.map((o) => ({ ...o, at: NOW - 2 * DAY })) }));
    expect(young.cohort.enough).toBe(false);
    expect(young.cohort.points.every((x) => x.pct === null && x.value === "—")).toBe(true);
    expect(young.cohort.note).toMatch(/^Not enough history yet\. 0 advances are 7\+ days old/);
  });

  it("coverage is (reserve + junior) ÷ outstanding, and — with nothing outstanding", () => {
    expect(riskPanelFrom(raw()).coverage).toMatchObject({ value: "26.0%", pct: 26, cushion: "$65", outstanding: "$250", tone: "ok" });
    const none = riskPanelFrom(raw({ snap: { ...raw().snap, seniorOutstanding: 0n } }));
    expect(none.coverage).toMatchObject({ value: "—", pct: null, tone: "none" });
  });

  it("market view: price vs book, 1h vs 24h, and the 0.90 trigger state", () => {
    const m = riskPanelFrom(raw()).market;
    expect(m.spot).toBe("$0.980");
    expect(m.twap1h).toBe("$0.985");
    expect(m.twap24h).toBe("$1.000");
    expect(m.vsBook).toBe("1.5% under book");
    expect(m.change1hVs24h).toBe("−1.5%");
    expect(m.trigger.state).toBe("armed");
    expect(m.read).toContain("expect losses beyond the $70 written off");

    const crash = riskPanelFrom(raw({ ticks: { spot: -1200, twap1h: -1100, twap24h: 0 } })).market; // 1h ≈ 0.896
    expect(crash.trigger.state).toBe("fired");
    expect(crash.tone).toBe("risk");

    const young = riskPanelFrom(raw({ ticks: { spot: 0, twap1h: 0 } })).market; // no 24h history
    expect(young.trigger.state).toBe("not_armed");
    expect(young.change1hVs24h).toBe("—");
    expect(young.vsBook).toBe("at book");

    // The agents API's ratio stands in when the chain can't give the 24h TWAP.
    const viaApi = riskPanelFrom(raw({ ticks: { spot: 0 }, risk: status({ ratio: 0.95 }) })).market;
    expect(viaApi).toMatchObject({ change1hVs24h: "−5.0%", trigger: { state: "armed" } });
  });

  it("risk agent: caps vs floors and a recent cut", () => {
    const a = riskPanelFrom(raw()).agent;
    expect(a.tierCaps[3]).toEqual({ tier: 3, cap: "$250", floor: "$100", was: "$500", atFloor: false });
    expect(a.tierCaps[0]).toEqual({ tier: 0, cap: "$50", floor: "$25", atFloor: false });
    expect(a.recentlyLowered).toBe(true);
    expect(a.lastChange).toMatch(/^Lowered today/);
    expect(a.from).toBe("chain");
    const calm = riskPanelFrom(raw({ limitsChanged: [] })).agent;
    expect(calm).toMatchObject({ recentlyLowered: false, lastChange: "No change since deploy" });
  });

  it("links contracts to Sepolia Etherscan, and to nothing on a local chain", () => {
    expect(riskPanelFrom(raw()).contracts[0]!.href).toBe("https://sepolia.etherscan.io/address/0x873bb34ad35a66947dbd2f9482d15ba5d400d8db");
    expect(riskPanelFrom(raw({ chainId: 31337 })).contracts[0]!.href).toBeUndefined();
  });

  it("says what is approximate", () => {
    const p = riskPanelFrom(raw({ timesEstimated: true }));
    expect(p.approximations.join(" ")).toMatch(/estimated from block numbers/);
    expect(p.approximations.join(" ")).toMatch(/API didn't answer/);
  });
});

describe("waterfallFrom (pure)", () => {
  it("live amounts per layer in loss order, headline counts cash only", () => {
    const w = waterfallFrom(raw());
    expect(w.layers.map((l) => l.key)).toEqual(["jar", "junior", "reserve", "senior"]);
    // fee still owed: #2 (115-69)-(100-60)=6, #3 (115-23)-80=12, #4 15 → 33
    expect(w.layers.map((l) => l.amount)).toEqual(["$33", "$60", "$5", "$1,000"]);
    expect(w.layers[0]!.estimated).toBe(true);
    expect(w.layers.slice(1).every((l) => !l.estimated)).toBe(true);
    expect(w.layers[3]!.yours).toBe("Yours $500");
    expect(w.headline).toBe("$65 of protection ahead of every senior dollar");
    expect(w.sub).toContain("26.0% of the $250 lent out");
  });
});

/* ------------------------------------------------------------ fake chain */

function status(o: { ratio?: number; fired?: boolean } = {}): RiskStatus {
  return {
    signals: { as_of: NOW, triggers: [], errors: [], ...(o.ratio !== undefined ? { twap: { short_seconds: 3600, long_seconds: 86400, price_ratio_1h_vs_24h: o.ratio, fired: !!o.fired } } : {}) },
    triggers: [],
    last_tick: { at: NOW - 600, signals: { as_of: NOW, triggers: [], errors: [] }, triggers: [], proposal: null, source: null, enforced: null, tx_hash: null, skipped: null, error: null },
  };
}

function fakeChain(): Chain {
  const d = deploymentFor("sepolia");
  const log = (args: Record<string, unknown>, blockNumber: bigint) => ({ args, blockNumber, transactionHash: `0x${"00".repeat(32)}` as const, logIndex: 0 });
  const logs: Record<string, ReturnType<typeof log>[]> = {
    AdvanceOpened: [log({ id: 1n, shopId: SHOP, amount: $(100), totalOwed: $(115) }, 100n), log({ id: 2n, shopId: SHOP, amount: $(50), totalOwed: $(57.5) }, 200n)],
    RepaymentSplit: [log({ advanceId: 1n, principalPart: $(100), seniorFee: 0n, juniorFee: 0n, reserveFee: 0n }, 150n)],
    AdvanceRepaid: [log({ id: 1n, shopId: SHOP }, 150n)],
    AdvanceWrittenOff: [],
    LimitsChanged: [],
  };
  const times: Record<string, number> = { "100": NOW - 3 * DAY, "150": NOW - 2 * DAY, "200": NOW - 31 * DAY };
  const fake = {
    deployment: d,
    addresses: { book: d.AdvanceBook, registry: d.BusinessPassRegistry, senior: d.SeniorVault, junior: d.JuniorVault, hook: d.RiskHook, usdc: d.USDC },
    walletAddress: () => undefined,
    protocol: async () => ({
      seniorAssets: $(1_000),
      seniorSupply: $(1_000),
      seniorOutstanding: $(50),
      seniorSharePrice: $(1),
      juniorAssets: $(200),
      juniorSupply: $(200),
      juniorSharePrice: $(1),
      reserve: $(1),
      exposure: $(50),
      maxExposure: $(5_000),
      tierCaps: [$(50), $(100), $(250), $(500)],
      tierCapFloors: [$(25), $(50), $(100), $(100)],
      nextAdvanceId: 3n,
      seniorFeeBps: 6000,
      juniorFeeBps: 3000,
    }),
    bookLogs: async (name: string) => logs[name] ?? [],
    blockTime: async (b: bigint) => times[String(b)]!,
    advance: async (id: bigint) => ({ id, shopId: SHOP, principal: $(50), totalOwed: $(57.5), repaid: 0n, principalRepaid: 0n, holdbackBps: 1000, tier: 0, lastSaleAt: BigInt(NOW - 31 * DAY), status: 1, credentialClaimed: false }),
    juniorTwapTick: async (s: number) => {
      if (s > 3600) throw new Error("InsufficientHistory");
      return -20;
    },
    position: async () => {
      throw new Error("no account");
    },
    client: {
      readContract: async (p: { functionName: string }) => {
        if (p.functionName === "defaultWindow") return 30n * 86_400n;
        throw new Error(`unexpected read ${p.functionName}`);
      },
      getBlock: async () => ({ number: 300n, timestamp: BigInt(NOW) }),
    },
  };
  return fake as unknown as Chain;
}

describe("gatherRiskRaw with a fake chain", () => {
  it("reads logs + open advances and degrades the optional reads", async () => {
    const r = await gatherRiskRaw(fakeChain(), { now: NOW, api: { riskStatus: async () => status({ ratio: 1.01 }) } });
    expect(r.opened.map((o) => o.id)).toEqual([1n, 2n]);
    expect(r.active.map((a) => a.id)).toEqual([2n]); // #1 was repaid, never read
    expect(r.defaultWindow).toBe(30 * DAY);
    expect(r.ticks).toEqual({ twap1h: -20 }); // no spot (pool read failed), no 24h (InsufficientHistory)
    expect(r.timesEstimated).toBe(false);

    const p = riskPanelFrom(r);
    expect(p.repayment.buckets.map((b) => b.count)).toEqual([0, 0, 1]); // #2: no sale in 31 days
    expect(p.repayment.eligibleNow).toBe(1);
    expect(p.market.change1hVs24h).toBe("+1.0%"); // the API's ratio
    expect(p.agent.from).toBe("api");
    expect(p.coverage.value).toBe("402.0%");

    // Aggregate only: the shop id never reaches a view-model.
    const out = JSON.stringify([p, waterfallFrom(r)], (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(out).not.toContain(SHOP.slice(2, 10));
    expect(out).not.toMatch(/shop_[0-9a-f]{4}/);
  });

  it("still answers when the API is down", async () => {
    const r = await gatherRiskRaw(fakeChain(), { now: NOW, api: { riskStatus: async () => Promise.reject(new Error("down")) } });
    expect(r.risk).toBeNull();
    expect(riskPanelFrom(r).market.trigger.state).toBe("not_armed");
  });
});

/* ------------------------------------------------------------ mock mode */

describe("mock mode: riskPanel / waterfall", () => {
  const mra = createMRA({ mode: "mock" });
  const n = (s: string) => Number(s.replace(/[^0-9.]/g, ""));

  it("returns the mock, consistent with the VAULT the rest of the lender screens show", async () => {
    const [p, w, earn] = await Promise.all([mra.lender.riskPanel(), mra.lender.waterfall(), mra.lender.overview()]);
    expect(p.source).toBe("mock");
    expect(w.source).toBe("mock");
    expect(p.coverage.value).toBe(earn.vault.coverage);
    expect(p.coverage.outstanding).toBe(earn.vault.outstanding);
    expect(((n(earn.vault.junior) + n(earn.vault.reserve)) / n(earn.vault.outstanding)) * 100).toBeCloseTo(p.coverage.pct!, 1);
    expect(p.defaultRate.lost).toBe(earn.vault.writtenOff);
    expect(((p.defaultRate.writeOffs / p.defaultRate.advances) * 100).toFixed(1) + "%").toBe(earn.vault.defaultRate);
    expect(p.defaultRate.advances).toBe(n(earn.vault.advancesOut));
    expect(p.market.spot).toBe(earn.vault.juniorPrice);
    expect(p.market.twap1h).toBe(earn.vault.juniorTwap);
    expect(p.agent.tierCaps.map((t) => ({ tier: t.tier, cap: t.cap, ...(t.was ? { was: t.was } : {}) }))).toEqual(L.TIER_CAPS.map((t) => ({ ...t })));
    const open = p.repayment.buckets.reduce((t, b) => t + b.count, 0);
    expect(open).toBe(p.repayment.open);
    expect(p.repayment.buckets.reduce((t, b) => t + n(b.principal), 0)).toBe(n(earn.vault.outstanding));

    expect(w.layers.map((l) => l.amount).slice(1)).toEqual(earn.waterfall.map((t) => t.amount));
    expect(w.protectionUsd).toBe(n(earn.vault.junior) + n(earn.vault.reserve));
    expect(w.layers[3]!.yours).toBe(`Yours ${earn.vault.positionValue}`);
  });

  it("hands out copies", async () => {
    const a = await mra.lender.riskPanel();
    a.coverage.value = "x";
    expect((await mra.lender.riskPanel()).coverage.value).toBe(L.RISK_PANEL.coverage.value);
  });
});

describe("gatherRiskRaw: a slow agents API", () => {
  it("goes chain-only after the budget", async () => {
    const slow = { riskStatus: () => new Promise<RiskStatus>((r) => setTimeout(() => r(status({ ratio: 1 })), 500)) };
    const r = await gatherRiskRaw(fakeChain(), { now: NOW, api: slow, apiBudgetMs: 20 });
    expect(r.risk).toBeNull();
    expect(riskPanelFrom(r).agent.from).toBe("chain");
  });
});
