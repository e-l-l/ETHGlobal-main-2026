/**
 * World ID for borrowers: shop-owner auth, and the World / gradual-unlock fields the merchant screens show.
 *
 * The backend binds one proven human (World ID, IDKit 4) to each shop and keeps only an HMAC of the World
 * nullifier; nothing here ever sees or returns the nullifier.
 */
import type { Hex } from "viem";
import type { HumanStatusResponse, UnlockStatus } from "../api/types.js";
import type { Ctx } from "../context.js";
import { ApiError, MRAError } from "../errors.js";
import * as M from "../mock/merchant.js";
import type { HumanLimitVM, HumanStatusView, UnlockVM } from "../viewmodels.js";
import { usd } from "./util.js";

const DAY = 86_400;
const SHOP_ID = /^0x[0-9a-fA-F]{64}$/;
/** The backend accepts ±600 s; reuse a signature for half of that so screens don't prompt the wallet each render. */
const OWNER_AUTH_REUSE_S = 300;

/**
 * The exact EIP-191 text the shop owner (the wallet that called registerShop) signs:
 *
 *   DripMoni shop owner
 *   shop: <shopId, lowercase 0x + 64 hex>
 *   chain: <chainId>
 *   issued: <unix seconds>
 */
export function ownerAuthMessage(shopId: string, chainId: number, issuedAt: number): string {
  if (!SHOP_ID.test(shopId)) throw new MRAError("invalid_request", "invalid shop id");
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new MRAError("invalid_request", "invalid chain id");
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) throw new MRAError("invalid_request", "invalid issuedAt");
  return `DripMoni shop owner\nshop: ${shopId.toLowerCase()}\nchain: ${chainId}\nissued: ${issuedAt}`;
}

/**
 * `Authorization` header value for owner-only agents-API routes: `Owner <issuedAt>:<signature>`.
 * `signer` is anything with an EIP-191 `signMessage(text)`, e.g. `mra.raw.chain()`.
 */
export async function ownerAuthHeader(
  signer: { signMessage(text: string): Promise<Hex | string> },
  shopId: string,
  chainId: number,
  issuedAt: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const sig = await signer.signMessage(ownerAuthMessage(shopId, chainId, issuedAt));
  return `Owner ${issuedAt}:${sig}`;
}

const authCache = new WeakMap<Ctx, { key: string; issuedAt: number; value: string }>();

/** Owner auth for this device's shop wallet, reused for a few minutes (one wallet prompt, not one per screen). */
export async function ownerAuthFor(ctx: Ctx, shopId: string): Promise<string> {
  const chain = ctx.chain();
  const addr = chain.walletAddress();
  if (!addr) throw new MRAError("wallet_required", "connect the shop's owner wallet first");
  const chainId = ctx.network().chainId;
  const key = `${addr.toLowerCase()}|${shopId.toLowerCase()}|${chainId}`;
  const now = ctx.now();
  const hit = authCache.get(ctx);
  if (hit && hit.key === key && now - hit.issuedAt < OWNER_AUTH_REUSE_S && now >= hit.issuedAt) return hit.value;
  const value = await ownerAuthHeader(chain, shopId, chainId, now);
  authCache.set(ctx, { key, issuedAt: now, value });
  return value;
}

/** Forget the cached owner auth (e.g. after a 401). */
export function clearOwnerAuth(ctx: Ctx) {
  authCache.delete(ctx);
}

export function unlockVM(u: UnlockStatus): UnlockVM {
  return {
    tier: u.tier,
    limit: u.limit_usd,
    availableNow: u.available_now_usd,
    unlockedPct: u.unlocked_pct,
    goodWeeks: u.good_weeks,
    frozen: u.frozen,
    nextUnlockAt: u.next_unlock_at ?? null,
    steps: (u.steps ?? []).map((s) => ({ pct: s.pct, amount: s.amount_usd, unlocked: s.unlocked })),
    reasons: [...(u.reasons ?? [])],
  };
}

/** Safe defaults when the status can't be read: not verified, not banned, the tier cap as limit and available. */
export function fallbackHumanLimit(limit = 0): HumanLimitVM {
  return { humanVerified: false, banned: false, limit, availableNow: limit, nextUnlockAt: null, unlockSteps: [] };
}

/** GET /shops/{id}/human (owner view) → the fields the merchant screens spread in. */
export function humanLimitFrom(r: HumanStatusResponse, fallbackLimit = 0): HumanLimitVM {
  const u = r.unlock ? unlockVM(r.unlock) : null;
  return {
    humanVerified: r.verified === true,
    banned: r.banned === true,
    limit: u?.limit ?? fallbackLimit,
    availableNow: u ? u.availableNow : r.banned ? 0 : fallbackLimit,
    nextUnlockAt: u?.nextUnlockAt ?? null,
    unlockSteps: u?.steps ?? [],
  };
}

/** `{ tier, fallbackLimit }` for humanLimit: the tier's cap from the chain, 0 when it can't be read. */
export async function tierLimit(ctx: Ctx, tier: number | undefined): Promise<{ tier: number; fallbackLimit: number }> {
  const t = Math.max(0, Math.min(Math.trunc(Number(tier ?? 0)) || 0, 3));
  try {
    const p = await ctx.chain().protocol();
    return { tier: t, fallbackLimit: usd(p.tierCaps[t] ?? 0n) };
  } catch {
    return { tier: t, fallbackLimit: 0 };
  }
}

export function mockHumanLimit(ctx: Ctx): HumanLimitVM {
  return {
    ...structuredClone(M.humanLimit),
    humanVerified: ctx.mock.humanVerified,
    nextUnlockAt: ctx.now() + 7 * DAY,
  };
}

export function mockHumanStatus(ctx: Ctx): HumanStatusView {
  const h = mockHumanLimit(ctx);
  const unlock: UnlockVM | null = h.humanVerified
    ? { tier: 1, limit: h.limit, availableNow: h.availableNow, unlockedPct: 50, goodWeeks: 0, frozen: false, nextUnlockAt: h.nextUnlockAt, steps: h.unlockSteps, reasons: [] }
    : null;
  return { humanVerified: h.humanVerified, banned: false, unlock, source: "mock" };
}

/**
 * Real modes: this shop's World / unlock fields at `tier`. Never throws: with no shop, no wallet or a failed call it
 * returns `fallbackHumanLimit(fallbackLimit)`.
 */
export async function humanLimit(ctx: Ctx, opts: { tier?: number; fallbackLimit?: number } = {}): Promise<HumanLimitVM> {
  const fallback = opts.fallbackLimit ?? 0;
  try {
    const s = await ctx.session();
    if (!s.shopId || !ctx.chain().walletAddress()) return fallbackHumanLimit(fallback);
    const auth = await ownerAuthFor(ctx, s.shopId);
    const r = await ctx.api().humanStatus(s.shopId as Hex, auth, opts.tier);
    return humanLimitFrom(r, fallback);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) clearOwnerAuth(ctx);
    return fallbackHumanLimit(fallback);
  }
}
