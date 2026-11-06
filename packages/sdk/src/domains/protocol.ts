import type { RiskStatus } from "../api/types.js";
import type { LogEntry } from "../chain/chain.js";
import type { Ctx } from "../context.js";
import * as L from "../mock/lend.js";
import type { ExplorerEventVM, ExplorerShopVM, ExplorerView, LossTier, ProtocolView, RiskLogVM, RiskView, SignalVM, TierCapVM } from "../viewmodels.js";
import { lenderSnapshot } from "./lender.js";
import { ago, clock, coveragePct, coverageStr, money, pseudonymOf, shortDate, usd } from "./util.js";

const BLOCKS_PER_DAY = 7_200n;

function tierCaps(caps: bigint[], floors?: bigint[], wasCaps?: number[]): TierCapVM[] {
  return caps.map((c, i) => {
    const cap = money(usd(c));
    const was = wasCaps?.[i];
    return was !== undefined && was > usd(c) ? { tier: i, cap, was: money(was) } : { tier: i, cap };
  });
}

/** GET /risk/status → the three P03 signal cards. */
export function signalsFrom(status: RiskStatus, coveragePct?: number): SignalVM[] {
  const sig = status.signals;
  const out: SignalVM[] = [];
  const t = sig.twap;
  if (t) {
    const ratio = t.price_ratio_1h_vs_24h;
    out.push({
      name: "Junior price (TWAP)",
      value: ratio !== undefined ? `${ratio >= 1 ? "+" : "−"}${Math.abs((ratio - 1) * 100).toFixed(1)}% 1h vs 24h` : "—",
      state: t.fired ? "watch" : "ok",
      note: t.fired ? "Junior fell fast against its 24h average" : "Steady against its 24h average",
    });
  }
  const p = sig.repayment_pace;
  if (p) {
    out.push({
      name: "Repayment speed",
      value: p.median_ratio !== null ? `${(p.median_ratio * 100).toFixed(0)}% of plan · ${p.n_measured} shops` : `${p.n_active} active`,
      state: p.fired ? "watch" : "ok",
      note: p.fired ? "Shops are repaying slower than their estimates" : "Shops are repaying on plan",
    });
  }
  out.push({
    name: "Junior coverage",
    value: coverageStr(coveragePct),
    state: coveragePct !== undefined && coveragePct < 15 ? "watch" : "ok",
    note: coveragePct === undefined ? "No advances outstanding" : coveragePct < 15 ? "Below the 15% floor" : "Above the 15% floor",
  });
  return out;
}

export function riskLogFrom(status: RiskStatus): RiskLogVM[] {
  const tick = status.last_tick;
  if (!tick) return [];
  const items: RiskLogVM[] = [];
  if (tick.enforced && tick.tx_hash) {
    items.push({ time: clock(tick.at), title: "Lowered limits", kind: "down", reason: tick.proposal?.rationale ?? `Triggered by ${tick.triggers.join(", ")}. Limits only move down.` });
  } else if (tick.triggers.length) {
    items.push({ time: clock(tick.at), title: "Watching risk signals", kind: "warn", reason: `${tick.triggers.join(", ")}${tick.skipped ? ` (${tick.skipped.replace(/_/g, " ")})` : ""}` });
  } else {
    items.push({ time: clock(tick.at), title: "All signals calm", kind: "neutral", reason: "No trigger fired. No limit change." });
  }
  return items;
}

const EXPLORER_EVENTS = ["Sale", "AdvanceOpened", "StandingPassClaimed", "ShopRegistered", "AdvanceWrittenOff", "LimitsChanged"] as const;

function explorerVM(name: string, e: LogEntry): Omit<ExplorerEventVM, "when"> {
  const a = e.args;
  switch (name) {
    case "Sale":
      return { kind: "Sale", title: `${money(usd(a.amount))} to ${pseudonymOf(a.shopId)}`, detail: `${money(usd(a.amount - a.repayment))} to the shop · ${money(usd(a.repayment))} to its jar`, hash: e.transactionHash };
    case "AdvanceOpened":
      return { kind: "Draw", title: `Vault → ${pseudonymOf(a.shopId)}, ${money(usd(a.amount))}`, detail: `Tier ${a.tier}. Paid to the shop's payout, not to a person`, hash: e.transactionHash };
    case "StandingPassClaimed":
      return { kind: "Proof", title: "Standing Pass claimed", detail: "Commitment only. No onchain link to any earlier shop", hash: e.transactionHash };
    case "ShopRegistered":
      return { kind: "Shop", title: `${pseudonymOf(a.shopId)} created`, detail: "A pseudonym and a payout address. Nothing else", hash: e.transactionHash };
    case "AdvanceWrittenOff":
      return { kind: "Write-off", title: `Advance #${a.id} written off`, detail: `Loss ${money(usd(a.loss))}: junior ${money(usd(a.paidJ))}, reserve ${money(usd(a.fromReserve))}, senior ${money(usd(a.seniorLoss))}`, hash: e.transactionHash };
    case "LimitsChanged":
      return { kind: "Limits", title: "Limits changed", detail: `Tier caps ${(a.caps as bigint[]).map((c) => money(usd(c))).join(" / ")}`, hash: e.transactionHash };
    default:
      return { kind: name, title: name, detail: "", hash: e.transactionHash };
  }
}

export function protocolDomain(ctx: Ctx) {
  const isMock = ctx.mode === "mock";
  return {
    /** P02 Protocol: public totals. */
    async stats(): Promise<ProtocolView> {
      if (isMock) {
        return ctx.mocked({
          vault: { ...L.VAULT },
          feeSplit: L.FEE_SPLIT.map((x) => ({ ...x })),
          tierCaps: L.TIER_CAPS.map((x) => ({ ...x })),
          waterfall: L.waterfall.map((t) => ({ ...t })) as [LossTier, LossTier, LossTier],
          source: "mock" as const,
        });
      }
      const s = await lenderSnapshot(ctx);
      return { vault: s.vault, feeSplit: s.feeSplit, tierCaps: tierCaps(s.snap.tierCaps), waterfall: s.waterfall, source: "chain" };
    },

    /** P03 Risk: GET /risk/status + live caps. "Limits only move down." */
    async risk(): Promise<RiskView> {
      if (isMock) {
        return ctx.mocked({ signals: L.signals.map((x) => ({ ...x })), riskLog: L.riskLog.map((x) => ({ ...x })), tierCaps: L.TIER_CAPS.map((x) => ({ ...x })), triggers: ["junior_twap_drop"], source: "mock" as const });
      }
      const [status, snap] = await Promise.all([ctx.api().riskStatus(), ctx.chain().protocol()]);
      const coverage = coveragePct(snap.juniorAssets, snap.reserve, snap.seniorOutstanding);
      const changed = await ctx.chain().bookLogs("LimitsChanged").catch(() => []);
      const prev = changed.at(-2)?.args.caps as bigint[] | undefined;
      const log: RiskLogVM[] = [...riskLogFrom(status)];
      for (const e of changed.slice(-3).reverse()) {
        log.push({ time: shortDate(await ctx.chain().blockTime(e.blockNumber)), title: "Limits changed onchain", kind: "down", reason: `Tier caps now ${(e.args.caps as bigint[]).map((c) => money(usd(c))).join(" / ")}. Limits only move down automatically.` });
      }
      return {
        signals: signalsFrom(status, coverage),
        riskLog: log,
        tierCaps: tierCaps(snap.tierCaps, snap.tierCapFloors, prev?.map((c) => usd(c))),
        triggers: status.triggers,
        raw: status,
        source: "api",
      };
    },

    /** P04 Explorer: recent public events. No identity anywhere. */
    async explorer(opts: { days?: number; limit?: number } = {}): Promise<ExplorerView> {
      if (isMock) return ctx.mocked({ events: L.explorerEvents.map((x) => ({ ...x })), shops: L.explorerShops.map((x) => ({ ...x })), source: "mock" as const });
      const chain = ctx.chain();
      const latest = await chain.blockNumber();
      const from = latest - BigInt(opts.days ?? 2) * BLOCKS_PER_DAY;
      const now = ctx.now();
      const [book, passes] = await Promise.all([
        Promise.all(EXPLORER_EVENTS.map(async (n) => (await chain.bookLogs(n, undefined, from, latest).catch(() => [])).map((e) => ({ n, e })))),
        chain.registryLogs("LeafInserted", from).catch(() => []),
      ]);
      const all = [...book.flat(), ...passes.map((e) => ({ n: "Pass", e }))].sort((a, b) => Number(b.e.blockNumber - a.e.blockNumber)).slice(0, opts.limit ?? 20);
      const events: ExplorerEventVM[] = await Promise.all(
        all.map(async ({ n, e }) => {
          const base = n === "Pass" ? { kind: "Pass", title: "Business Pass issued", detail: "Commitment only. No name, no sales figures", hash: e.transactionHash } : explorerVM(n, e);
          return { ...base, when: ago(await chain.blockTime(e.blockNumber), now) };
        }),
      );
      const shopEvs = book.flat().filter((x) => x.n === "ShopRegistered");
      const shops: ExplorerShopVM[] = shopEvs.slice(-10).reverse().map(({ e }) => ({
        id: pseudonymOf(e.args.shopId),
        name: "active",
        commitment: e.args.shopId,
        nullifier: "—",
        note: "A pseudonym and a payout address. No name attached.",
      }));
      return { events, shops, source: "chain" };
    },
  };
}

export type ProtocolDomain = ReturnType<typeof protocolDomain>;
