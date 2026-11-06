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
    if (!sp || !sp.claimed || sp.leafIndex === undefined) throw new MRAError("session_missing", "no claimed Standing Pass on this device");
    const leaves = await chain.leaves("standing");
    const secret = BigInt(sp.secret);
    const { path, indexBits, root } = await merklePath(h2, leaves, sp.leafIndex);
    const nullifier = await standingNullifier(h2, secret);
    const next = await standingCommitment(h2, secretNext, sp.count + 1);
    const { proof } = await ctx.prover.prove("standing_pass", {
      secret, count: BigInt(sp.count), path, index_bits: indexBits, secret_next: secretNext,
      root, nullifier, tier: BigInt(r.tier), commitment_next: next.commitment, context,
    });
    return { proof, root, nullifier, commitmentNext: next.commitment, next: { secret: toHex32(secretNext), h: toHex32(next.h), commitment: toHex32(next.commitment), count: sp.count + 1 } };
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
      source: "api",
    };
    if (a.mandate_id) view.mandateId = a.mandate_id;
    return view;
  }

  return {
    /** M07 Agent setup: options and defaults. */
    async setupOptions(): Promise<AgentSetupView> {
      const count = isMock ? 1 : ((await ctx.vault.get("standing_pass"))?.count ?? 0);
      const view: AgentSetupView = {
        agentLimits: { ...S.agentLimits },
        perAdvanceOptions: M.perAdvanceOptions.map((o) => ({ ...o })),
        perMonthStepper: { ...M.perMonthStepper },
        purposes: [...M.purposes],
        permissions: { can: [...M.agentPermissions.can], never: [...M.agentPermissions.never] },
        source: isMock ? "mock" : "device",
      };
      if (!isMock) {
        // $250 unlocks after 2 repaid advances (the ladder); unlock it for shops that qualify.
        view.perAdvanceOptions = view.perAdvanceOptions.map((o) => (o.value === 250 && count >= 2 ? { value: 250 } : o));
      }
      return ctx.mocked(view);
    },

    /** M08 Approve dialog content. */
    async approveView(limits?: SetupLimits): Promise<AgentApproveView> {
      if (isMock || !limits) return ctx.mocked({ advance: { ...S.advance }, agentLimits: { ...S.agentLimits }, source: "mock" as const });
      const fee = Math.round(limits.perAdvance * 0.15);
      return {
        advance: { ...S.advance, purpose: limits.purpose ?? "stock", drawn: limits.perAdvance, fee, total: limits.perAdvance + fee, repaid: 0, left: limits.perAdvance + fee, pct: 0 },
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
      if (!(limits.perAdvance >= 50 && limits.perAdvance <= 500 && limits.perMonth >= limits.perAdvance)) {
        throw new MRAError("invalid_limits", "per advance must be $50–500 and per month at least that");
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
      const tier = Math.min(sp?.claimed ? sp.count : 0, 3) as 0 | 1 | 2 | 3;
      const band = tier === 0 ? (bp?.band ?? 0) : 0;
      const now = ctx.now();
      const wire = {
        max_per_draw: toBase(limits.perAdvance),
        max_per_period: toBase(limits.perMonth),
        period: (limits.periodDays ?? 30) * DAY,
        expiry: now + (limits.expiryDays ?? 90) * DAY,
      };

      step("creating_agent");
      const created = await api.createAgent({ shop_id: s.shopId as Hex, tier, recipient: s.payout as Hex, limits: wire });
      // manage_token is shown once: keep it in the vault only.
      await ctx.saveSession({ agentId: created.id, manageToken: created.manage_token, purpose: limits.purpose ?? "stock", mandateId: undefined });

      step("awaiting_agent_pass");
      const passBody = await ctx.agentPass.authorize({ agentId: created.id, nonce: created.agent_pass_nonce });
      const pass = await api.agentPass(created.id, created.manage_token, passBody);
      if (!pass.approved) {
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
      const base: StandingPassSecret = sp ?? { kind: "standing_pass", secret: cred.next.secret, h: cred.next.h, commitment: cred.next.commitment, count: 0, claimed: false };
      await ctx.vault.put("standing_pass", { ...base, next: cred.next });

      step("activating");
      await api.activateAgent(created.id, created.manage_token, { mandate_id: mandateId, tx_hash });
      await ctx.saveSession({ mandateId });
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
