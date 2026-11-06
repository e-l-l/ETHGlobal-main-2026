import { describe, expect, it } from "vitest";
import { SCREENS, createMRA, credentials, mockAgentPass, mockProver, mockReclaim } from "../src/index.js";

describe("mock-mode flows (the demo path)", () => {
  it("onboarding: prove → pass on device → create shop (M02–M06)", async () => {
    const mra = createMRA({ mode: "mock" });
    const steps: string[] = [];
    let url = "";
    const r = await mra.onboarding.proveBusiness({ onStep: (s) => steps.push(s), onRequestUrl: (s) => (url = s.requestUrl) });
    expect(r.ok).toBe(true);
    expect(url).toMatch(/^https:\/\//);
    if (r.ok) expect(r.pass.facts).toEqual([
      { k: "Country", v: "Argentina" },
      { k: "Revenue band", v: "Band 2" },
      { k: "Selling for", v: "6+ months" },
    ]);
    expect(steps).toEqual(["starting", "waiting_for_portal", "proof_received", "issuing", "registering", "saved"]);
    const stored = await mra.raw.vault.get("business_pass");
    expect(stored?.secret).toMatch(/^0x[0-9a-f]{64}$/);
    const shop = await mra.onboarding.createShop("Block Bodega");
    expect(shop).toMatchObject({ name: "Block Bodega", id: "shop_7f3a", initials: "BB", payLink: "pay.[app]/block-bodega" });
  });

  it("onboarding: seeded failing accounts → M05 reasons", async () => {
    const mra = createMRA({ mode: "mock" });
    expect(await mra.onboarding.proveBusiness({ account: "newshop" })).toMatchObject({ ok: false, reason: "too-new" });
    expect(await mra.onboarding.proveBusiness({ account: "suspended" })).toMatchObject({ ok: false, reason: "suspended" });
    expect(await mra.raw.vault.get("business_pass")).toBeUndefined();
  });

  it("agent: approve → active → trigger → revoke; deny → M09", async () => {
    const mra = createMRA({ mode: "mock" });
    const steps: string[] = [];
    const ok = await mra.agent.setup({ perAdvance: 100, perMonth: 200 }, { onStep: (s) => steps.push(s) });
    expect(ok.status).toBe("active");
    expect(steps.at(-1)).toBe("done");
    expect((await mra.agent.trigger()).triggered).toBe(true);
    const { revoke } = mra.agent; // destructured methods keep working
    expect((await revoke()).status).toBe("revoked");
    await expect(mra.agent.trigger()).rejects.toMatchObject({ code: "bad_state" });

    const denied = await createMRA({ mode: "mock", agentPass: mockAgentPass("deny") }).agent.setup({ perAdvance: 100, perMonth: 200 });
    expect(denied.status).toBe("denied");
    await expect(mra.agent.setup({ perAdvance: 10, perMonth: 5 })).rejects.toMatchObject({ code: "invalid_limits" });
  });

  it("merchant: fresh shop rotates the pseudonym and drops the agent (M17)", async () => {
    const mra = createMRA({ mode: "mock" });
    const r = await mra.merchant.freshShop();
    expect(r.previous).toBe("shop_7f3a");
    expect(r.shop.pseudonym).toMatch(/^shop_[0-9a-f]{4}$/);
    expect(r.agentNeedsSetup).toBe(true);
    expect((await mra.agent.status()).active).toBe(false);
  });

  it("pay + cash out + lender deposit are simulated in mock mode", async () => {
    const mra = createMRA({ mode: "mock" });
    expect(await mra.pay.pay("shop_7f3a", 10)).toMatchObject({ amount: 10, toShop: 9.2, toRepayment: 0.8, shopName: "Block Bodega" });
    expect(await mra.merchant.cashOut(100, "bank")).toMatchObject({ status: "simulated" });
    await expect(mra.merchant.cashOut(100, "nowhere")).rejects.toMatchObject({ code: "invalid_request" });
    const steps: string[] = [];
    const tx = await mra.lender.deposit(2500, { onStep: (s) => steps.push(s.label) });
    expect(tx.simulated).toBe(true);
    expect(steps).toEqual(["Approve USDC", "Deposit, receive sUSD"]);
  });

  it("world view varies by step; 'advance' is the canvas default", async () => {
    const mra = createMRA({ mode: "mock" });
    expect((await mra.world.publicView("onboarding")).public).toEqual([]);
    expect((await mra.world.publicView("advance")).public).toHaveLength(6);
    expect((await mra.world.publicView("fresh-shop")).public[0]!.v).toMatch(/links may be inferred/);
  });

  it("mockLatencyMs delays mock responses (spinners)", async () => {
    const mra = createMRA({ mode: "mock", mockLatencyMs: 30 });
    const t = Date.now();
    await mra.merchant.home();
    expect(Date.now() - t).toBeGreaterThanOrEqual(25);
  });

  it("adapters are injectable", async () => {
    const rec = mockReclaim({ account: "nkechi" });
    const s = await rec.start({ band: 1, commitment: "0x01" });
    expect(await rec.wait(s.sessionId)).toMatchObject({ account: "nkechi", band: 1 });
  });
});

describe("credential math", () => {
  it("merkle path recomputes to the root (mock Poseidon2)", async () => {
    const h2 = (x: bigint[]) => mockProver().poseidon2(x);
    const leaves = [11n, 22n, 33n, 44n, 55n];
    const { path, indexBits, root } = await credentials.merklePath(h2, leaves, 2);
    let node = leaves[2]!;
    for (let i = 0; i < path.length; i++) node = indexBits[i] ? await h2([path[i]!, node]) : await h2([node, path[i]!]);
    expect(node).toBe(root);
    expect(path).toHaveLength(credentials.TREE_DEPTH);
  });

  it("random field elements are in range and commitments are 0x+64 lowercase hex", () => {
    for (let i = 0; i < 20; i++) {
      const v = credentials.randomField();
      expect(v > 0n && v < credentials.P).toBe(true);
    }
    expect(credentials.toHex32(255n)).toBe(`0x${"0".repeat(62)}ff`);
    expect(credentials.COUNTRY_CODE).toEqual({ AR: 32, NG: 566, KE: 404 });
  });
});

describe("screen map", () => {
  it("lists all 34 canvas screens exactly once", () => {
    expect(SCREENS).toHaveLength(34);
    expect(new Set(SCREENS.map((s) => s.canvas)).size).toBe(34);
    expect(SCREENS.filter((s) => s.owner === "A")).toHaveLength(15);
  });
});
