import type { Hex } from "viem";
import { businessLeaf, COUNTRY_CODE, randomBytes32, randomField, toHex32, type CountryAlpha2 } from "../credentials.js";
import type { BusinessPassSecret } from "../adapters/vault.js";
import type { Band } from "../adapters/world.js";
import type { Ctx } from "../context.js";
import { ApiError, isMRAError, MRAError } from "../errors.js";
import * as S from "../mock/shop.js";
import { reasonMessage } from "../reasons.js";
import type {
  BusinessPassView,
  HumanCheckResult,
  HumanCheckStep,
  HumanStatusView,
  HumanVerifyResult,
  HumanVerifyStep,
  ProveFailReason,
  ProveResult,
  ProveSession,
  ProveStep,
  ShopHumanBinding,
  ShopView,
} from "../viewmodels.js";
import { clearOwnerAuth, mockHumanStatus, ownerAuthFor, unlockVM } from "./human.js";
import { initials, payLinkFor, payUrlFor, pseudonymOf } from "./util.js";

const COUNTRY_NAME: Record<number, string> = { 32: "Argentina", 566: "Nigeria", 404: "Kenya" };
const BAND_RANGE: Record<number, string> = { 1: "$500–2,000 a month", 2: S.SHOP.bandRange, 3: "$10,000+ a month" };

/** Issuer error → M05 reason. `predicate_failed:{active|age_ok|country|band_ge_N}`. */
export function failReasonFor(code: string): ProveFailReason | "error" {
  if (code === "predicate_failed:age_ok") return "too-new";
  if (code === "predicate_failed:active") return "suspended";
  if (code.startsWith("predicate_failed:band_ge")) return "revenue-low";
  return "error";
}

/** Demo-portal seeded accounts → their mock outcome (matches the issuer's ISSUER_MOCK accounts). */
const MOCK_ACCOUNT_OUTCOME: Record<string, ProveFailReason | undefined> = { newshop: "too-new", suspended: "suspended", lowrevenue: "revenue-low" };

export function passView(bp: Pick<BusinessPassSecret, "country" | "band" | "commitment" | "leafIndex">, source: BusinessPassView["source"], txHash?: string): BusinessPassView {
  const country = COUNTRY_NAME[bp.country] ?? `#${bp.country}`;
  const view: BusinessPassView = {
    country,
    band: String(bp.band),
    bandRange: BAND_RANGE[bp.band] ?? "",
    months: S.SHOP.months,
    facts: [
      { k: "Country", v: country },
      { k: "Revenue band", v: `Band ${bp.band}` },
      { k: "Selling for", v: S.SHOP.months },
    ],
    commitment: bp.commitment,
    source,
  };
  if (bp.leafIndex !== undefined) view.leafIndex = bp.leafIndex;
  if (txHash) view.txHash = txHash;
  return view;
}

export type StartProofOptions = {
  band?: Band;
  country?: CountryAlpha2;
  /** Demo: seeded demo-portal account (donpepe passes; newshop / suspended fail). */
  account?: string;
};

/** World ID check tickets live 30 min on the backend; treat them as stale a minute early (clock skew). */
const TICKET_SKEW_S = 60;
const TICKET_CODES = new Set(["ticket_expired", "ticket_invalid", "ticket_used", "ticket_owner_mismatch"]);
type MockWorld = "eligible" | "banned" | "open_advance";

/** Mock mode's World ID check outcome: `cfg.mockWorld`, else `?mockWorld=banned|open_advance|eligible` in the URL. */
export function mockWorldMode(cfgValue?: MockWorld): MockWorld {
  if (cfgValue) return cfgValue;
  let q: string | null = null;
  try {
    const search = (globalThis as { location?: { search?: string } }).location?.search;
    q = search ? new URLSearchParams(search).get("mockWorld") : null;
  } catch {
    q = null;
  }
  if (q === "banned") return "banned";
  if (q === "open_advance" || q === "open-advance" || q === "open") return "open_advance";
  return "eligible";
}

type Pending = { secret: bigint; h: bigint; leaf: bigint; band: Band; country: number; account?: string };

export function onboardingDomain(ctx: Ctx) {
  const isMock = ctx.mode === "mock";
  const pending = new Map<string, Pending>();

  async function startProof(opts: StartProofOptions = {}): Promise<ProveSession> {
    const band = opts.band ?? 2;
    const country = COUNTRY_CODE[opts.country ?? "AR"];
    // The pass secret is generated here, on the device, and never leaves it (only the commitment does).
    const secret = randomField();
    const { h, leaf } = await businessLeaf((x) => ctx.prover.poseidon2(x), secret, country, band, 1);
    const session = await ctx.reclaim.start({ band, commitment: toHex32(leaf), ...(opts.account ? { account: opts.account } : {}) });
    pending.set(session.sessionId, { secret, h, leaf, band, country, ...(opts.account ? { account: opts.account } : {}) });
    return session;
  }

  async function finishProof(sessionId: string, o: { onStep?: (s: ProveStep) => void; signal?: AbortSignal } = {}): Promise<ProveResult> {
    const p = pending.get(sessionId);
    if (!p) throw new MRAError("not_found", "unknown proof session: call startProof first");
    const step = (s: ProveStep) => {
      o.onStep?.(s);
      ctx.emit("onboarding.prove", s);
    };
    step("waiting_for_portal");
    const proof = await ctx.reclaim.wait(sessionId, { ...(o.signal ? { signal: o.signal } : {}) });
    step("proof_received");
    const record: BusinessPassSecret = {
      kind: "business_pass",
      secret: toHex32(p.secret),
      h: toHex32(p.h),
      commitment: toHex32(p.leaf),
      country: p.country,
      band: p.band,
      ageOk: 1,
      chainId: ctx.network().chainId,
      issuedAt: ctx.now(),
    };

    if (isMock) {
      step("issuing");
      const fail = MOCK_ACCOUNT_OUTCOME[p.account ?? ""];
      if (fail) return { ok: false, reason: fail, code: `mock:${fail}` };
      step("registering");
      await ctx.vault.put("business_pass", { ...record, leafIndex: 0 });
      step("saved");
      pending.delete(sessionId);
      return ctx.mocked({ ok: true as const, pass: mockPass() });
    }

    step("issuing");
    let att;
    try {
      att = await ctx.issuer().issue({ proof, commitment: record.commitment as Hex, band: p.band, h: record.h as Hex, country: p.country });
    } catch (e) {
      if (e instanceof ApiError && e.status !== 429 && e.status < 500) return { ok: false, reason: failReasonFor(String(e.code)), code: String(e.code) };
      throw e;
    }
    // Save the secret before the transaction, so a failed send can be retried without a new proof.
    await ctx.vault.put("business_pass", record);
    step("registering");
    const chain = ctx.chain();
    await ctx.ensureFunded();
    const receipt = await chain.issueBusinessPass(att, att.signature);
    const ev = chain.parseLogs(receipt).find((l) => l.eventName === "BusinessPassIssued" || l.eventName === "LeafInserted");
    const leafIndex = ev ? Number(ev.args.leafIndex) : undefined;
    const saved = { ...record, ...(leafIndex !== undefined ? { leafIndex } : {}) };
    await ctx.vault.put("business_pass", saved);
    step("saved");
    pending.delete(sessionId);
    return { ok: true, pass: passView(saved, "chain", receipt.transactionHash) };
  }

  function mockPass(): BusinessPassView {
    return { ...passView({ country: 32, band: Number(S.SHOP.band), commitment: "0x4c1e9a88b2d04f17c6aa0912e77b33d0a15f8c21", leafIndex: 0 }, "mock") };
  }

  /**
   * World ID for borrowers: bind a unique human (IDKit, Proof of Human, borrower action) to this device's shop.
   * Required before the first offer. A 4xx from the backend comes back as `{ verified: false, reason: code }`.
   */
  async function verifyHuman(opts: { onStep?: (s: HumanVerifyStep) => void } = {}): Promise<HumanVerifyResult> {
    const step = (s: HumanVerifyStep) => {
      opts.onStep?.(s);
      ctx.emit("onboarding.human", s);
    };
    if (isMock) {
      step("verifying_human");
      const res = await ctx.idkit.verify({ purpose: "borrower" });
      if (res.mock !== undefined && res.mock !== "approve") return ctx.mocked({ verified: false as const, reason: "verification_failed" });
      ctx.mock.humanVerified = true;
      step("verified");
      return ctx.mocked({ verified: true as const });
    }
    const s = await ctx.requireShop();
    step("signing_owner");
    const auth = await ownerAuthFor(ctx, s.shopId);
    step("verifying_human");
    const proof = await ctx.idkit.verify({ purpose: "borrower" });
    try {
      await ctx.api().bindHuman(s.shopId as Hex, auth, proof);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        if (e.status === 401) clearOwnerAuth(ctx);
        return { verified: false, reason: String(e.code) };
      }
      throw e;
    }
    step("verified");
    return { verified: true };
  }

  /**
   * World ID FIRST (the screen right after /onboarding, before any business step): IDKit proof of human →
   * POST /world/borrower/check for this device's wallet. Eligible → the one-use ticket is saved in the vault and
   * `createShop()` binds it. Not eligible → `{ eligible: false, reason, message }` for the stop screen. Mock mode:
   * `cfg.mockWorld` or `?mockWorld=banned|open_advance`.
   */
  async function checkHuman(opts: { onStep?: (s: HumanCheckStep) => void } = {}): Promise<HumanCheckResult> {
    const step = (s: HumanCheckStep) => {
      opts.onStep?.(s);
      ctx.emit("onboarding.human_check", s);
    };
    const stop = (reason: string, source: "mock" | "api"): HumanCheckResult => {
      step("stopped");
      return { eligible: false, reason, message: reasonMessage(reason), source };
    };
    step("verifying_human");
    if (isMock) {
      const res = await ctx.idkit.verify({ purpose: "borrower" });
      step("checking");
      if (res.mock !== undefined && res.mock !== "approve") return ctx.mocked(stop("verification_failed", "mock"));
      const w = mockWorldMode(ctx.cfg.mockWorld);
      if (w !== "eligible") {
        await ctx.vault.delete("world_ticket");
        return ctx.mocked(stop(w === "banned" ? "human_banned" : "human_has_open_advance", "mock"));
      }
      const expiresAt = ctx.now() + 30 * 60;
      await ctx.vault.put("world_ticket", { kind: "world_ticket", ticket: "mock-ticket", owner: "mock", expiresAt, chainId: ctx.network().chainId });
      step("eligible");
      return ctx.mocked({ eligible: true as const, expiresAt, source: "mock" as const });
    }
    const owner = ctx.chain().walletAddress();
    if (!owner) throw new MRAError("wallet_required", "create or connect this device's shop wallet first");
    const proof = await ctx.idkit.verify({ purpose: "borrower" });
    step("checking");
    let r;
    try {
      r = await ctx.api().checkHuman(owner, proof);
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) return stop(String(e.code), "api");
      throw e;
    }
    if (!r.eligible) {
      await ctx.vault.delete("world_ticket");
      return stop(r.reason, "api");
    }
    await ctx.vault.put("world_ticket", { kind: "world_ticket", ticket: r.ticket, owner: owner.toLowerCase(), expiresAt: r.expires_at, chainId: ctx.network().chainId });
    step("eligible");
    return { eligible: true, expiresAt: r.expires_at, source: "api" };
  }

  /**
   * Bind this device's shop to the human from `checkHuman()` using the stored ticket (no second scan), then clear it.
   * `createShop()` calls this for you; call it again only when `createShop().human` asked to retry
   * (`needsWorldId: false`), or after a fresh `checkHuman()` (`needsWorldId: true`). Never throws.
   */
  async function bindHumanTicket(): Promise<ShopHumanBinding> {
    const needs = (reason: string, needsWorldId = true): ShopHumanBinding => ({ verified: false, needsWorldId, reason });
    try {
      const t = await ctx.vault.get("world_ticket");
      if (!t) return needs("no_ticket");
      if (t.expiresAt - TICKET_SKEW_S <= ctx.now()) {
        await ctx.vault.delete("world_ticket");
        return needs("ticket_expired");
      }
      if (isMock) {
        ctx.mock.humanVerified = true;
        await ctx.vault.delete("world_ticket");
        return { verified: true };
      }
      const s = await ctx.requireShop();
      const addr = ctx.chain().walletAddress();
      if (!addr || addr.toLowerCase() !== t.owner) {
        await ctx.vault.delete("world_ticket");
        return needs("ticket_owner_mismatch");
      }
      const auth = await ownerAuthFor(ctx, s.shopId);
      try {
        await ctx.api().bindHumanTicket(s.shopId as Hex, auth, t.ticket);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) clearOwnerAuth(ctx);
        if (e instanceof ApiError && TICKET_CODES.has(String(e.code))) {
          await ctx.vault.delete("world_ticket");
          return needs(String(e.code));
        }
        return needs(e instanceof ApiError ? String(e.code) : "upstream_failed", false);
      }
      await ctx.vault.delete("world_ticket");
      return { verified: true };
    } catch (e) {
      return needs(isMRAError(e) ? String(e.code) : "upstream_failed", false);
    }
  }

  /** World ID status of this device's shop: verified, banned, and the gradual unlock at `tier` (owner view). */
  async function humanStatus(opts: { tier?: 0 | 1 | 2 | 3 } = {}): Promise<HumanStatusView> {
    if (isMock) return ctx.mocked(mockHumanStatus(ctx));
    const s = await ctx.requireShop();
    const auth = await ownerAuthFor(ctx, s.shopId);
    let r;
    try {
      r = await ctx.api().humanStatus(s.shopId as Hex, auth, opts.tier);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) clearOwnerAuth(ctx);
      throw e;
    }
    return { humanVerified: r.verified === true, banned: r.banned === true, unlock: r.unlock ? unlockVM(r.unlock) : null, source: "api" };
  }

  return {
    /** World ID FIRST (before any business step): IDKit → POST /world/borrower/check → ticket on the device. */
    checkHuman,
    /** Bind the shop with the stored ticket (createShop does this automatically). */
    bindHumanTicket,
    /** Legacy / re-verify: sign as shop owner → IDKit proof of human → POST /shops/{id}/human (needs a shop). */
    verifyHuman,
    /** World ID status + gradual unlock for this device's shop (GET /shops/{id}/human with owner auth). */
    humanStatus,

    /** M02: start the zkTLS session. Show `requestUrl` (open on the phone, or as a QR on desktop). */
    startProof,
    /** M03: wait for the proof → issuer → BusinessPassRegistry.issue → pass saved on this device. */
    finishProof,

    /** M02 → M03 → M04/M05 in one call. `onRequestUrl` fires as soon as the portal link is ready. */
    async proveBusiness(opts: StartProofOptions & { onRequestUrl?: (s: ProveSession) => void; onStep?: (s: ProveStep) => void; signal?: AbortSignal } = {}): Promise<ProveResult> {
      opts.onStep?.("starting");
      try {
        const s = await startProof(opts);
        opts.onRequestUrl?.(s);
        return await finishProof(s.sessionId, opts);
      } catch (e) {
        if (isMRAError(e) && String(e.code).startsWith("predicate_failed")) return { ok: false, reason: failReasonFor(String(e.code)), code: String(e.code) };
        throw e;
      }
    },

    /** M04 Business Pass (from this device). */
    async pass(): Promise<BusinessPassView | null> {
      if (isMock) return ctx.mocked(mockPass());
      const bp = await ctx.vault.get("business_pass");
      return bp ? passView(bp, "device") : null;
    },

    /** M06 name ideas. */
    nameIdeas: () => [...S.SHOP_NAME_IDEAS] as string[],

    /** M06 Create shop: a fresh pseudonymous shop id + payout. Nothing about the owner. */
    async createShop(name: string = S.SHOP.name): Promise<ShopView> {
      const clean = name.trim().slice(0, 40) || S.SHOP.name;
      const base = { name: clean, initials: initials(clean), payLink: payLinkFor(clean), nameIdeas: [...S.SHOP_NAME_IDEAS] as string[] };
      if (isMock) {
        await ctx.saveSession({ shopName: clean, pseudonym: S.SHOP.id });
        const human = await bindHumanTicket();
        return ctx.mocked({ ...base, id: S.SHOP.id, human, source: "mock" as const });
      }
      const chain = ctx.chain();
      const payout = chain.walletAddress();
      if (!payout) throw new MRAError("wallet_required", "connect the shop's payout wallet (a fresh address) first");
      await ctx.ensureFunded();
      // Random id: deriving it from the name would link the shop to its owner.
      const shopId = randomBytes32();
      const receipt = await chain.registerShop(shopId, payout);
      const pseudonym = pseudonymOf(shopId);
      await ctx.saveSession({ shopId, pseudonym, shopName: clean, payout });
      // World ID FIRST: bind the shop to the human checked before any business step (stored ticket, no second scan).
      const human = await bindHumanTicket();
      return { ...base, payLink: payUrlFor(ctx.cfg.payUrl, clean, shopId), id: pseudonym, shopId, payout, txHash: receipt.transactionHash, human, source: "chain" };
    },
  };
}

export type OnboardingDomain = ReturnType<typeof onboardingDomain>;
