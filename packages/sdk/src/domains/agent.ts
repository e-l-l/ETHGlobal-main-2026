import type { Hex } from "viem";
import type { AgentEvent } from "../api/types.js";
import type { BusinessPassSecret, StandingPassSecret } from "../adapters/vault.js";
import type { Addr, MandateRequestArgs } from "../chain/chain.js";
import type { Ctx } from "../context.js";
import {
  businessNullifier,
  merklePath,
  randomField,
  standingCommitment,
  standingNullifier,
  TAG_COMMIT,
  toHex32,
} from "../credentials.js";
import { merkleWitness } from "../chain/tree.js";
import { MRAError } from "../errors.js";
import * as M from "../mock/merchant.js";
import * as S from "../mock/shop.js";
import type {
  ActivityKind,
  ActivityVM,
  AgentApproveView,
  AgentLimitsVM,
  AgentLogView,
  AgentSetupResult,
  AgentSetupStep,
  AgentSetupView,
  AgentStatus,
  AgentStatusView,
  AgentTriggerResult,
} from "../viewmodels.js";
import { dayLabel, shortDate, toBase, usd } from "./util.js";

const DAY = 86_400;
/** Per-advance chip (USD) → the tier (repaid advances) it needs: the limits ladder. */
const TIER_FOR_CAP: Record<number, number> = { 50: 0, 100: 1, 200: 2, 300: 3 };
const lockedReason = (usdCap: number, need: number) => `$${usdCap} unlocks after ${need} repaid ${need === 1 ? "advance" : "advances"}`;

export type SetupLimits = {
  perAdvance: number;
  perMonth: number;
  purpose?: string;
  /** Default 30 days. */
  periodDays?: number;
  /** Mandate lifetime, default 90 days (backend max 180). */
  expiryDays?: number;
};

export type SetupOptions = {
  onStep?: (s: AgentSetupStep) => void;
  /** Mock mode only: force the World outcome (M08 → M09 demo). */
  mockOutcome?: "approve" | "deny" | "expire";
};

function kindFor(e: AgentEvent): ActivityKind {
  if (/draw|drew/.test(e.action) && !/skip/.test(e.action + e.code)) return "accent";
  if (/revok|denied|expired|fail|error/.test(e.action + e.code)) return "down";
  if (/limit|risk|warn/.test(e.action + e.code)) return "warn";
  return "neutral";
}

function limitsVM(l: { max_per_draw: number; max_per_period: number }, purpose: string): AgentLimitsVM {
  return { perAdvance: usd(l.max_per_draw), perMonth: usd(l.max_per_period), purpose };
}

function permissions(l: AgentLimitsVM) {
  return {
    can: [`Draw up to $${l.perAdvance} at a time for ${l.purpose}`, `Draw up to $${l.perMonth} in a month`, "Only when your sales can repay it"],
    never: [...M.agentPermissions.never],
  };
}


/** Repaid advances this device has proven onchain (a claimed Standing Pass), spent or not. */
export function achievedCount(sp: StandingPassSecret | undefined): number {
  return sp?.claimed ? sp.count : 0;
}

/** The tier this device can prove right now: a claimed, unspent Standing Pass (tier 0 = Business Pass only). */
export function provableTier(sp: StandingPassSecret | undefined): 0 | 1 | 2 | 3 {
  return sp?.claimed && !sp.spent ? (Math.min(sp.count, 3) as 0 | 1 | 2 | 3) : 0;
}

/**
 * A standing_pass proof for `tier`, bound to `context`. The Merkle witness comes from the WHOLE downloaded tree
 * (every LeafInserted, unfiltered) and the path is built locally, so the RPC never learns which leaf is ours. The
 * root is checked against AdvanceBook.isKnownRoot before proving (a lagging RPC that misses newer leaves still
 * gives an older, known root: fine, as long as our leaf is in it).
 */
export async function proveStanding(ctx: Ctx, sp: StandingPassSecret, tier: number, context: bigint) {
  if (!sp.claimed) throw new MRAError("bad_state", "this Standing Pass has not been claimed onchain yet");
  if (sp.spent) throw new MRAError("bad_state", "this Standing Pass was already used; claim the next one after repaying");
  if (!(tier >= 1 && tier <= Math.min(sp.count, 3))) throw new MRAError("bad_state", `this Standing Pass proves up to tier ${Math.min(sp.count, 3)}`);
  const chain = ctx.chain();
  const h2 = (x: bigint[]) => ctx.prover.poseidon2(x);
  const leaves = await chain.leaves("standing");
  const whole = { leaves: async () => leaves };
  const which = sp.leafIndex !== undefined ? { leafIndex: sp.leafIndex } : { commitment: BigInt(sp.commitment) };
  const w = await merkleWitness(whole, h2, "standing", which);
  // A stale leafIndex would only fail deep inside the prover: check it is really our leaf.
  if (leaves[w.leafIndex] !== BigInt(sp.commitment)) throw new MRAError("bad_state", "the Standing Pass leaf on this device does not match the tree");
  if (!(await chain.isKnownStandingRoot(w.root))) throw new MRAError("chain_read_failed", "the downloaded Standing Pass tree does not match the chain yet; try again");
  const secret = BigInt(sp.secret);
  const secretNext = randomField();
  const nullifier = await standingNullifier(h2, secret);
  const next = await standingCommitment(h2, secretNext, sp.count + 1);
  const t0 = Date.now();
  const { proof } = await ctx.prover.prove("standing_pass", {
    secret, count: BigInt(sp.count), path: w.path, index_bits: w.indexBits, secret_next: secretNext,
    root: w.root, nullifier, tier: BigInt(tier), commitment_next: next.commitment, context,
  });
  return {
    proof, root: w.root, nullifier, commitmentNext: next.commitment, leafIndex: w.leafIndex, ms: Date.now() - t0,
    next: { secret: toHex32(secretNext), h: toHex32(next.h), commitment: toHex32(next.commitment), count: sp.count + 1 },
  };
}

export function agentDomain(ctx: Ctx) {
  const isMock = ctx.mode === "mock";

  /** Build the credential proof that registerMandate needs (context = mandateHash % P). */
  async function credentialProof(r: MandateRequestArgs, bp: BusinessPassSecret | undefined, sp: StandingPassSecret | undefined) {
    const chain = ctx.chain();
    const h2 = (x: bigint[]) => ctx.prover.poseidon2(x);
    const context = await chain.mandateContext(r);
    const secretNext = randomField();
    if (r.tier === 0) {
      if (!bp || bp.leafIndex === undefined) throw new MRAError("session_missing", "no Business Pass on this device");
      if (bp.spent) throw new MRAError("bad_state", "this Business Pass was already used for a first advance");
      const [leaves, allowed] = await Promise.all([chain.leaves("business"), chain.countrySet()]);
      const secret = BigInt(bp.secret);
      const { path, indexBits, root } = await merklePath(h2, leaves, bp.leafIndex);
      const nullifier = await businessNullifier(h2, secret);
      const hNext = await h2([secretNext]);
      const commitmentNext = await h2([TAG_COMMIT, hNext, 1n]);
      const { proof } = await ctx.prover.prove("business_pass", {
        secret, country: BigInt(bp.country), revenue_band: BigInt(bp.band), age_ok: BigInt(bp.ageOk), path, index_bits: indexBits,
        secret_next: secretNext, root, nullifier, min_band: BigInt(r.band), commitment_next: commitmentNext, context, allowed_countries: allowed.map(BigInt),
      });
      return { proof, root, nullifier, commitmentNext, next: { secret: toHex32(secretNext), h: toHex32(hNext), commitment: toHex32(commitmentNext), count: 1 } };
    }
    if (!sp || !sp.claimed) throw new MRAError("session_missing", "no claimed Standing Pass on this device");
    const out = await proveStanding(ctx, sp, r.tier, context);
    return { proof: out.proof, root: out.root, nullifier: out.nullifier, commitmentNext: out.commitmentNext, next: out.next, leafIndex: out.leafIndex };
  }

  async function status(): Promise<AgentStatusView> {
    if (isMock) {
      const st = ctx.mock.agentStatus;
      return ctx.mocked({ status: st, active: st === "active", agentLimits: { ...S.agentLimits }, agentId: "0".repeat(32), mandateId: "1", mandateVerified: true, source: "mock" as const });
    }
    const s = await ctx.session();
    if (!s.agentId || !s.manageToken) return { status: "none", active: false, agentLimits: { ...S.agentLimits }, source: "device" };
    const a = await ctx.api().getAgent(s.agentId, s.manageToken);
    const view: AgentStatusView = {
      status: a.status as AgentStatus,
      active: a.status === "active",
      agentLimits: limitsVM(a.limits, s.purpose ?? "stock"),
      agentId: a.id,
      mandateVerified: a.mandate_verified,
      expiry: a.limits.expiry,
      source: "api",
    };
    if (a.mandate_id) {
      view.mandateId = a.mandate_id;
      try {
        const mandate = await ctx.chain().mandate(BigInt(a.mandate_id));
        const used = ctx.now() >= Number(mandate.periodStart) + Number(mandate.period) ? 0n : BigInt(mandate.drawnInPeriod);
        view.remainingAllowance = usd(Number(BigInt(mandate.maxPerPeriod) - used));
        view.expiry = Number(mandate.expiry);
      } catch {
        // A chain read failure must not turn an estimate into a mandate balance.
      }
    }
    return view;
  }

  return {
    /** M07 Agent setup: options and defaults. */
    async setupOptions(): Promise<AgentSetupView> {
      const tier = isMock ? 1 : provableTier(await ctx.vault.get("standing_pass"));
      const view: AgentSetupView = {
        agentLimits: { ...S.agentLimits },
        perAdvanceOptions: M.perAdvanceOptions.map((o) => ({ ...o })),
        perMonthStepper: { ...M.perMonthStepper },
        purposes: [...M.purposes],
        permissions: { can: [...M.agentPermissions.can], never: [...M.agentPermissions.never] },
        source: isMock ? "mock" : "device",
      };
      if (!isMock) {
        // The ladder: $100 needs 1 repaid advance, $200 needs 2, $300 needs 3. Locked until this device
        // can prove it (claimed, and not yet spent on a mandate or draw).
        view.currentTier = tier;
        view.perAdvanceOptions = view.perAdvanceOptions.map((o) => {
          const need = TIER_FOR_CAP[o.value] ?? 0;
          if (tier >= need) return { value: o.value };
          return { value: o.value, lockedReason: lockedReason(o.value, need) };
        });
      }
      return ctx.mocked(view);
    },

    /** M08 Approve dialog content. */
    async approveView(limits?: SetupLimits): Promise<AgentApproveView> {
      if (!limits) return ctx.mocked({ advance: { ...S.advance }, agentLimits: { ...S.agentLimits }, source: "mock" as const });
      const fee = Math.round(limits.perAdvance * 2) / 100;
      return {
        advance: { ...S.advance, purpose: limits.purpose ?? "stock", drawn: limits.perAdvance, fee,
          feeSoFar: 0, owedNow: limits.perAdvance, total: limits.perAdvance, left: limits.perAdvance,
          feeIfRepaidIn1Week: limits.perAdvance * 0.005, feeIfRepaidIn2Weeks: limits.perAdvance * 0.01,
          feeIfRepaidIn4Weeks: limits.perAdvance * 0.02, feeIfRepaidIn6Weeks: limits.perAdvance * 0.03,
          maxFeeBps: 300, annualizedCostPercent: 26, lateFee: 0, lateFeePaid: 0, isBehind: false, lateFeeHint: null,
          repaid: 0, pct: 0 },
        agentLimits: { perAdvance: limits.perAdvance, perMonth: limits.perMonth, purpose: limits.purpose ?? "stock" },
        source: "device",
      };
    },

    /**
     * M07 → M08 → (M10 | M09). Creates the managed agent, gets the World Agent Pass, proves a credential bound to the
     * mandate, has the shop owner sign it, relays registerMandate, and activates the agent.
     */
    async setup(limits: SetupLimits, opts: SetupOptions = {}): Promise<AgentSetupResult> {
      const step = (s: AgentSetupStep) => {
        opts.onStep?.(s);
        ctx.emit("agent.setup", s);
      };
      if (!(limits.perAdvance >= 50 && limits.perAdvance <= 300 && [50, 100, 200, 300].includes(limits.perAdvance) && limits.perMonth >= limits.perAdvance)) {
        throw new MRAError("invalid_limits", "per advance must be $50, $100, $200 or $300 and per month at least that");
      }
      if (isMock) {
        step("creating_agent");
        step("awaiting_agent_pass");
        const payload = opts.mockOutcome ? { mock: opts.mockOutcome } : await ctx.agentPass.authorize({ agentId: "0".repeat(32), nonce: "0" });
        const outcome = "mock" in payload ? payload.mock : "approve";
        if (outcome !== "approve") {
          ctx.mock.agentStatus = outcome === "deny" ? "denied" : "expired";
          return ctx.mocked({ status: outcome === "deny" ? ("denied" as const) : ("expired" as const), agentId: "0".repeat(32), reason: outcome === "deny" ? "denied" : "expired" });
        }
        step("proving_credential");
        step("registering_mandate");
        step("activating");
        ctx.mock.agentStatus = "active";
        step("done");
        return ctx.mocked({ status: "active" as const, agentId: "0".repeat(32), mandateId: "1", txHash: `0x${"ab".repeat(32)}` });
      }

      const api = ctx.api();
      const chain = ctx.chain();
      const s = await ctx.requireShop();
      if (!s.payout) throw new MRAError("session_missing", "shop has no payout address");
      const [bp, sp] = await Promise.all([ctx.vault.get("business_pass"), ctx.vault.get("standing_pass")]);
      const tier = provableTier(sp);
      const band = tier === 0 ? (bp?.band ?? 0) : 0;
      // The contract caps every draw at tierCap[tier]: a mandate above it would register but could never draw that.
      const cap = (await chain.protocol()).tierCaps[tier];
      if (cap !== undefined && toBase(limits.perAdvance) > cap) {
        throw new MRAError("invalid_limits", lockedReason(limits.perAdvance, TIER_FOR_CAP[limits.perAdvance] ?? tier + 1));
      }
      const now = ctx.now();
      const wire = {
        max_per_draw: toBase(limits.perAdvance),
        max_per_period: toBase(limits.perMonth),
        period: (limits.periodDays ?? 30) * DAY,
        expiry: now + (limits.expiryDays ?? 90) * DAY,
      };

      // One agent per shop: the previous one (e.g. the tier-0 agent before a Standing Pass) is stopped once the new
      // one is active, and kept if World denies the new one.
      const prev = s.agentId && s.manageToken ? { agentId: s.agentId, manageToken: s.manageToken, mandateId: s.mandateId } : undefined;
      step("creating_agent");
      const created = await api.createAgent({ shop_id: s.shopId as Hex, tier, recipient: s.payout as Hex, limits: wire });
      // manage_token is shown once: keep it in the vault only.
      await ctx.saveSession({ agentId: created.id, manageToken: created.manage_token, purpose: limits.purpose ?? "stock", mandateId: undefined });

      step("awaiting_agent_pass");
      const passBody = await ctx.agentPass.authorize({ agentId: created.id, nonce: created.agent_pass_nonce });
      const pass = await api.agentPass(created.id, created.manage_token, passBody);
      if (!pass.approved) {
        if (prev) await ctx.saveSession(prev);
        return { status: pass.reason === "expired" ? "expired" : "denied", agentId: created.id, reason: pass.reason };
      }

      step("proving_credential");
      const r: MandateRequestArgs = {
        shopId: s.shopId as Hex,
        agentKey: created.register.agentKey as Addr,
        recipient: s.payout as Addr,
        limits: {
          maxPerDraw: BigInt(created.register.limits.maxPerDraw),
          maxPerPeriod: BigInt(created.register.limits.maxPerPeriod),
          period: BigInt(created.register.limits.period),
          expiry: BigInt(created.register.limits.expiry),
        },
        tier,
        band,
      };
      const cred = await credentialProof(r, bp, sp);
      const ownerSig = await chain.signMandate(r);

      step("registering_mandate");
      const { tx_hash } = await api.relayRegisterMandate({
        shop_id: r.shopId,
        agent_key: r.agentKey,
        recipient: r.recipient,
        limits: wire,
        tier,
        band,
        proof: cred.proof,
        root: cred.root,
        nullifier: cred.nullifier,
        commitment_next: cred.commitmentNext,
        attestation_nonce: BigInt(pass.attestation.nonce),
        attestation_expiry: pass.attestation.expiry,
        attestation_signature: pass.signature,
        owner_signature: ownerSig,
      });
      const receipt = await chain.receipt(tx_hash);
      const reg = chain.parseLogs(receipt).find((l) => l.eventName === "MandateRegistered");
      if (!reg) throw new MRAError("chain_write_failed", "registerMandate did not emit MandateRegistered");
      const mandateId = (reg.args.mandateId as bigint).toString();

      // The credential is spent; its successor waits for claimStandingPass after repayment.
      if (tier === 0 && bp) await ctx.vault.put("business_pass", { ...bp, spent: true });
      if (tier > 0 && sp) {
        // Its nullifier is public now: never prove with it again. The count it attests stays (the ladder shows it).
        await ctx.vault.put("standing_pass", { ...sp, spent: true, ...(cred.leafIndex !== undefined ? { leafIndex: cred.leafIndex } : {}), next: cred.next });
      } else {
        const base: StandingPassSecret = sp ?? { kind: "standing_pass", secret: cred.next.secret, h: cred.next.h, commitment: cred.next.commitment, count: 0, claimed: false };
        await ctx.vault.put("standing_pass", { ...base, next: cred.next });
      }

      step("activating");
      await api.activateAgent(created.id, created.manage_token, { mandate_id: mandateId, tx_hash });
      await ctx.saveSession({ mandateId });
      if (prev && prev.agentId !== created.id) await api.revokeAgent(prev.agentId, prev.manageToken).catch(() => undefined);
      step("done");
      return { status: "active", agentId: created.id, mandateId, txHash: tx_hash };
    },

    /** M15 Manage agent. */
    status,

    /** M14 Agent log. */
    async log(): Promise<AgentLogView> {
      if (isMock) {
        return ctx.mocked({
          agentLimits: { ...S.agentLimits },
          agentSummary: { ...M.agentSummary },
          stats: { ...M.agentStats },
          activity: M.agentActivity.map((a) => ({ ...a })),
          source: "mock" as const,
        });
      }
      const s = await ctx.session();
      if (!s.agentId || !s.manageToken) throw new MRAError("session_missing", "no agent set up on this device");
      const a = await ctx.api().getAgent(s.agentId, s.manageToken);
      const now = ctx.now();
      const skips = a.log.filter((e) => /skip/.test(e.action + e.code));
      const activity: ActivityVM[] = a.log.map((e, i) => ({ id: `e${a.log.length - i}`, time: dayLabel(e.ts, now), kind: kindFor(e), title: e.summary.split(/[.;]/)[0] ?? e.action, reason: e.summary }));
      const last = a.draws.at(-1);
      return {
        agentLimits: limitsVM(a.limits, s.purpose ?? "stock"),
        agentSummary: {
          lastDraw: last ? usd(last.amount) : 0,
          lastDrawWhen: last ? dayLabel(last.ts, now) : "",
          monthUsed: usd(a.draws.filter((d) => d.ts >= now - 30 * DAY).reduce((t, d) => t + d.amount, 0)),
        },
        stats: { draws: a.draws.length, drawsSince: shortDate(a.created_at), skipped: skips.length, skippedReason: skips[0]?.code.replace(/_/g, " ") ?? "" },
        activity,
        source: "api",
      };
    },

    /** M15 danger button. Stops the managed agent (revokeMandate onchain makes it final). */
    async revoke(): Promise<AgentStatusView> {
      if (isMock) {
        ctx.mock.agentStatus = "revoked";
        return status();
      }
      const s = await ctx.session();
      if (!s.agentId || !s.manageToken) throw new MRAError("session_missing", "no agent set up on this device");
      await ctx.api().revokeAgent(s.agentId, s.manageToken);
      return status();
    },

    /** Demo: make the agent consider a draw now (POST /agents/{id}/trigger {run_now}). */
    async trigger(opts: { runNow?: boolean } = {}): Promise<AgentTriggerResult> {
      if (isMock) {
        if (ctx.mock.agentStatus !== "active") throw new MRAError("bad_state", "agent is not active");
        return ctx.mocked({ triggered: true, action: "drew", code: "drew", summary: M.agentActivity[0]!.title });
      }
      const s = await ctx.session();
      if (!s.agentId || !s.manageToken) throw new MRAError("session_missing", "no agent set up on this device");
      const r = await ctx.api().triggerAgent(s.agentId, s.manageToken, opts.runNow ?? true);
      return r.tick ? { triggered: r.triggered, ...r.tick } : { triggered: r.triggered };
    },

    permissions,
  };
}

export type AgentDomain = ReturnType<typeof agentDomain>;
