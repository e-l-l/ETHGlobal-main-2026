/**
 * Live-mode Standing Pass flow against stub chain + API (no network): claim (relayed, idempotent, whole-tree leaf
 * lookup), the repaid view's claim button, the agent-setup tier lock, and the tier >= 1 credential proof (whole-tree
 * witness, known root, spent passes refused).
 */
import { describe, expect, it } from "vitest";
import { mockProver } from "../src/adapters/prover.js";
import { MemoryVault, type StandingPassSecret } from "../src/adapters/vault.js";
import { resolveConfig } from "../src/config.js";
import { createContext, type Ctx } from "../src/context.js";
import { merklePath, standingCommitment, standingNullifier } from "../src/credentials.js";
import { agentDomain, proveStanding, provableTier } from "../src/domains/agent.js";
import { merchantDomain } from "../src/domains/merchant.js";

const SHOP = `0x${"5a".repeat(32)}` as const;
const PAYOUT = `0x${"11".repeat(20)}` as const;
const CAPS = [50_000_000n, 100_000_000n, 250_000_000n, 500_000_000n];
const h2 = (x: bigint[]) => mockProver().poseidon2(x);

type Adv = { status: number; credentialClaimed: boolean; pendingCommitment: bigint };

/** A pass this device holds after a tier-0 mandate: unclaimed base + the count-1 successor bound at the draw. */
async function pendingPass(): Promise<{ sp: StandingPassSecret; next: bigint }> {
  const c = await standingCommitment(h2, 777n, 1);
  return {
    sp: { kind: "standing_pass", secret: "0x01", h: "0x02", commitment: "0x03", count: 0, claimed: false, next: { secret: "0x309", h: `0x${c.h.toString(16)}`, commitment: `0x${c.commitment.toString(16)}`, count: 1 } },
    next: c.commitment,
  };
}

function setup(opts: { leaves?: bigint[]; adv?: Partial<Adv>; insertOnClaim?: bigint; knownRoot?: boolean } = {}) {
  const ctx = createContext(resolveConfig({ mode: "sepolia", apiUrl: "http://api.test", vault: new MemoryVault(), prover: mockProver() })) as Ctx;
  const leaves = [...(opts.leaves ?? [11n, 22n])];
  const adv: Adv = { status: 2, credentialClaimed: false, pendingCommitment: 0n, ...opts.adv };
  const calls = { relayClaim: 0, leaves: 0, filteredLogs: [] as unknown[], revoked: [] as string[], prove: [] as Record<string, unknown>[], relayRegister: 0 };
  const chain = {
    addresses: { book: `0x${"bb".repeat(20)}` },
    async shop() {
      return { owner: PAYOUT, payout: PAYOUT, activeAdvanceId: 0n, registered: true };
    },
    async bookLogs(name: string, args?: Record<string, unknown>) {
      if (name === "LeafInserted") calls.filteredLogs.push(args); // must never happen: leaves() is the only tree read
      return name === "AdvanceOpened" ? [{ args: { id: 7n }, blockNumber: 1n }] : [];
    },
    async blockTime() {
      return 1_700_000_000;
    },
    async advance(id: bigint) {
      return { id, shopId: SHOP, principal: 50_000_000n, totalOwed: 57_500_000n, repaid: adv.status === 2 ? 57_500_000n : 0n, holdbackBps: 1000, tier: 0, lastSaleAt: 0n, ...adv };
    },
    async leaves(tree: string) {
      expect(tree).toBe("standing");
      calls.leaves++;
      return leaves.slice();
    },
    async isKnownStandingRoot(root: bigint) {
      if (opts.knownRoot === false) return false;
      const { root: want } = await merklePath(h2, leaves, 0);
      return root === want;
    },
    async receipt() {
      return { status: "success", logs: [] };
    },
    async protocol() {
      return { tierCaps: CAPS };
    },
    async mandateContext() {
      return 4242n;
    },
    async signMandate() {
      return `0x${"aa".repeat(65)}`;
    },
    parseLogs: () => [{ eventName: "MandateRegistered", args: { mandateId: 9n } }],
  };
  const api = {
    async relayClaim(id: bigint) {
      expect(id).toBe(7n);
      calls.relayClaim++;
      adv.credentialClaimed = true;
      if (opts.insertOnClaim !== undefined) leaves.push(opts.insertOnClaim);
      return { tx_hash: `0x${"cc".repeat(32)}` };
    },
    async createAgent() {
      return { id: "agent-new", manage_token: "tok-new", agent_pass_nonce: "n", register: { agentKey: `0x${"22".repeat(20)}`, limits: { maxPerDraw: "100000000", maxPerPeriod: "100000000", period: "2592000", expiry: "1900000000" } } };
    },
    async agentPass() {
      return { approved: true, attestation: { nonce: "5", expiry: 1_900_000_000 }, signature: `0x${"dd".repeat(65)}` };
    },
    async relayRegisterMandate() {
      calls.relayRegister++;
      return { tx_hash: `0x${"ee".repeat(32)}` };
    },
    async activateAgent() {
      return {};
    },
    async revokeAgent(id: string) {
      calls.revoked.push(id);
      return {};
    },
  };
  ctx.chain = () => chain as never;
  ctx.api = () => api as never;
  const prover = ctx.prover;
  ctx.prover = {
    kind: "test",
    poseidon2: (x) => prover.poseidon2(x),
    async prove(circuit, inputs) {
      calls.prove.push({ circuit, ...inputs });
      return { proof: "0x1234", publicInputs: [] };
    },
  };
  return { ctx, calls, leaves, adv };
}

describe("claimStandingPass (live)", () => {
  it("relays the claim, finds the leaf in the WHOLE tree, promotes the pass, proves privately, returns the new limit", async () => {
    const { sp, next } = await pendingPass();
    const { ctx, calls } = setup({ adv: { pendingCommitment: next }, insertOnClaim: next });
    await ctx.saveSession({ shopId: SHOP, payout: PAYOUT });
    await ctx.vault.put("standing_pass", sp);
    const steps: string[] = [];
    const r = await merchantDomain(ctx).claimStandingPass({ onStep: (s) => steps.push(s) });

    expect(calls.relayClaim).toBe(1);
    expect(r).toMatchObject({ txHash: `0x${"cc".repeat(32)}`, leafIndex: 2, repaidCount: 1, tier: 1, newCap: 100 });
    expect(steps).toEqual(["claiming", "finding_leaf", "proving", "done"]);
    expect(calls.filteredLogs).toEqual([]); // privacy: never a LeafInserted query filtered by commitment
    expect(calls.leaves).toBeGreaterThan(0);
    // the private self-check proves tier 1 over the downloaded tree, with the real nullifier
    expect(calls.prove[0]).toMatchObject({ circuit: "standing_pass", tier: 1n, count: 1n, nullifier: await standingNullifier(h2, 0x309n) });
    const saved = await ctx.vault.get("standing_pass");
    expect(saved).toMatchObject({ claimed: true, count: 1, leafIndex: 2, advanceId: "7", commitment: sp.next!.commitment });
    expect(saved?.next).toBeUndefined();

    // A second tap after success: same answer, no second relay, no error.
    const again = await merchantDomain(ctx).claimStandingPass();
    expect(again).toEqual({ leafIndex: 2, repaidCount: 1, tier: 1, newCap: 100 });
    expect(calls.relayClaim).toBe(1);
  });

  it("is idempotent: an already-inserted leaf skips the relay", async () => {
    const { sp, next } = await pendingPass();
    const { ctx, calls } = setup({ leaves: [11n, next], adv: { pendingCommitment: next, credentialClaimed: true } });
    await ctx.saveSession({ shopId: SHOP });
    await ctx.vault.put("standing_pass", sp);
    const r = await merchantDomain(ctx).claimStandingPass({ selfCheck: false });
    expect(calls.relayClaim).toBe(0);
    expect(r.txHash).toBeUndefined();
    expect(r.leafIndex).toBe(1);
    expect(calls.prove).toEqual([]);
  });

  it("refuses an advance that is not repaid, carries no pass, or belongs to another device", async () => {
    const { sp, next } = await pendingPass();
    for (const [adv, msg] of [
      [{ status: 1, pendingCommitment: next }, /not fully repaid/],
      [{ pendingCommitment: 0n }, /carries no Standing Pass/],
      [{ pendingCommitment: next + 1n }, /another device/],
    ] as const) {
      const { ctx, calls } = setup({ adv });
      await ctx.saveSession({ shopId: SHOP });
      await ctx.vault.put("standing_pass", sp);
      await expect(merchantDomain(ctx).claimStandingPass()).rejects.toThrow(msg);
      expect(calls.relayClaim).toBe(0);
    }
  });
});

describe("repaid() and the agent-setup tier lock (live)", () => {
  it("shows the claim button only for this device's repaid, unclaimed pass; tier counts only claimed passes", async () => {
    const { sp, next } = await pendingPass();
    const { ctx } = setup({ adv: { pendingCommitment: next } });
    await ctx.saveSession({ shopId: SHOP });
    await ctx.vault.put("standing_pass", sp);
    const v = await merchantDomain(ctx).repaid();
    expect(v.currentTier).toBe(0);
    expect(v.standingPass).toMatchObject({ claimable: true, nextCap: 100, claimed: false, repaidCount: 0 });

    const other = setup({ adv: { pendingCommitment: next + 1n } });
    await other.ctx.saveSession({ shopId: SHOP });
    await other.ctx.vault.put("standing_pass", sp);
    expect((await merchantDomain(other.ctx).repaid()).standingPass.claimable).toBeUndefined();
  });

  it("locks $100 until a claimed, unspent pass exists; locks it again once spent", async () => {
    const { ctx } = setup();
    const lock = async () => {
      const v = await agentDomain(ctx).setupOptions();
      return { tier: v.currentTier, locked: v.perAdvanceOptions.filter((o) => o.lockedReason).map((o) => o.value) };
    };
    expect(await lock()).toEqual({ tier: 0, locked: [100, 200, 300] });
    const claimed: StandingPassSecret = { kind: "standing_pass", secret: "0x09", h: "0x0", commitment: "0x0", count: 1, claimed: true, leafIndex: 0 };
    await ctx.vault.put("standing_pass", claimed);
    expect(await lock()).toEqual({ tier: 1, locked: [200, 300] });
    await ctx.vault.put("standing_pass", { ...claimed, spent: true });
    expect(await lock()).toEqual({ tier: 0, locked: [100, 200, 300] });
    expect(provableTier({ ...claimed, count: 5 })).toBe(3);
  });
});

describe("tier >= 1 credential (live)", () => {
  async function claimedPass(leaves: bigint[], at: number): Promise<StandingPassSecret> {
    const c = await standingCommitment(h2, 4242n, 1);
    leaves[at] = c.commitment;
    return { kind: "standing_pass", secret: `0x${(4242n).toString(16)}`, h: "0x0", commitment: `0x${c.commitment.toString(16)}`, count: 1, claimed: true };
  }

  it("proves over the whole downloaded tree (path found locally, root checked as known)", async () => {
    const leaves = [11n, 0n, 33n];
    const sp = await claimedPass(leaves, 1);
    const { ctx, calls } = setup({ leaves });
    const out = await proveStanding(ctx, sp, 1, 99n); // no leafIndex on the device: found locally by commitment
    const want = await merklePath(h2, leaves, 1);
    expect(out.leafIndex).toBe(1);
    expect(out.root).toBe(want.root);
    expect(calls.prove[0]).toMatchObject({ tier: 1n, context: 99n, root: want.root, path: want.path, index_bits: want.indexBits });
    expect(out.next.count).toBe(2);
    expect(calls.filteredLogs).toEqual([]);
  });

  it("refuses a spent pass (one nullifier, one use), a stale leaf index, an unknown root, and tiers above the count", async () => {
    const leaves = [11n, 0n];
    const sp = await claimedPass(leaves, 1);
    const { ctx } = setup({ leaves });
    await expect(proveStanding(ctx, { ...sp, spent: true }, 1, 1n)).rejects.toThrow(/already used/);
    await expect(proveStanding(ctx, { ...sp, leafIndex: 0 }, 1, 1n)).rejects.toThrow(/does not match the tree/);
    await expect(proveStanding(ctx, sp, 2, 1n)).rejects.toThrow(/up to tier 1/);
    await expect(proveStanding(ctx, { ...sp, claimed: false }, 1, 1n)).rejects.toThrow(/not been claimed/);
    const unknown = setup({ leaves, knownRoot: false });
    await expect(proveStanding(unknown.ctx, sp, 1, 1n)).rejects.toThrow(/does not match the chain/);
  });

  it("agent.setup at tier 1: refuses $250, registers $100, marks the pass spent, stops the previous agent", async () => {
    const leaves = [11n, 0n];
    const sp = await claimedPass(leaves, 1);
    const { ctx, calls } = setup({ leaves });
    await ctx.saveSession({ shopId: SHOP, payout: PAYOUT, agentId: "agent-old", manageToken: "tok-old", mandateId: "1" });
    await ctx.vault.put("standing_pass", sp);
    const agent = agentDomain(ctx);

    await expect(agent.setup({ perAdvance: 250, perMonth: 250 })).rejects.toMatchObject({ code: "invalid_limits" });
    expect(calls.relayRegister).toBe(0);

    const r = await agent.setup({ perAdvance: 100, perMonth: 100 });
    expect(r).toMatchObject({ status: "active", mandateId: "9" });
    expect(calls.prove.at(-1)).toMatchObject({ circuit: "standing_pass", tier: 1n, context: 4242n });
    const saved = await ctx.vault.get("standing_pass");
    expect(saved).toMatchObject({ spent: true, claimed: true, count: 1, leafIndex: 1, next: { count: 2 } });
    expect(calls.revoked).toEqual(["agent-old"]);
    expect((await ctx.session()).agentId).toBe("agent-new");
    // The spent pass can't back another mandate.
    await expect(agent.setup({ perAdvance: 100, perMonth: 100 })).rejects.toMatchObject({ code: "invalid_limits" });
  });
});
