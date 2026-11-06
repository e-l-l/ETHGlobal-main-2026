/**
 * The lender's "why should I trust this with my dollars?" answer: a risk panel and a loss waterfall with live amounts.
 *
 * Everything here is computed from PUBLIC data only: AdvanceBook / vault / RiskHook reads and AdvanceBook event logs
 * (AdvanceOpened, RepaymentSplit, AdvanceRepaid, AdvanceWrittenOff, LimitsChanged), plus the agents API's public
 * /risk/status when it answers. Output is aggregate: counts and dollar totals, never a shop id or pseudonym.
 *
 * Split in two so tests need no RPC:
 *  - `gatherRiskRaw(chain, …)` reads the chain (and optionally the API) into a plain `RiskRaw`
 *  - `riskPanelFrom(raw)` / `waterfallFrom(raw)` are pure functions of it
 */
import { advanceBookAbi } from "../abi/index.js";
import type { RiskStatus } from "../api/types.js";
import type { Addr, Chain, ProtocolSnapshot } from "../chain/chain.js";
import { decodeSlot0, poolIdOf, poolKeyOf, poolManagerAbi, poolSlots } from "../chain/swap.js";
import type { CohortPointVM, RepaymentBucketVM, RiskPanelView, RiskTone, WaterfallLayerVM, WaterfallView } from "../viewmodels.js";
import { clock, coveragePct, coverageStr, money, pctStr, shortDate, triggerName, usd } from "./util.js";

const DAY = 86_400;
/** Sepolia's slot time. Used only to place an event in time when there are too many blocks to fetch one by one. */
const SECONDS_PER_BLOCK = 12;
/** Fetch exact block timestamps up to this many distinct blocks; estimate beyond it (keeps Anon-RPC reads bounded). */
const EXACT_TIMES_MAX = 60;
/** The Risk agent's TWAP trigger: 1h TWAP below 0.90 × 24h TWAP (a >10% drop). agents/src/mra_agents/risk.py. */
export const TWAP_TRIGGER = 0.9;
/** A cohort checkpoint needs at least this many advances old enough before we print a percentage. */
const COHORT_MIN = 3;
const RECENT_LOWER_DAYS = 7;
const dash = "—";

/* ------------------------------------------------------------------ raw */

export type RiskRaw = {
  now: number;
  chainId: number;
  snap: Pick<ProtocolSnapshot, "juniorAssets" | "reserve" | "seniorOutstanding" | "seniorAssets" | "juniorSharePrice" | "tierCaps" | "tierCapFloors">;
  /** Every advance ever opened: principal and draw time. */
  opened: { id: bigint; principal: bigint; totalOwed: bigint; at: number }[];
  /** Every repayment, principal part only (fees are income, not repaid principal). */
  splits: { advanceId: bigint; principalPart: bigint; at: number }[];
  repaidIds: bigint[];
  writeOffs: { id: bigint; loss: bigint; at: number }[];
  /** Live state of the advances still Active (from getAdvance). Missing entries fall back to the logs. */
  active: { id: bigint; principal: bigint; principalRepaid: bigint; totalOwed: bigint; owedNow?: bigint; repaid: bigint; lastSaleAt: number }[];
  /** AdvanceBook.defaultWindow in seconds (null if the read failed). */
  defaultWindow: number | null;
  /** RiskHook pool: ticks (price = 1.0001^tick, USDC per DRIP). Undefined = unavailable (e.g. under 24h of history). */
  ticks: { spot?: number; twap1h?: number; twap24h?: number };
  limitsChanged: { caps: bigint[]; at: number }[];
  risk: RiskStatus | null;
  /** The viewer's own position, when a wallet / lender account is known. */
  mine: { senior: bigint; junior: bigint } | null;
  contracts: { label: string; address: string }[];
  /** True when some event times were estimated from block numbers rather than read. */
  timesEstimated: boolean;
};

/* ------------------------------------------------------------- helpers */

const tickPrice = (tick: number) => Math.pow(1.0001, tick);
const usd3 = (n: number) => `$${n.toFixed(3)}`;
const signedPct = (n: number, digits = 1) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}%`;
const etherscanFor = (chainId: number) => (chainId === 11_155_111 ? "https://sepolia.etherscan.io" : chainId === 1 ? "https://etherscan.io" : undefined);
const daysWord = (s: number) => {
  const d = s / DAY;
  if (d >= 1) return `${Math.round(d)} day${Math.round(d) === 1 ? "" : "s"}`;
  const h = s / 3600;
  return h >= 1 ? `${Math.round(h)} hour${Math.round(h) === 1 ? "" : "s"}` : `${Math.max(1, Math.round(s / 60))} min`;
};

type OpenAdvance = { id: bigint; principalLeft: bigint; feeLeft: bigint; lastRepayAt: number; lastSaleAt: number };

/** Advances still open, with what is left of principal and fee, from live reads where we have them, logs otherwise. */
function openAdvances(raw: RiskRaw): OpenAdvance[] {
  const closed = new Set<bigint>([...raw.repaidIds, ...raw.writeOffs.map((w) => w.id)]);
  const live = new Map(raw.active.map((a) => [a.id, a]));
  const lastRepay = new Map<bigint, number>();
  const principalBack = new Map<bigint, bigint>();
  for (const s of raw.splits) {
    lastRepay.set(s.advanceId, Math.max(lastRepay.get(s.advanceId) ?? 0, s.at));
    principalBack.set(s.advanceId, (principalBack.get(s.advanceId) ?? 0n) + s.principalPart);
  }
  return raw.opened
    .filter((o) => !closed.has(o.id))
    .map((o) => {
      const a = live.get(o.id);
      const principalRepaid = a?.principalRepaid ?? principalBack.get(o.id) ?? 0n;
      const principalLeft = o.principal - principalRepaid;
      // Fee left = (owed left) − (principal left). From logs alone: the fee rides pro rata, so scale by principal left.
      const feeLeft = a ? (a.owedNow ?? (a.totalOwed - a.repaid)) - principalLeft : o.principal > 0n ? ((o.totalOwed - o.principal) * principalLeft) / o.principal : 0n;
      const repayAt = lastRepay.get(o.id);
      return {
        id: o.id,
        principalLeft: principalLeft > 0n ? principalLeft : 0n,
        feeLeft: feeLeft > 0n ? feeLeft : 0n,
        lastRepayAt: repayAt ?? o.at,
        lastSaleAt: a?.lastSaleAt ?? repayAt ?? o.at,
      };
    });
}

/* --------------------------------------------------------------- panel */

export function riskPanelFrom(raw: RiskRaw): RiskPanelView {
  const { now, snap } = raw;
  const approximations: string[] = [];

  // 1. Default rate: principal lost ÷ principal ever advanced.
  const advanced = raw.opened.reduce((t, o) => t + usd(o.principal), 0);
  const lost = raw.writeOffs.reduce((t, w) => t + usd(w.loss), 0);
  const ratePct = advanced > 0 ? (lost / advanced) * 100 : 0;
  const defaultRate: RiskPanelView["defaultRate"] = {
    value: advanced > 0 ? pctStr(ratePct) : dash,
    pct: Math.round(ratePct * 100) / 100,
    lost: money(lost),
    advanced: money(advanced),
    writeOffs: raw.writeOffs.length,
    advances: raw.opened.length,
    note:
      advanced === 0
        ? "No advances yet."
        : `${money(lost)} of ${money(advanced)} principal lost · ${raw.writeOffs.length} of ${raw.opened.length} advance${raw.opened.length === 1 ? "" : "s"} written off (${pctStr((raw.writeOffs.length / raw.opened.length) * 100)} by count)`,
    tone: advanced === 0 ? "none" : ratePct >= 13 ? "risk" : ratePct >= 5 ? "watch" : "ok",
  };

  // 2. Repayment status of open advances, by time since the last repaying sale.
  const open = openAdvances(raw);
  const bucket = (key: RepaymentBucketVM["key"], label: string, rule: string, tone: RiskTone, test: (quietDays: number) => boolean): RepaymentBucketVM => {
    const xs = open.filter((a) => test((now - a.lastRepayAt) / DAY));
    return { key, label, rule, count: xs.length, principal: money(xs.reduce((t, a) => t + usd(a.principalLeft), 0)), tone: xs.length ? tone : "none" };
  };
  const eligibleNow = raw.defaultWindow === null ? 0 : open.filter((a) => a.lastSaleAt + raw.defaultWindow! <= now).length;
  const windowNote =
    raw.defaultWindow === null
      ? ""
      : ` The contract lets anyone write an advance off after ${daysWord(raw.defaultWindow)} without a qualifying sale${eligibleNow ? `: ${eligibleNow} can be written off now` : ""}.`;
  const repayment: RiskPanelView["repayment"] = {
    open: open.length,
    buckets: [
      bucket("on_track", "On track", "a repaying sale in the last 7 days", "ok", (d) => d < 7),
      bucket("slow", "Slow", "last repaying sale 7–30 days ago", "watch", (d) => d >= 7 && d < 30),
      bucket("quiet", "30+ days quiet", "no repaying sale for 30 days: write-off eligible", "risk", (d) => d >= 30),
    ],
    eligibleNow,
    note: (open.length ? "Counted from each advance's last repaying sale, or its draw if it has none yet." : "No advances open right now.") + windowNote,
  };

  // 3. Cohort curve: % of principal back by day 7 / 14 / 30, over advances at least that old.
  const repaidBy = (o: RiskRaw["opened"][number], until: number) =>
    raw.splits.filter((s) => s.advanceId === o.id && s.at <= until).reduce((t, s) => t + usd(s.principalPart), 0);
  const point = (day: 7 | 14 | 30): CohortPointVM => {
    const cohort = raw.opened.filter((o) => now - o.at >= day * DAY);
    const principal = cohort.reduce((t, o) => t + usd(o.principal), 0);
    if (!cohort.length || principal <= 0) return { day, pct: null, value: dash, advances: cohort.length };
    const pct = (cohort.reduce((t, o) => t + repaidBy(o, o.at + day * DAY), 0) / principal) * 100;
    return { day, pct: Math.round(pct * 10) / 10, value: pctStr(pct, 0), advances: cohort.length };
  };
  const points: [CohortPointVM, CohortPointVM, CohortPointVM] = [point(7), point(14), point(30)];
  const enough = points[0].advances >= COHORT_MIN;
  const oldest = raw.opened.reduce((m, o) => Math.min(m, o.at), Infinity);
  const cohort: RiskPanelView["cohort"] = {
    points,
    enough,
    note: enough
      ? `Share of principal repaid by each day since draw. Only advances at least that old count (${points.map((p) => `day ${p.day}: ${p.advances}`).join(" · ")}).`
      : `Not enough history yet. ${points[0].advances} advance${points[0].advances === 1 ? " is" : "s are"} 7+ days old; we show a curve from ${COHORT_MIN}.${
          Number.isFinite(oldest) ? ` The oldest advance is ${daysWord(now - oldest)} old.` : ""
        }`,
  };

  // 4. Coverage: (reserve + junior) ÷ outstanding.
  const cov = coveragePct(snap.juniorAssets, snap.reserve, snap.seniorOutstanding);
  const cushion = usd(snap.juniorAssets) + usd(snap.reserve);
  const coverage: RiskPanelView["coverage"] = {
    value: coverageStr(cov),
    pct: cov === undefined ? null : Math.round(cov * 10) / 10,
    cushion: money(cushion),
    outstanding: money(usd(snap.seniorOutstanding)),
    note: cov === undefined ? "Nothing lent out right now, so there is nothing to cover." : `${money(cushion)} of DRIP and reserve against ${money(usd(snap.seniorOutstanding))} lent out.`,
    tone: cov === undefined ? "none" : cov < 15 ? "watch" : "ok",
  };

  // 5. The market's view: DRIP on the RiskHook pool.
  const book = usd(snap.juniorSharePrice);
  const spot = raw.ticks.spot !== undefined ? tickPrice(raw.ticks.spot) : undefined;
  const t1 = raw.ticks.twap1h !== undefined ? tickPrice(raw.ticks.twap1h) : undefined;
  const t24 = raw.ticks.twap24h !== undefined ? tickPrice(raw.ticks.twap24h) : undefined;
  const apiRatio = raw.risk?.signals.twap?.price_ratio_1h_vs_24h;
  const ratio = t1 !== undefined && t24 !== undefined ? t1 / t24 : typeof apiRatio === "number" ? apiRatio : null;
  const apiFired = raw.risk?.signals.twap?.fired === true;
  const fired = (ratio !== null && ratio < TWAP_TRIGGER) || apiFired;
  const mkt = t1 ?? spot;
  const gap = mkt !== undefined && book > 0 ? (mkt / book - 1) * 100 : undefined;
  const lostStr = money(lost);
  const read =
    mkt === undefined
      ? "No trades on the pool yet, so the market has no view."
      : gap !== undefined && gap < -0.5
        ? `Traders price DRIP ${Math.abs(gap).toFixed(1)}% under its book value: they expect losses beyond the ${lostStr} written off so far.`
        : gap !== undefined && gap > 0.5
          ? `Traders price DRIP ${gap.toFixed(1)}% over book: no losses expected beyond the ${lostStr} already booked.`
          : `Traders price DRIP at its book value: no losses expected beyond the ${lostStr} already booked.`;
  const market: RiskPanelView["market"] = {
    spot: spot !== undefined ? usd3(spot) : dash,
    twap1h: t1 !== undefined ? usd3(t1) : dash,
    twap24h: t24 !== undefined ? usd3(t24) : dash,
    book: usd3(book),
    vsBook: gap === undefined ? dash : Math.abs(gap) <= 0.5 ? "at book" : `${Math.abs(gap).toFixed(1)}% ${gap < 0 ? "under" : "over"} book`,
    change1hVs24h: ratio === null ? dash : signedPct((ratio - 1) * 100),
    ratio: ratio === null ? null : Math.round(ratio * 10_000) / 10_000,
    trigger: {
      threshold: TWAP_TRIGGER,
      state: fired ? "fired" : ratio !== null ? "armed" : "not_armed",
      note: fired
        ? "Fired: the 1h price fell more than 10% under the 24h price. The Risk agent may lower limits."
        : ratio !== null
          ? "Armed: it fires if the 1h price drops under 0.90× the 24h price."
          : "Not armed yet: the pool's oracle needs 24 hours of trading history.",
    },
    read,
    tone: fired ? "risk" : gap !== undefined && gap < -5 ? "watch" : mkt === undefined ? "none" : "ok",
  };
  if (spot === undefined && raw.ticks.twap1h === undefined) approximations.push("DRIP price: the pool has no readable price yet.");

  // 6. The Risk agent: caps vs floors, recent cuts.
  const changes = [...raw.limitsChanged].sort((a, b) => a.at - b.at);
  const last = changes.at(-1);
  const prev = changes.at(-2);
  const lowered = (a: bigint[] | undefined, b: bigint[] | undefined) => !!a && !!b && a.some((c, i) => b[i] !== undefined && c < b[i]!);
  const lastWasCut = lowered(last?.caps, prev?.caps);
  const tick = raw.risk?.last_tick ?? null;
  const tickCut = !!tick?.enforced && !!tick.tx_hash && now - tick.at < RECENT_LOWER_DAYS * DAY;
  const recentlyLowered = (lastWasCut && !!last && now - last.at < RECENT_LOWER_DAYS * DAY) || tickCut;
  const agent: RiskPanelView["agent"] = {
    tierCaps: snap.tierCaps.map((c, i) => {
      const floor = snap.tierCapFloors[i] ?? 0n;
      const was = lastWasCut && prev?.caps[i] !== undefined && prev.caps[i]! > c ? money(usd(prev.caps[i]!)) : undefined;
      return { tier: i, cap: money(usd(c)), floor: money(usd(floor)), ...(was ? { was } : {}), atFloor: c <= floor };
    }),
    recentlyLowered,
    lastChange: last ? `${lastWasCut ? "Lowered" : "Changed"} ${now - last.at < DAY ? `today, ${clock(last.at)}` : shortDate(last.at)}` : "No change since deploy",
    lastCheck: tick
      ? `${now - tick.at < DAY ? `today, ${clock(tick.at)}` : shortDate(tick.at)}${tick.triggers.length ? ` · ${tick.triggers.map(triggerName).join(", ")}` : " · all calm"}`
      : raw.risk
        ? "No check logged yet"
        : dash,
    triggers: raw.risk?.triggers ?? [],
    from: raw.risk ? "api" : "chain",
  };
  if (!raw.risk) approximations.push("Risk agent: its API didn't answer, so this shows the onchain caps and limit changes only.");
  if (raw.timesEstimated) approximations.push(`Some event times are estimated from block numbers (${SECONDS_PER_BLOCK} s per block), so day counts can be off by minutes.`);
  if (raw.opened.length && raw.active.length < open.length) approximations.push("Some open advances were read from logs only; their quiet days count from the last repayment event.");

  const scan = etherscanFor(raw.chainId);
  return {
    defaultRate,
    repayment,
    cohort,
    coverage,
    market,
    agent,
    contracts: raw.contracts.map((c) => (scan ? { ...c, href: `${scan}/address/${c.address}` } : { ...c })),
    approximations,
    source: "chain",
  };
}

/* ----------------------------------------------------------- waterfall */

export function waterfallFrom(raw: Pick<RiskRaw, "snap" | "opened" | "splits" | "repaidIds" | "writeOffs" | "active" | "mine">): WaterfallView {
  const open = openAdvances({ ...raw, now: 0, chainId: 0, defaultWindow: null, ticks: {}, limitsChanged: [], risk: null, contracts: [], timesEstimated: false });
  const feeLeft = open.reduce((t, a) => t + usd(a.feeLeft), 0);
  const junior = usd(raw.snap.juniorAssets);
  const reserve = usd(raw.snap.reserve);
  const senior = usd(raw.snap.seniorAssets);
  const outstanding = usd(raw.snap.seniorOutstanding);
  const mineS = raw.mine ? usd(raw.mine.senior) : 0;
  const mineJ = raw.mine ? usd(raw.mine.junior) : 0;
  const layer = (l: Omit<WaterfallLayerVM, "amount">): WaterfallLayerVM => ({ ...l, amount: money(l.usd) });
  const layers: WaterfallView["layers"] = [
    layer({
      key: "jar",
      title: "Shops' holdback",
      description: "Fees still owed on open advances, paid from future sales. Not set aside: an estimate, and it only counts while shops keep selling.",
      usd: feeLeft,
      estimated: true,
    }),
    layer({ key: "junior", title: "DripCoin (DRIP)", description: "Cash backing DRIP. Takes the first write-off.", usd: junior, estimated: false, ...(mineJ > 0 ? { yours: `Yours ${money(mineJ)}` } : {}) }),
    layer({ key: "reserve", title: "Reserve", description: "Fees and hook fees held back. Pays what DRIP can't.", usd: reserve, estimated: false }),
    layer({ key: "senior", title: "Vault", description: "Lenders. Loses only after DRIP and the reserve run out.", usd: senior, estimated: false, ...(mineS > 0 ? { yours: `Yours ${money(mineS)}` } : {}) }),
  ];
  const protection = junior + reserve;
  const cov = coveragePct(raw.snap.juniorAssets, raw.snap.reserve, raw.snap.seniorOutstanding);
  return {
    layers,
    protection: money(protection),
    protectionUsd: Math.round(protection * 100) / 100,
    headline: `${money(protection)} of protection ahead of every vault dollar`,
    sub:
      outstanding > 0
        ? `DRIP ${money(junior)} + reserve ${money(reserve)}: ${coverageStr(cov)} of the ${money(outstanding)} lent out.`
        : `DRIP ${money(junior)} + reserve ${money(reserve)}. Nothing is lent out right now.`,
    source: "chain",
  };
}

/* -------------------------------------------------------------- gather */

type RiskApi = { riskStatus(): Promise<RiskStatus> };

/** The agents API is optional context: never let a slow one hold up the chain numbers. */
function withBudget<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("risk status took too long")), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** Read everything the panel and the waterfall need. Public reads only; every optional read degrades to "—". */
export async function gatherRiskRaw(
  chain: Chain,
  opts: { api?: RiskApi | undefined; now: number; account?: Addr | undefined; /** Max wait for /risk/status before going chain-only. Default 8 s. */ apiBudgetMs?: number },
): Promise<RiskRaw> {
  const d = chain.deployment;
  const settled = <T>(r: PromiseSettledResult<T>): T | undefined => (r.status === "fulfilled" ? r.value : undefined);
  const key = poolKeyOf(d);
  const slots = poolSlots(poolIdOf(key));
  const spotTick = async () => {
    const [w0, wl] = await Promise.all([
      chain.client.readContract({ address: d.PoolManager as Addr, abi: poolManagerAbi, functionName: "extsload", args: [slots.slot0] }),
      chain.client.readContract({ address: d.PoolManager as Addr, abi: poolManagerAbi, functionName: "extsload", args: [slots.liquidity] }),
    ]);
    const s = decodeSlot0(w0 as `0x${string}`, wl as `0x${string}`);
    if (s.sqrtPriceX96 === 0n) throw new Error("pool not initialised");
    return s.tick;
  };

  const [snapR, openedR, splitR, repaidR, woR, limR, winR, spotR, t1R, t24R, riskR, posR, latestR] = await Promise.allSettled([
    chain.protocol(),
    chain.bookLogs("AdvanceOpened"),
    chain.bookLogs("RepaymentSplit"),
    chain.bookLogs("AdvanceRepaid"),
    chain.bookLogs("AdvanceWrittenOff"),
    chain.bookLogs("LimitsChanged"),
    chain.client.readContract({ address: chain.addresses.book, abi: advanceBookAbi, functionName: "defaultWindow" }),
    d.PoolManager ? spotTick() : Promise.reject(new Error("no PoolManager")),
    chain.juniorTwapTick(3600),
    chain.juniorTwapTick(86_400),
    opts.api ? withBudget(opts.api.riskStatus(), opts.apiBudgetMs ?? 8_000) : Promise.reject(new Error("no api")),
    opts.account ? chain.position(opts.account) : Promise.resolve(null),
    chain.client.getBlock(),
  ]);
  if (snapR.status === "rejected") throw snapR.reason;
  const snap = snapR.value;
  const openedLogs = settled(openedR) ?? [];
  const splitLogs = settled(splitR) ?? [];
  const repaidLogs = settled(repaidR) ?? [];
  const woLogs = settled(woR) ?? [];
  const limLogs = settled(limR) ?? [];

  // Event times: exact for a handful of blocks, estimated from the head block's time beyond that.
  const blocks = [...new Set([...openedLogs, ...splitLogs, ...woLogs, ...limLogs].map((e) => e.blockNumber))];
  const head = settled(latestR);
  const exact = blocks.length <= EXACT_TIMES_MAX;
  const times = new Map<bigint, number>();
  let timesEstimated = false;
  if (exact) {
    const ts = await Promise.allSettled(blocks.map((b) => chain.blockTime(b)));
    blocks.forEach((b, i) => {
      const t = settled(ts[i]!);
      if (t !== undefined) times.set(b, t);
    });
  }
  const timeOf = (b: bigint) => {
    const t = times.get(b);
    if (t !== undefined) return t;
    timesEstimated = true;
    if (head) return Number(head.timestamp) - Number(head.number - b) * SECONDS_PER_BLOCK;
    return opts.now;
  };

  const opened = openedLogs.map((e) => ({ id: e.args.id as bigint, principal: e.args.amount as bigint, totalOwed: e.args.totalOwed as bigint, at: timeOf(e.blockNumber) }));
  const repaidIds = repaidLogs.map((e) => e.args.id as bigint);
  const writeOffs = woLogs.map((e) => ({ id: e.args.id as bigint, loss: e.args.loss as bigint, at: timeOf(e.blockNumber) }));
  const closed = new Set([...repaidIds, ...writeOffs.map((w) => w.id)]);
  const openIds = opened.map((o) => o.id).filter((id) => !closed.has(id));
  const live = await Promise.allSettled(openIds.map((id) => chain.advance(id)));
  const active = live
    .map(settled)
    .filter((a): a is NonNullable<typeof a> => !!a && a.status === 1)
    .map((a) => {
      // Older Chain fakes may not carry principalRepaid: fall back to the contract's pro-rata rule.
      const principalRepaid = a.principalRepaid ?? (a.totalOwed > 0n ? (a.repaid * a.principal) / a.totalOwed : 0n);
      return { id: a.id, principal: a.principal, principalRepaid, totalOwed: a.totalOwed, owedNow: a.owedNow,
        repaid: a.repaid, lastSaleAt: Number(a.lastSaleAt) };
    });
  const pos = settled(posR);
  const win = settled(winR);
  const ticks: RiskRaw["ticks"] = {};
  const sp = settled(spotR);
  const t1 = settled(t1R);
  const t24 = settled(t24R);
  if (sp !== undefined) ticks.spot = Number(sp);
  if (t1 !== undefined) ticks.twap1h = Number(t1);
  if (t24 !== undefined) ticks.twap24h = Number(t24);

  return {
    now: opts.now,
    chainId: d.chainId,
    snap,
    opened,
    splits: splitLogs.map((e) => ({ advanceId: e.args.advanceId as bigint, principalPart: e.args.principalPart as bigint, at: timeOf(e.blockNumber) })),
    repaidIds,
    writeOffs,
    active,
    defaultWindow: win === undefined ? null : Number(win),
    ticks,
    limitsChanged: limLogs.map((e) => ({ caps: [...(e.args.caps as readonly bigint[])], at: timeOf(e.blockNumber) })),
    risk: settled(riskR) ?? null,
    mine: pos ? { senior: pos.seniorValue, junior: pos.juniorValue } : null,
    contracts: [
      { label: "AdvanceBook", address: chain.addresses.book },
      { label: "Vault", address: chain.addresses.senior },
      { label: "DripCoin (DRIP)", address: chain.addresses.junior },
      { label: "RiskHook", address: chain.addresses.hook },
    ],
    timesEstimated,
  };
}
