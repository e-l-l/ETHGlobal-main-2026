import type { Hex } from "viem";
import { businessLeaf, COUNTRY_CODE, randomBytes32, randomField, toHex32, type CountryAlpha2 } from "../credentials.js";
import type { BusinessPassSecret } from "../adapters/vault.js";
import type { Band } from "../adapters/world.js";
import type { Ctx } from "../context.js";
import { ApiError, isMRAError, MRAError } from "../errors.js";
import * as S from "../mock/shop.js";
import type { BusinessPassView, ProveFailReason, ProveResult, ProveSession, ProveStep, ShopView } from "../viewmodels.js";
import { initials, payLinkFor, pseudonymOf } from "./util.js";

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

  return {
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
        return ctx.mocked({ ...base, id: S.SHOP.id, source: "mock" as const });
      }
      const chain = ctx.chain();
      const payout = chain.walletAddress();
      if (!payout) throw new MRAError("wallet_required", "connect the shop's payout wallet (a fresh address) first");
      // Random id: deriving it from the name would link the shop to its owner.
      const shopId = randomBytes32();
      const receipt = await chain.registerShop(shopId, payout);
      const pseudonym = pseudonymOf(shopId);
      await ctx.saveSession({ shopId, pseudonym, shopName: clean, payout });
      return { ...base, id: pseudonym, shopId, payout, txHash: receipt.transactionHash, source: "chain" };
    },
  };
}

export type OnboardingDomain = ReturnType<typeof onboardingDomain>;
