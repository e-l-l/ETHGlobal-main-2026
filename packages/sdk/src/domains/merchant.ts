import type { Hex } from "viem";
import { randomBytes32 } from "../credentials.js";
import type { AdvanceOnchain, LogEntry } from "../chain/chain.js";
import type { Ctx } from "../context.js";
import { MRAError } from "../errors.js";
import { waitForLeafIndex } from "../chain/tree.js";
import { achievedCount, proveStanding } from "./agent.js";
import * as M from "../mock/merchant.js";
import * as S from "../mock/shop.js";
import type { StandingPassSecret } from "../adapters/vault.js";
import type {
  AdvanceArrivedView,
  AdvanceDetailsView,
  AdvanceVM,
  AgentLimitsVM,
  AgentSummaryVM,
  CashOutResult,
  ClaimResult,
  ClaimStep,
  CashOutView,
  FreshShopResult,
  HomeView,
  LadderStepVM,
  MyQrView,
  RepaidView,
  SaleVM,
  SettingsView,
  ShopVM,
  TodayVM,
  WeekView,
} from "../viewmodels.js";
import { clock, dayLabel, longDate, payUrlFor, pseudonymOf, round2, sameDay, shortDate, usd } from "./util.js";

const DAY = 86_400;
const BLOCKS_PER_DAY = 7_200n; // ~12 s blocks

/* ------------------------------------------------------------ real helpers */

export function shopVM(ctx: Ctx, name?: string, pseudonym?: string): ShopVM {
  return { name: name ?? S.shop.name, pseudonym: pseudonym ?? S.shop.pseudonym, localCurrency: ctx.cfg.fx.currency, usdToLocal: ctx.cfg.fx.usdToLocal };
}

export function advanceVM(a: AdvanceOnchain, openedAt: number | undefined, purpose: string, etaDays: number, now: number): AdvanceVM {
  const drawn = round2(usd(a.principal));
  const owed = a.owedNow ?? a.totalOwed;
  const total = round2(usd(owed));
  const repaid = round2(usd(a.repaid));
  const fee = round2(usd(a.feeSoFar ?? (a.totalOwed - a.principal)));
  const rate = a.feeRateBpsPerWeek ?? 50;
  const cap = a.feeCapBps ?? 300;
  const feeAt = (weeks: number) => round2(drawn * Math.min(cap, rate * weeks) / 10_000);
  return {
    purpose,
    drawn,
    feeLabel: "Fee so far",
    fee,
    total,
    owedNow: total,
    feeSoFar: fee,
    feeIfRepaidIn1Week: feeAt(1), feeIfRepaidIn2Weeks: feeAt(2),
    feeIfRepaidIn4Weeks: feeAt(4), feeIfRepaidIn6Weeks: feeAt(6),
    maxFeeBps: cap,
    annualizedCostPercent: (rate * 52) / 100,
    repaid,
    left: total,
    pct: repaid + total > 0 ? Math.round((repaid / (repaid + total)) * 100) : 0,
    holdback: a.holdbackBps / 100,
    drawnOn: openedAt ? shortDate(openedAt) : "",
    drawnAt: openedAt ? `${sameDay(openedAt, now) ? "today" : shortDate(openedAt)} ${clock(openedAt)}` : "",
    etaDays,
  };
}

type Loaded = { onchain: AdvanceOnchain; openedAt?: number; openedBlock?: bigint };

/** The shop's open advance, or (with `latest`) its most recent one. */
async function loadAdvance(ctx: Ctx, shopId: Hex, latest = false): Promise<Loaded | null> {
  const chain = ctx.chain();
  const shop = await chain.shop(shopId);
  let id = shop.activeAdvanceId;
  let opened: LogEntry | undefined;
  if (id === 0n && latest) {
    const evs = await chain.bookLogs("AdvanceOpened", { shopId });
    opened = evs.at(-1);
    if (!opened) return null;
    id = opened.args.id as bigint;
  }
  if (id === 0n) return null;
  if (!opened) opened = (await chain.bookLogs("AdvanceOpened", { id })).at(-1);
  const onchain = await chain.advance(id);
  const out: Loaded = { onchain };
  if (opened) {
    out.openedBlock = opened.blockNumber;
    out.openedAt = await chain.blockTime(opened.blockNumber);
  }
  return out;
}

type SaleEv = { total: number; repay: number; at: number; id: string };

async function loadSales(ctx: Ctx, shopId: Hex, days: number): Promise<SaleEv[]> {
  const chain = ctx.chain();
  const latest = await chain.blockNumber();
  const from = latest > BLOCKS_PER_DAY * BigInt(days) ? latest - BLOCKS_PER_DAY * BigInt(days) : 0n;
  const evs = await chain.bookLogs("Sale", { shopId }, from, latest);
  const out: SaleEv[] = [];
  for (const e of evs) {
    out.push({ total: usd(e.args.amount), repay: usd(e.args.repayment), at: await chain.blockTime(e.blockNumber), id: `${e.transactionHash}:${e.logIndex}` });
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Fewer repaying sales than this in the last 7 days and the pace is noise (one $1 sale → "~800 days"). */
export const ETA_MIN_SALES = 3;

/**
 * Days left at the last 7 days' repayment pace. `fallback` when there isn't enough data yet (fewer than
 * ETA_MIN_SALES repaying sales). 0 means "no estimate yet": screens hide the line instead of inventing one.
 */
export function etaFrom(left: number, sales: { at: number; repay: number }[], now: number, fallback: number) {
  const recent = sales.filter((s) => s.at >= now - 7 * DAY && s.repay > 0);
  const week = recent.reduce((t, s) => t + s.repay, 0);
  if (recent.length < ETA_MIN_SALES || !(week > 0)) return fallback;
  return Math.max(1, Math.ceil(left / (week / 7)));
}

async function decisionDraft(ctx: Ctx, shopId: Hex) {
  try {
    return (await ctx.api().insights(shopId)).decision?.draft ?? null;
  } catch {
    return null; // insights are optional context; screens still render from chain data
  }
}

async function ladder(ctx: Ctx): Promise<LadderStepVM[]> {
  const p = await ctx.chain().protocol();
  return S.limitsLadder.map((step, i) => ({ label: step.label, cap: usd(p.tierCaps[i] ?? 0n) }));
}

async function standingCount(ctx: Ctx) {
  return achievedCount(await ctx.vault.get("standing_pass"));
}

/**
 * The advance whose Standing Pass this device can claim: the shop's latest advance, fully repaid, not yet claimed,
 * whose pendingCommitment is the `next` credential this device holds. null otherwise (no throw: screens just hide
 * the button).
 */
async function claimableAdvance(ctx: Ctx, shopId: Hex, nextCommitment: string | undefined) {
  if (!nextCommitment) return null;
  const a = await loadAdvance(ctx, shopId, true);
  if (!a || a.onchain.status !== 2) return null;
  const pending = a.onchain.pendingCommitment;
  if (pending !== undefined && pending !== BigInt(nextCommitment)) return null;
  return a;
}

async function agentSummaryReal(ctx: Ctx, now: number): Promise<{ summary: AgentSummaryVM; limits: AgentLimitsVM }> {
  const s = await ctx.session();
  const limits: AgentLimitsVM = { ...S.agentLimits, purpose: s.purpose ?? S.agentLimits.purpose };
  if (!s.agentId || !s.manageToken) return { summary: { lastDraw: 0, lastDrawWhen: "", monthUsed: 0 }, limits };
  const a = await ctx.api().getAgent(s.agentId, s.manageToken);
  limits.perAdvance = usd(a.limits.max_per_draw);
  limits.perMonth = usd(a.limits.max_per_period);
  const last = a.draws.at(-1);
  return {
    summary: {
      lastDraw: last ? usd(last.amount) : 0,
      lastDrawWhen: last ? dayLabel(last.ts, now) : "",
      monthUsed: usd(a.draws.filter((d) => d.ts >= now - 30 * DAY).reduce((t, d) => t + d.amount, 0)),
    },
    limits,
  };
}

function todayVM(ctx: Ctx, sales: SaleEv[], now: number): TodayVM {
  const today = sales.filter((x) => sameDay(x.at, now));
  const soldUsd = round2(today.reduce((t, x) => t + x.total, 0));
  return {
    label: longDate(now),
    soldLocal: Math.round(soldUsd * ctx.cfg.fx.usdToLocal),
    soldUsd,
    salesCount: today.length,
    toRepayment: round2(today.reduce((t, x) => t + x.repay, 0)),
    weekUsd: round2(sales.filter((x) => x.at >= now - 7 * DAY).reduce((t, x) => t + x.total, 0)),
  };
}

async function requireAdvance(ctx: Ctx, shopId: Hex, latest = true) {
  const a = await loadAdvance(ctx, shopId, latest);
  if (!a) throw new MRAError("not_found", "this shop has no advance yet");
  return a;
}

/* ------------------------------------------------------------------ domain */

export function merchantDomain(ctx: Ctx) {
  const isMock = ctx.mode === "mock";

  return {
    /** M10 Home: advance, today's sales, split, limits. */
    async home(): Promise<HomeView> {
      if (isMock) {
        return ctx.mocked({
          shop: { ...S.shop },
          today: { ...M.today },
          agentSummary: { ...M.agentSummary },
          advance: { ...S.advance },
          agentLimits: { ...S.agentLimits },
          limitsLadder: S.limitsLadder.map((x) => ({ ...x })),
          currentTier: S.currentTier,
          sales: M.sales.map((x) => ({ ...x })),
          source: "mock" as const,
        });
      }
      const s = await ctx.requireShop();
      const now = ctx.now();
      const [loaded, sales, agent, limitsLadder, count] = await Promise.all([
        loadAdvance(ctx, s.shopId as Hex),
        loadSales(ctx, s.shopId as Hex, 7),
        agentSummaryReal(ctx, now),
        ladder(ctx),
        standingCount(ctx),
      ]);
      let advance: AdvanceVM | null = null;
      if (loaded) {
        const left = usd(loaded.onchain.owedNow ?? (loaded.onchain.totalOwed - loaded.onchain.repaid));
        advance = advanceVM(loaded.onchain, loaded.openedAt, s.purpose ?? "stock", etaFrom(left, sales, now, 0), now);
      }
      const salesVM: SaleVM[] = sales
        .filter((x) => sameDay(x.at, now))
        .map((x) => ({ id: x.id, total: Math.round(x.total * ctx.cfg.fx.usdToLocal), time: clock(x.at) }));
      return {
        shop: shopVM(ctx, s.shopName, s.pseudonym),
        today: todayVM(ctx, sales, now),
        agentSummary: agent.summary,
        advance,
        agentLimits: agent.limits,
        limitsLadder,
        currentTier: Math.min(count, 3),
        sales: salesVM,
        source: "chain",
      };
    },

    /** M11 Advance arrived: the advance + why the agent drew it. */
    async arrived(): Promise<AdvanceArrivedView> {
      if (isMock) return ctx.mocked({ shop: { ...S.shop }, advance: { ...S.advance }, drawReasons: [...M.drawReasons], source: "mock" as const });
      const s = await ctx.requireShop();
      const now = ctx.now();
      const [a, draft] = await Promise.all([requireAdvance(ctx, s.shopId as Hex), decisionDraft(ctx, s.shopId as Hex)]);
      return {
        shop: shopVM(ctx, s.shopName, s.pseudonym),
        advance: advanceVM(a.onchain, a.openedAt, s.purpose ?? "stock", draft?.est_days_normal ?? 0, now),
        drawReasons: draft?.reasons_en ?? [],
        source: "chain",
      };
    },

    /** M12 Advance details: repayment curve + days-left estimates. */
    async advance(): Promise<AdvanceDetailsView> {
      if (isMock) {
        return ctx.mocked({
          advance: { ...S.advance },
          repaymentCurve: { points: [...M.repaymentCurve.points], ariaLabel: M.repaymentCurve.ariaLabel },
          daysLeftEstimates: M.daysLeftEstimates.map((x) => ({ ...x })),
          source: "mock" as const,
        });
      }
      const s = await ctx.requireShop();
      const now = ctx.now();
      const a = await requireAdvance(ctx, s.shopId as Hex);
      const since = a.openedAt ?? now - 30 * DAY;
      const days = Math.max(1, Math.ceil((now - since) / DAY));
      const [sales, draft] = await Promise.all([loadSales(ctx, s.shopId as Hex, Math.min(days + 1, 60)), decisionDraft(ctx, s.shopId as Hex)]);
      const points: number[] = [0];
      let cum = 0;
      for (let d = 1; d <= days; d++) {
        cum += sales.filter((x) => x.at >= since + (d - 1) * DAY && x.at < since + d * DAY).reduce((t, x) => t + x.repay, 0);
        points.push(round2(cum));
      }
      const vm = advanceVM(a.onchain, a.openedAt, s.purpose ?? "stock", etaFrom(usd(a.onchain.owedNow ?? (a.onchain.totalOwed - a.onchain.repaid)), sales, now, draft?.est_days_normal ?? 0), now);
      return {
        advance: vm,
        repaymentCurve: { points, ariaLabel: `Repayment growing from $0 to $${Math.round(cum)} over ${days} days` },
        daysLeftEstimates: [
          // 0 = no estimate yet (screens hide it).
          { label: "Slow week", days: draft?.est_days_slow ?? vm.etaDays * 2 },
          { label: "Normal", days: draft?.est_days_normal ?? vm.etaDays },
          { label: "Busy week", days: draft?.est_days_busy ?? (vm.etaDays > 0 ? Math.max(1, Math.round(vm.etaDays * 0.6)) : 0) },
        ],
        source: "chain",
      };
    },

    /** M13 Bad week: daily split for the last 7 days and the new estimate. */
    async week(): Promise<WeekView> {
      if (isMock) {
        return ctx.mocked({
          advance: { ...S.advance },
          week: { dayLabels: [...M.week.dayLabels], days: M.week.days.map((d) => ({ ...d })), ariaLabel: M.week.ariaLabel, newEstimateDays: M.week.newEstimateDays },
          source: "mock" as const,
        });
      }
      const s = await ctx.requireShop();
      const now = ctx.now();
      const [a, sales] = await Promise.all([requireAdvance(ctx, s.shopId as Hex), loadSales(ctx, s.shopId as Hex, 7)]);
      const labels = ["S", "M", "T", "W", "T", "F", "S"];
      const start = now - 6 * DAY;
      const days = Array.from({ length: 7 }, (_, i) => {
        const t = start + i * DAY;
        const day = sales.filter((x) => sameDay(x.at, t));
        const repay = day.reduce((sum, x) => sum + x.repay, 0);
        return { t, you: Math.round(day.reduce((sum, x) => sum + x.total, 0) - repay), repay: Math.round(repay) };
      });
      const left = usd(a.onchain.owedNow ?? (a.onchain.totalOwed - a.onchain.repaid));
      return {
        advance: advanceVM(a.onchain, a.openedAt, s.purpose ?? "stock", etaFrom(left, sales, now, 0), now),
        week: {
          dayLabels: days.map((d) => labels[new Date(d.t * 1000).getDay()]!),
          days: days.map(({ you, repay }) => ({ you, repay })),
          ariaLabel: "Daily sales this week, split between you and repayment",
          newEstimateDays: etaFrom(left, sales, now, 0),
        },
        source: "chain",
      };
    },

    /** M16 Repaid: Standing Pass + limits ladder. */
    async repaid(): Promise<RepaidView> {
      if (isMock) {
        return ctx.mocked({
          currentTier: S.currentTier,
          limitsLadder: S.limitsLadder.map((x) => ({ ...x })),
          standingPass: { repaidCount: 1, tier: S.currentTier, claimed: true },
          source: "mock" as const,
        });
      }
      const [sp, s, limitsLadder] = await Promise.all([ctx.vault.get("standing_pass"), ctx.session(), ladder(ctx)]);
      const count = achievedCount(sp);
      const view: RepaidView = {
        currentTier: Math.min(count, 3),
        limitsLadder,
        standingPass: { repaidCount: count, tier: Math.min(count, 3), claimed: sp?.claimed ?? false },
        source: "device",
      };
      if (s.shopId && sp?.next) {
        const a = await claimableAdvance(ctx, s.shopId as Hex, sp.next.commitment);
        if (a && !a.onchain.credentialClaimed) {
          view.standingPass.claimable = true;
          view.standingPass.nextCap = limitsLadder[Math.min(sp.next.count, 3)]?.cap ?? 0;
          view.source = "chain";
        }
      }
      return view;
    },

    /**
     * M16, after the last repayment:
     *  1. `claiming`: the relayer sends claimStandingPass (never the merchant's wallet), and we wait for it to mine.
     *     Idempotent: an advance whose leaf is already in (a retry, or the demo helper) skips the tx.
     *  2. `finding_leaf`: download the WHOLE tree and find our leaf locally (never a filtered query).
     *  3. `proving` ("Checking your record privately…"): with a real prover, prove "I've repaid N" over that tree
     *     on this device (standing_pass). The proof is thrown away: it only checks the pass works before the screen
     *     shows the new limit. Skip with `{ selfCheck: false }`.
     *  4. promote the pending credential on this device (claimed, with its leafIndex).
     */
    async claimStandingPass(opts: { onStep?: (s: ClaimStep) => void; selfCheck?: boolean } = {}): Promise<ClaimResult> {
      ctx.notMock("claimStandingPass");
      const step = (x: ClaimStep) => {
        opts.onStep?.(x);
        ctx.emit("merchant.claim", x);
      };
      const s = await ctx.requireShop();
      const sp = await ctx.vault.get("standing_pass");
      const chain = ctx.chain();
      const a = await requireAdvance(ctx, s.shopId as Hex);
      // Already claimed and promoted on this device (a double tap, or a retry after a dropped response): same answer,
      // no second tx.
      if (!sp?.next && sp?.claimed && sp.leafIndex !== undefined && sp.advanceId === a.onchain.id.toString()) {
        step("done");
        const tier = Math.min(sp.count, 3);
        return { leafIndex: sp.leafIndex, repaidCount: sp.count, tier, newCap: (await ladder(ctx))[tier]?.cap ?? 0 };
      }
      if (!sp?.next) throw new MRAError("session_missing", "no Standing Pass waiting to be claimed on this device");
      if (a.onchain.status !== 2) throw new MRAError("bad_state", "the advance is not fully repaid yet");
      const pending = a.onchain.pendingCommitment;
      if (pending === 0n) throw new MRAError("bad_state", "this advance carries no Standing Pass (only a mandate's first draw does)");
      if (pending !== undefined && pending !== BigInt(sp.next.commitment)) {
        throw new MRAError("bad_state", "this advance's Standing Pass belongs to another device");
      }

      step("claiming");
      let txHash: string | undefined;
      if (!a.onchain.credentialClaimed) {
        const { tx_hash } = await ctx.api().relayClaim(a.onchain.id);
        const receipt = await chain.receipt(tx_hash as Hex);
        if (receipt.status !== "success") throw new MRAError("chain_write_failed", "claimStandingPass reverted");
        txHash = tx_hash;
      }

      step("finding_leaf");
      // Whole-tree download; a few retries in case the RPC serving eth_getLogs is a block behind the receipt.
      const leafIndex = await waitForLeafIndex(chain, "standing", BigInt(sp.next.commitment));
      if (leafIndex === undefined) throw new MRAError("chain_read_failed", "the pass was claimed, but its leaf is not visible yet; try again");
      const claimed: StandingPassSecret = { kind: "standing_pass", ...sp.next, claimed: true, advanceId: a.onchain.id.toString(), leafIndex };
      await ctx.vault.put("standing_pass", claimed);

      const tier = Math.min(claimed.count, 3);
      const out: ClaimResult = { leafIndex, repaidCount: claimed.count, tier, newCap: (await ladder(ctx))[tier]?.cap ?? 0 };
      if (txHash) out.txHash = txHash;
      const selfCheck = opts.selfCheck ?? (ctx.prover.kind !== "mock" && ctx.prover.kind !== "unconfigured");
      if (selfCheck && tier >= 1) {
        step("proving");
        const p = await proveStanding(ctx, claimed, tier, 0n);
        out.selfCheck = { ms: p.ms, proofBytes: (p.proof.length - 2) / 2 };
      }
      step("done");
      return out;
    },

    /** M17 Fresh shop: rotate to a new pseudonym. Reputation travels privately in the passes. */
    async freshShop(name?: string): Promise<FreshShopResult> {
      if (isMock) {
        const previous = ctx.mock.pseudonym;
        ctx.mock.pseudonym = `shop_${randomBytes32().slice(2, 6)}`;
        ctx.mock.agentStatus = "none";
        return ctx.mocked({ previous, shop: { ...S.shop, pseudonym: ctx.mock.pseudonym }, agentNeedsSetup: true, source: "mock" as const });
      }
      const s = await ctx.requireShop();
      const chain = ctx.chain();
      const payout = chain.walletAddress();
      if (!payout) throw new MRAError("wallet_required", "connect the new payout wallet first");
      await ctx.ensureFunded();
      if (s.agentId && s.manageToken) await ctx.api().revokeAgent(s.agentId, s.manageToken).catch(() => undefined);
      const shopId = randomBytes32();
      const receipt = await chain.registerShop(shopId, payout);
      const pseudonym = pseudonymOf(shopId);
      await ctx.saveSession({
        shopId,
        pseudonym,
        payout,
        ...(name ? { shopName: name } : {}),
        previousShops: [...(s.previousShops ?? []), s.shopId],
        agentId: undefined,
        manageToken: undefined,
        mandateId: undefined,
      });
      return { previous: s.pseudonym ?? pseudonymOf(s.shopId), shop: shopVM(ctx, name ?? s.shopName, pseudonym), agentNeedsSetup: true, txHash: receipt.transactionHash, source: "chain" };
    },

    /** M18 Cash out: options. */
    async cashOutView(): Promise<CashOutView> {
      const base = {
        destinations: M.cashOut.destinations.map((d) => ({ ...d })),
        defaultDestination: M.cashOut.defaultDestination,
      };
      if (isMock) return ctx.mocked({ shop: { ...S.shop }, available: M.cashOut.available, ...base, source: "mock" as const });
      const s = await ctx.requireShop();
      const available = s.payout ? usd(await ctx.chain().usdcBalance(s.payout as Hex)) : 0;
      return { shop: shopVM(ctx, s.shopName, s.pseudonym), available: round2(available), ...base, source: "chain" };
    },

    /** M18 Cash out: simulated in every mode (off-ramps are out of scope for the demo). */
    async cashOut(amount: number, destination: string): Promise<CashOutResult> {
      if (!(amount > 0)) throw new MRAError("invalid_request", "amount must be positive");
      if (!M.cashOut.destinations.some((d) => d.value === destination)) throw new MRAError("invalid_request", "unknown destination");
      await ctx.mocked(null);
      return { amount, destination, status: "simulated", reference: `sim_${randomBytes32().slice(2, 10)}` };
    },

    /** M21 My QR. */
    async qr(): Promise<MyQrView> {
      if (isMock) return ctx.mocked({ shop: { ...S.shop }, today: { ...M.today }, payLink: M.myQr.payLink, howToPay: [...M.myQr.howToPay], source: "mock" as const });
      const s = await ctx.requireShop();
      const now = ctx.now();
      const sales = await loadSales(ctx, s.shopId as Hex, 7);
      const name = s.shopName ?? S.shop.name;
      return { shop: shopVM(ctx, name, s.pseudonym), today: todayVM(ctx, sales, now), payLink: payUrlFor(ctx.cfg.payUrl, name, s.shopId), howToPay: [...M.myQr.howToPay], source: "chain" };
    },

    /** M19 Settings. */
    async settings(): Promise<SettingsView> {
      const [bp, sp, s] = await Promise.all([ctx.vault.get("business_pass"), ctx.vault.get("standing_pass"), ctx.session()]);
      const status = isMock ? ctx.mock.agentStatus : s.agentId ? (s.mandateId ? "active" : "pending_approval") : "none";
      return ctx.mocked({
        shop: isMock ? { ...S.shop, pseudonym: ctx.mock.pseudonym } : shopVM(ctx, s.shopName, s.pseudonym),
        agentStatus: status,
        backup: { hasLocalPasses: !!(bp || sp) || isMock, businessPass: !!bp || isMock, standingPass: !!sp || isMock },
        network: ctx.network(),
        source: isMock ? ("mock" as const) : ("device" as const),
      });
    },

    /** Pure helper the home screen uses for each sale row. */
    splitSale: (total: number, holdbackPct: number = S.advance.holdback) => {
      const repay = (total * holdbackPct) / 100;
      return { you: total - repay, repay };
    },
  };
}

export type MerchantDomain = ReturnType<typeof merchantDomain>;
