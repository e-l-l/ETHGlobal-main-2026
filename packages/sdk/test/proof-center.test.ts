import { encodeFunctionData, keccak256, toHex, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import { advanceBookAbi } from "../src/abi/index.js";
import { createProofLog, withProofLog } from "../src/adapters/proof-log.js";
import { mockProver, type Prover } from "../src/adapters/prover.js";
import { MemoryVault } from "../src/adapters/vault.js";
import { aiFromSources, decodeProofCall, pickPerKind, proofNote, publicInputRows, shortHash, txVM, OFFER_TYPE_STRING } from "../src/domains/proofs.js";
import { createMRA, deploymentFor } from "../src/index.js";

/** A 32-byte field element "0x<head>…<tail>" (head < 0x30 keeps it below the BN254 modulus). */
const field = (head: string, tail: string) => BigInt(`0x${head}${"0".repeat(56)}${tail}`);
const PROOF = `0x${"ab".repeat(7_616)}` as Hex; // the real UltraHonk proof length for both circuits
const offer = (tier: number, over: Record<string, unknown> = {}) => ({
  offerId: `0x${"01".repeat(32)}` as Hex,
  shopId: `0x7f3a${"00".repeat(30)}` as Hex,
  recipient: "0x1111111111111111111111111111111111111111" as const,
  amount: 100_000_000n,
  feeRateBpsPerWeek: 50,
  feeCapBps: 300,
  holdbackBps: 800,
  tier,
  passNullifier: tier === 0 ? field("1b5e", "a03d") : 0n,
  minRevenueBand: tier === 0 ? 2 : 0,
  expiresAt: 1_900_000_000n,
  ...over,
});
const SIG = `0x${"cd".repeat(65)}` as Hex;
const ROOT = field("2a90", "c4f1");
const NULL = field("88aa", "e901");
const NEXT = field("0b77", "41c9");

describe("proofCenter: mock mode", () => {
  const mra = createMRA({ mode: "mock" });

  it("returns every section with a realistic shape", async () => {
    const v = await mra.protocol.proofCenter();
    expect(v.source).toBe("mock");
    expect(v.errors).toEqual([]);
    expect(v.explorer).toMatchObject({ name: "Etherscan", baseUrl: "https://sepolia.etherscan.io", appRoute: "/explorer" });

    const d = deploymentFor("sepolia");
    expect(v.contracts.map((c) => c.name)).toEqual([
      "AdvanceBook", "BusinessPassRegistry", "HonkVerifier", "BusinessPassVerifier", "SeniorVault", "DripCoin (JuniorVault)", "RiskHook", "PoolManager", "USDC",
    ]);
    for (const c of v.contracts) {
      expect(c.codeSize).toBeGreaterThan(0);
      expect(c.explorerUrl).toBe(`https://sepolia.etherscan.io/address/${c.address}`);
      expect(c.role.length).toBeGreaterThan(10);
    }
    expect(v.contracts[0]!.address).toBe(d.AdvanceBook);

    const kinds = new Set(v.zkProofs.map((z) => z.kind));
    expect(kinds).toEqual(new Set(["business_pass", "standing_pass", "pass_issued"]));
    const first = v.zkProofs.find((z) => z.fn === "drawFirst")!;
    expect(first).toMatchObject({ circuit: "business_pass", proofBytes: 7_616, publicInputCount: 9, verifier: { name: "BusinessPassVerifier", address: d.BusinessPassVerifier } });
    const repeat = v.zkProofs.find((z) => z.fn === "drawWithPass")!;
    expect(repeat).toMatchObject({ circuit: "standing_pass", publicInputCount: 5, verifier: { name: "HonkVerifier", address: d.HonkVerifier } });
    expect(repeat.nullifierShort).toMatch(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/);
    for (const z of v.zkProofs) expect(z.note.length).toBeGreaterThan(20);

    expect(v.deviceProofs.length).toBeGreaterThan(0);
    expect(v.deviceProofs[0]).toMatchObject({ ok: true, proofBytes: 7_616, prover: "worker" });
    expect(new Set(v.transactions.map((t) => t.kind)).size).toBeGreaterThanOrEqual(8);
    expect(v.transactionCounts.sale).toBeGreaterThan(0);
    expect(v.ai.source).toBe("mock");
    expect(v.ai.latest.length).toBeLessThanOrEqual(5);
    expect(v.privacy.neverStored.map((x) => x.label).join(" ")).toMatch(/World ID nullifier/);
    expect(v.privacy.rpc.mode).toBe("none");
    expect(v.checks.map((c) => c.id)).toEqual(["contracts_have_code", "offer_hash_matches", "verifiers_wired", "contracts_wired", "pool_live", "oracle_live"]);
    expect(v.checks.every((c) => c.ok === true)).toBe(true);
  });

  it("honours limits and skipChecks; never shares its mock objects", async () => {
    const v = await mra.protocol.proofCenter({ limit: 2, txLimit: 3, deviceLimit: 1, skipChecks: true });
    expect(v.zkProofs).toHaveLength(2);
    expect(v.transactions).toHaveLength(3);
    expect(v.deviceProofs).toHaveLength(1);
    expect(v.checks).toEqual([]);
    v.contracts[0]!.name = "changed";
    expect((await mra.protocol.proofCenter()).contracts[0]!.name).toBe("AdvanceBook");
  });
});

describe("decodeProofCall: a draw tx's proof argument", () => {
  it("drawFirst → business_pass, proof length, public inputs", () => {
    const input = encodeFunctionData({ abi: advanceBookAbi, functionName: "drawFirst", args: [offer(0), SIG, PROOF, ROOT, NEXT] });
    const c = decodeProofCall(input)!;
    expect(c).toMatchObject({ fn: "drawFirst", circuit: "business_pass", proofBytes: 7_616, publicInputCount: 9, root: ROOT, commitmentNext: NEXT, minBand: 2, tier: 0 });
    expect(c.nullifier).toBe(offer(0).passNullifier);
    const rows = publicInputRows(c, [32, 484, 76, 170]);
    expect(rows.map((r) => r.label)).toEqual(["Business Pass root", "Nullifier (one-time)", "Minimum revenue band", "Next commitment", "Context (binds recipient + offer)", "Allowed countries"]);
    expect(rows[0]!.value).toBe("0x2a90…c4f1");
    expect(rows[2]!.value).toBe("2");
    expect(rows[5]!.value).toBe("AR, MX, BR, CO");
    expect(proofNote(c)).toMatch(/would revert if the proof were fake/);
  });

  it("drawWithPass → standing_pass with its own nullifier", () => {
    const input = encodeFunctionData({ abi: advanceBookAbi, functionName: "drawWithPass", args: [offer(2), SIG, PROOF, ROOT, NULL, NEXT] });
    const c = decodeProofCall(input)!;
    expect(c).toMatchObject({ fn: "drawWithPass", circuit: "standing_pass", proofBytes: 7_616, publicInputCount: 5, nullifier: NULL, tier: 2 });
    expect(shortHash(c.nullifier)).toBe("0x88aa…e901");
    expect(publicInputRows(c).find((r) => r.label === "Tier proven")!.value).toBe("2");
  });

  it("registerMandate carries the proof; drawByMandate carries none", () => {
    const r = {
      shopId: offer(1).shopId,
      agentKey: "0x2222222222222222222222222222222222222222" as const,
      recipient: offer(1).recipient,
      limits: { maxPerDraw: 100_000_000n, maxPerPeriod: 200_000_000n, period: 2_592_000n, expiry: 1_900_000_000n },
      tier: 1,
      band: 0,
    };
    const reg = encodeFunctionData({
      abi: advanceBookAbi,
      functionName: "registerMandate",
      args: [r, { proof: PROOF, root: ROOT, nullifier: NULL, commitmentNext: NEXT }, { nonce: 1n, expiry: 1_900_000_000n, signature: SIG }, SIG],
    });
    expect(decodeProofCall(reg)).toMatchObject({ fn: "registerMandate", circuit: "standing_pass", proofBytes: 7_616, publicInputCount: 5, nullifier: NULL, tier: 1 });

    const draw = encodeFunctionData({ abi: advanceBookAbi, functionName: "drawByMandate", args: [offer(1), SIG, 3n, SIG] });
    const c = decodeProofCall(draw)!;
    expect(c).toMatchObject({ fn: "drawByMandate", circuit: "standing_pass", mandateId: 3n, amount: 100_000_000n });
    expect(c.proofBytes).toBeUndefined();
    expect(publicInputRows(c)).toEqual([{ label: "Mandate", value: "#3" }, { label: "Tier", value: "1" }]);
  });

  it("returns null for any other calldata", () => {
    expect(decodeProofCall(encodeFunctionData({ abi: advanceBookAbi, functionName: "pay", args: [offer(0).shopId, 1n] }))).toBeNull();
    expect(decodeProofCall("0xdeadbeef")).toBeNull();
  });
});

describe("device proof log (wraps the configured prover)", () => {
  it("logs every prove() with timing and size, persists to the vault, passes everything else through", async () => {
    const vault = new MemoryVault();
    const log = createProofLog(vault);
    const base = Object.assign(mockProver(), { warmup: async () => "warm" });
    const p = withProofLog(base, log, () => 1_800_000_000);
    expect(p.kind).toBe("mock");
    expect(await p.warmup()).toBe("warm");
    const res = await p.prove("standing_pass", { root: 1n, nullifier: 2n });
    expect(res.proof).toMatch(/^0x/);
    const [e] = await log.list();
    expect(e).toMatchObject({ circuit: "standing_pass", ok: true, proofBytes: 64, publicInputCount: res.publicInputs.length, at: 1_800_000_000, prover: "mock", verifiedLocally: null });
    // Survives a reload (a fresh log over the same vault), and holds no inputs.
    const again = await createProofLog(vault).list();
    expect(again).toHaveLength(1);
    expect(JSON.stringify(again)).not.toMatch(/nullifier|root/);
  });

  it("logs failures with a short code and rethrows", async () => {
    const log = createProofLog();
    const failing: Prover = { kind: "worker", poseidon2: async () => 0n, prove: async () => Promise.reject(Object.assign(new Error("x"), { code: "prover_failed" })) };
    await expect(withProofLog(failing, log).prove("business_pass", {})).rejects.toThrow("x");
    expect((await log.list())[0]).toMatchObject({ circuit: "business_pass", ok: false, error: "prover_failed", proofBytes: 0 });
  });

  it("fills verifiedLocally in the background when the prover can verify", async () => {
    const log = createProofLog();
    const verifying = Object.assign(mockProver(), { verify: async () => true });
    await withProofLog(verifying, log).prove("standing_pass", {});
    await new Promise((r) => setTimeout(r, 0));
    expect((await log.list())[0]!.verifiedLocally).toBe(true);
  });

  it("createMRA wraps its prover: proofs made through the SDK show up", async () => {
    const real: Prover = { kind: "worker", poseidon2: async () => 0n, prove: async () => ({ proof: PROOF, publicInputs: Array(5).fill("0x01") }) };
    const mra = createMRA({ mode: "mock", prover: real });
    await mra.raw.prover.prove("standing_pass", {});
    const v = await mra.protocol.proofCenter();
    expect(v.deviceProofs[0]).toMatchObject({ circuit: "standing_pass", proofBytes: 7_616, publicInputCount: 5, ok: true, prover: "worker" });
    expect(v.deviceProofs).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("the SDK's Offer type string is Policy.sol's OFFER_TYPEHASH preimage", () => {
    expect(OFFER_TYPE_STRING).toBe(
      "Offer(bytes32 offerId,bytes32 shopId,address recipient,uint256 amount,uint16 feeRateBpsPerWeek,uint16 feeCapBps,uint16 holdbackBps,uint8 tier,uint256 passNullifier,uint8 minRevenueBand,uint64 expiresAt)",
    );
    expect(keccak256(toHex(OFFER_TYPE_STRING))).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("transactions: at most N per kind, newest first", () => {
    const e = (i: number) => ({ args: { shopId: `0x7f3a${"00".repeat(30)}`, payer: "0x1", amount: 10_000_000n, repayment: 1_000_000n }, blockNumber: BigInt(100 - i), transactionHash: `0x${i}` as Hex, logIndex: 0 });
    const rows = pickPerKind([...Array.from({ length: 8 }, (_, i) => ({ n: "Sale", e: e(i) })), { n: "Swap", e: e(9) }], 3, 20);
    expect(rows.map((r) => r.n)).toEqual(["Sale", "Sale", "Sale", "Swap"]);
    const sale = txVM("Sale", e(0), "https://sepolia.etherscan.io", "2m ago");
    expect(sale).toMatchObject({ kind: "sale", title: "$10 to shop_7f3a", explorerUrl: "https://sepolia.etherscan.io/tx/0x0" });
    const swap = txVM("Swap", { ...e(1), args: { amount0: -80_000_000n, amount1: 78_560_000n } }, null, "now");
    expect(swap).toMatchObject({ kind: "swap", title: "Sold 80.00 DRIP for $78.56", explorerUrl: null });
  });

  it("AI summary counts red lines, Critic send-backs and agent actions", () => {
    const ai = aiFromSources({
      now: 1_800_000_000,
      risk: { at: 1_799_999_000, triggers: ["junior_twap_drop"], enforced: true },
      agentLog: [
        { ts: 1_799_990_000, action: "drew", code: "drew", summary: "Drew $100 for stock." },
        { ts: 1_799_980_000, action: "skipped", code: "active_advance", summary: "An advance is still open." },
      ],
      agentDraws: 1,
      decisions: [
        { id: "d1", at: 1_799_970_000, tier: 0, result: "declined", redlineHits: ["few_payers"], verdict: null, flags: [], clampChanges: 0 },
        { id: "d2", at: 1_799_960_000, tier: 1, result: "offered", redlineHits: [], verdict: "send_back", flags: ["payer_concentration"], clampChanges: 1, amount: 100 },
      ],
    });
    expect(ai.source).toBe("api");
    expect(ai.summary).toEqual({ offersMade: 1, refusedByRedLines: 1, criticSendBacks: 1, agentDraws: 1, agentSkips: 1, limitsLowered: 1 });
    expect(ai.latest.map((x) => x.actor)).toEqual(["risk_agent", "managed_agent", "managed_agent", "underwriter", "critic"]);
    expect(ai.latest[3]).toMatchObject({ outcome: "refused_red_line", reasonCodes: ["few_payers"] });
    expect(aiFromSources({ now: 0 }).source).toBe("unavailable");
  });
});
