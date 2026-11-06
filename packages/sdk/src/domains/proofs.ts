/**
 * Proof center ("Verify it yourself"): one call that gathers the evidence a judge can check for themselves.
 *
 *   const v = await mra.protocol.proofCenter();   // ProofCenterView
 *
 * - contracts:    every deployed contract, with its live bytecode size (getCode) and an explorer link
 * - zkProofs:     proofs the chain verified, decoded from the events AND the tx input (which draw function, proof size,
 *                 public inputs, which verifier ran it)
 * - deviceProofs: proofs generated in this browser (every prover.prove() is logged by adapters/proof-log.ts)
 * - transactions: recent DripMoney transactions by kind (the explorer() logs, plus repayments, late fees, mandates, swaps)
 * - ai:           recent agent decisions (risk agent, this shop's managed agent, offers this device received)
 * - privacy:      what is public, what is never stored, what the AI sees, and how chain reads are routed
 * - checks:       live, read-only ✅/❌ checks (code exists, offer hash matches, verifiers wired, pool + oracle live)
 *
 * Read-only. Each section fails on its own: an RPC error in one shows up in `errors`, the others still render.
 */
import { decodeFunctionData, hashTypedData, keccak256, toHex, type Hex } from "viem";
import { advanceBookAbi, businessPassRegistryAbi, riskHookAbi, trancheVaultAbi } from "../abi/index.js";
import type { Addr, LogEntry } from "../chain/chain.js";
import type { Deployment } from "../chain/deployments.js";
import { deploymentFor } from "../chain/deployments.js";
import { decodeSlot0, poolIdOf, poolKeyOf, poolManagerAbi, poolSlots } from "../chain/swap.js";
import type { Ctx } from "../context.js";
import * as MP from "../mock/proofs.js";
import { routes } from "../mock/routes.js";
import type {
  AiDecisionVM,
  DeviceProofVM,
  ProofCenterAiVM,
  ProofCenterContractVM,
  ProofCenterOptions,
  ProofCenterPrivacyVM,
  ProofCenterView,
  ProofCheckVM,
  ProofPublicInputVM,
  ProofTxKind,
  ProofTxVM,
  ZkProofVM,
} from "../viewmodels.js";
import { explorerLogs, explorerVM, PASS_EXPLORER_VM, type ExplorerLog } from "./protocol.js";
import { ago, dayLabel, etherscanFor, money, pseudonymOf, usd } from "./util.js";

const BLOCKS_PER_DAY = 7_200n;

/* ---------------------------------------------------------------- contracts */

/** The contracts a judge can check, in screen order: deployment key, display name, plain-English role. */
export const PROOF_CENTER_CONTRACTS: { key: keyof Deployment & string; name: string; role: string }[] = [
  { key: "AdvanceBook", name: "AdvanceBook", role: "The book: offers, draws, repayments and the Standing Pass tree. Calls the ZK verifiers on every draw." },
  { key: "BusinessPassRegistry", name: "BusinessPassRegistry", role: "Business Pass tree. Adds a pass only with the issuer's signature over a zkTLS-checked sales claim." },
  { key: "HonkVerifier", name: "HonkVerifier", role: "Noir UltraHonk verifier for Standing Pass proofs (repeat advances, agent mandates)." },
  { key: "BusinessPassVerifier", name: "BusinessPassVerifier", role: "Noir UltraHonk verifier for Business Pass proofs (first advance)." },
  { key: "SeniorVault", name: "SeniorVault", role: "Senior vault: USDC lenders, paid back first." },
  { key: "JuniorVault", name: "DripCoin (JuniorVault)", role: "DRIP, the junior tranche token: takes the first loss, earns more. Trades on Uniswap v4." },
  { key: "RiskHook", name: "RiskHook", role: "Uniswap v4 hook on the DRIP/USDC pool: a TWAP oracle the Risk agent reads, plus a fee to the reserve." },
  { key: "PoolManager", name: "PoolManager", role: "Uniswap v4 PoolManager (Uniswap's own deployment) holding the DRIP/USDC pool." },
  { key: "USDC", name: "USDC", role: "Test USDC (6 decimals) used for sales, advances and deposits." },
];

export function explorerBaseFor(chainId: number): string | null {
  return etherscanFor(chainId) ?? null;
}

export function contractRows(d: Deployment, codeSizes: Record<string, number | null> = {}): ProofCenterContractVM[] {
  const scan = explorerBaseFor(d.chainId);
  return PROOF_CENTER_CONTRACTS.map(({ key, name, role }) => {
    const address = String(d[key]);
    return { name, role, address, explorerUrl: scan ? `${scan}/address/${address}` : null, codeSize: codeSizes[key] ?? null };
  });
}

/* ---------------------------------------------------------- proof decoding */

/** "0x1a2b…9f0e" for a field element / hash. */
export function shortHash(v: bigint | string | undefined | null): string {
  if (v === undefined || v === null) return "—";
  const hex = typeof v === "bigint" ? `0x${v.toString(16).padStart(64, "0")}` : v;
  return hex.length <= 14 ? hex : `${hex.slice(0, 6)}…${hex.slice(-4)}`;
}

const ISO_NUMERIC: Record<number, string> = { 32: "AR", 76: "BR", 152: "CL", 170: "CO", 218: "EC", 356: "IN", 484: "MX", 604: "PE", 858: "UY", 840: "US" };
export const countryNames = (cs: readonly number[]) => cs.filter((c) => Number(c) > 0).map((c) => ISO_NUMERIC[Number(c)] ?? String(c)).join(", ") || "—";

const bytesOf = (h: unknown) => (typeof h === "string" && h.startsWith("0x") ? (h.length - 2) / 2 : 0);

/** What a proof-carrying AdvanceBook call contained, decoded from its calldata. */
export type DecodedProofCall = {
  fn: "drawFirst" | "drawWithPass" | "drawByMandate" | "registerMandate";
  circuit: "business_pass" | "standing_pass";
  /** Length of the proof argument (bytes). Undefined for drawByMandate (no proof in that tx). */
  proofBytes?: number;
  /** Public inputs the contract passes to the verifier (5 standing_pass, 9 business_pass incl. the 4 countries). */
  publicInputCount?: number;
  root?: bigint;
  nullifier?: bigint;
  commitmentNext?: bigint;
  tier: number;
  /** drawFirst: o.minRevenueBand; registerMandate tier 0: r.band. */
  minBand?: number;
  offerId?: Hex;
  shopId?: Hex;
  mandateId?: bigint;
  amount?: bigint;
};

/** Decode an AdvanceBook tx input. Returns null for any other function (or calldata that isn't AdvanceBook's). */
export function decodeProofCall(input: Hex): DecodedProofCall | null {
  let f: { functionName: string; args?: readonly unknown[] };
  try {
    f = decodeFunctionData({ abi: advanceBookAbi, data: input }) as never;
  } catch {
    return null;
  }
  const a = (f.args ?? []) as any[];
  switch (f.functionName) {
    case "drawFirst": {
      const [o, , proof, root, commitmentNext] = a;
      return {
        fn: "drawFirst", circuit: "business_pass", proofBytes: bytesOf(proof), publicInputCount: 9,
        root, nullifier: o.passNullifier, commitmentNext, tier: Number(o.tier), minBand: Number(o.minRevenueBand),
        offerId: o.offerId, shopId: o.shopId, amount: o.amount,
      };
    }
    case "drawWithPass": {
      const [o, , proof, root, nullifier, commitmentNext] = a;
      return {
        fn: "drawWithPass", circuit: "standing_pass", proofBytes: bytesOf(proof), publicInputCount: 5,
        root, nullifier, commitmentNext, tier: Number(o.tier), offerId: o.offerId, shopId: o.shopId, amount: o.amount,
      };
    }
    case "drawByMandate": {
      const [o, , mandateId] = a;
      return {
        fn: "drawByMandate", circuit: Number(o.tier) === 0 ? "business_pass" : "standing_pass",
        tier: Number(o.tier), offerId: o.offerId, shopId: o.shopId, mandateId, amount: o.amount,
        ...(Number(o.tier) === 0 ? { minBand: Number(o.minRevenueBand) } : {}),
      };
    }
    case "registerMandate": {
      const [r, p] = a;
      const tier = Number(r.tier);
      return {
        fn: "registerMandate", circuit: tier === 0 ? "business_pass" : "standing_pass", proofBytes: bytesOf(p.proof),
        publicInputCount: tier === 0 ? 9 : 5, root: p.root, nullifier: p.nullifier, commitmentNext: p.commitmentNext,
        tier, shopId: r.shopId, ...(tier === 0 ? { minBand: Number(r.band) } : {}),
      };
    }
    default:
      return null;
  }
}

/** Display rows for a decoded call's public inputs. */
export function publicInputRows(c: DecodedProofCall, countries?: readonly number[]): ProofPublicInputVM[] {
  if (c.fn === "drawByMandate") {
    return [
      { label: "Mandate", value: `#${c.mandateId?.toString() ?? "?"}` },
      { label: "Tier", value: String(c.tier) },
    ];
  }
  const rows: ProofPublicInputVM[] = [
    { label: c.circuit === "business_pass" ? "Business Pass root" : "Standing Pass root", value: shortHash(c.root) },
    { label: "Nullifier (one-time)", value: shortHash(c.nullifier) },
    c.circuit === "business_pass" ? { label: "Minimum revenue band", value: String(c.minBand ?? 0) } : { label: "Tier proven", value: String(c.tier) },
    { label: "Next commitment", value: shortHash(c.commitmentNext) },
    { label: c.fn === "registerMandate" ? "Context (binds the mandate)" : "Context (binds recipient + offer)", value: c.offerId ? `offer ${shortHash(c.offerId)}` : "mandate hash" },
  ];
  if (c.circuit === "business_pass") rows.push({ label: "Allowed countries", value: countries ? countryNames(countries) : "from the registry" });
  return rows;
}

const VERIFIED_NOTE = "The contract ran the Noir verifier on this proof; it would revert if the proof were fake.";

export function proofTitle(c: DecodedProofCall): string {
  switch (c.fn) {
    case "drawFirst":
      return "First advance unlocked by a Business Pass proof";
    case "drawWithPass":
      return "Repeat advance unlocked by a Standing Pass proof";
    case "registerMandate":
      return `Agent mandate registered with a ${c.circuit === "business_pass" ? "Business" : "Standing"} Pass proof`;
    case "drawByMandate":
      return `Agent drew ${c.amount !== undefined ? money(usd(c.amount)) : "an advance"} under its mandate`;
  }
}

export function proofNote(c: DecodedProofCall): string {
  switch (c.fn) {
    case "drawFirst":
      return `${VERIFIED_NOTE} It proves revenue band ≥ ${c.minBand ?? 0}, a supported country and business age, without revealing any of them.`;
    case "drawWithPass":
      return `${VERIFIED_NOTE} It proves ${c.tier} repaid advance${c.tier === 1 ? "" : "s"} without saying which shop repaid them.`;
    case "registerMandate":
      return `${VERIFIED_NOTE} One proof per mandate: the agent's later draws are checked against the mandate's limits instead.`;
    case "drawByMandate":
      return "No proof in this transaction: the shop's proof was checked once, when the mandate was registered. The contract still enforced the mandate's limits, recipient and expiry.";
  }
}

/* -------------------------------------------------------------- tx mapping */

const EXPLORER_KIND: Record<string, ProofTxKind> = {
  Sale: "sale",
  AdvanceOpened: "advance_opened",
  StandingPassClaimed: "standing_pass",
  ShopRegistered: "shop_registered",
  AdvanceWrittenOff: "advance_written_off",
  LimitsChanged: "limits_changed",
  Pass: "pass_issued",
};

const EXTRA_KIND: Record<string, ProofTxKind> = {
  RepaymentSplit: "repayment_split",
  AdvanceRepaid: "advance_repaid",
  LateFeePaid: "late_fee",
  MandateRegistered: "mandate",
  MandateRevoked: "mandate",
  Swap: "swap",
};
export const txKindOf = (n: string): ProofTxKind => EXPLORER_KIND[n] ?? EXTRA_KIND[n] ?? "sale";

/** Newest first, at most `perKind` of each kind, `limit` in all. */
export function pickPerKind<T extends { n: string }>(sorted: T[], perKind: number, limit: number): T[] {
  const seen: Record<string, number> = {};
  const out: T[] = [];
  for (const x of sorted) {
    const k = txKindOf(x.n);
    if ((seen[k] ?? 0) >= perKind) continue;
    seen[k] = (seen[k] ?? 0) + 1;
    out.push(x);
    if (out.length >= limit) break;
  }
  return out;
}

/** Book events the Proof center adds to the explorer's set. */
export const PROOF_CENTER_EXTRA_EVENTS = ["RepaymentSplit", "AdvanceRepaid", "LateFeePaid", "MandateRegistered", "MandateRevoked"] as const;

export function txVM(n: string, e: LogEntry, scan: string | null, when: string): ProofTxVM {
  const a = e.args;
  const link = scan ? `${scan}/tx/${e.transactionHash}` : null;
  const base = { txHash: e.transactionHash, explorerUrl: link, block: Number(e.blockNumber), when };
  switch (n) {
    case "RepaymentSplit": {
      const fee = (a.seniorFee ?? 0n) + (a.juniorFee ?? 0n) + (a.reserveFee ?? 0n) + (a.protocolFee ?? 0n);
      return { ...base, kind: "repayment_split", title: `Repayment on advance #${a.advanceId}: ${money(usd((a.principalPart ?? 0n) + fee))}`, detail: `${money(usd(a.principalPart ?? 0n))} principal · fee ${money(usd(fee))} split senior / DRIP / reserve` };
    }
    case "AdvanceRepaid":
      return { ...base, kind: "advance_repaid", title: `Advance #${a.id} repaid`, detail: `${pseudonymOf(a.shopId)} repaid in full from sales` };
    case "LateFeePaid":
      return { ...base, kind: "late_fee", title: `Late fee on advance #${a.advanceId}: ${money(usd(a.amount))}`, detail: "Behind the weekly minimum. 100% to the reserve" };
    case "MandateRegistered":
      return { ...base, kind: "mandate", title: `Agent mandate #${a.mandateId} registered`, detail: `${pseudonymOf(a.shopId)} · tier ${a.tier} · max ${money(usd(a.limits?.maxPerDraw ?? 0n))} per draw, enforced onchain` };
    case "MandateRevoked":
      return { ...base, kind: "mandate", title: `Agent mandate #${a.mandateId} revoked`, detail: "The agent can no longer draw" };
    case "Swap": {
      const a0 = BigInt(a.amount0 ?? 0n);
      const a1 = BigInt(a.amount1 ?? 0n);
      const abs = (x: bigint) => (x < 0n ? -x : x);
      // v4 Swap amounts are the swapper's deltas: negative = paid into the pool. currency0 = DRIP, currency1 = USDC.
      const title = a0 < 0n ? `Sold ${usd(abs(a0)).toFixed(2)} DRIP for ${money(usd(abs(a1)))}` : `Bought ${usd(abs(a0)).toFixed(2)} DRIP for ${money(usd(abs(a1)))}`;
      return { ...base, kind: "swap", title, detail: "Uniswap v4 DRIP/USDC pool · RiskHook recorded the price" };
    }
    default: {
      const vm = n === "Pass" ? { ...PASS_EXPLORER_VM, hash: e.transactionHash } : explorerVM(n, e);
      return { ...base, kind: txKindOf(n), title: vm.title, detail: vm.detail };
    }
  }
}

/* --------------------------------------------------------------------- AI */

const SEND_BACK = new Set(["send_back", "reject"]);

export function aiFromSources(src: {
  now: number;
  risk?: { at: number; triggers: string[]; enforced: boolean; skipped?: string | null; rationale?: string } | null;
  agentLog?: { ts: number; action: string; code: string; summary: string }[] | null;
  agentDraws?: number;
  decisions?: Ctx["decisionLog"];
  limitsChangedInWindow?: number;
}): ProofCenterAiVM {
  const items: AiDecisionVM[] = [];
  const when = (t: number) => (t ? dayLabel(t, src.now) : "");
  const summary = { offersMade: 0, refusedByRedLines: 0, criticSendBacks: 0, agentDraws: src.agentDraws ?? 0, agentSkips: 0, limitsLowered: src.limitsChangedInWindow ?? 0 };
  if (src.risk) {
    const r = src.risk;
    if (r.enforced) summary.limitsLowered = Math.max(summary.limitsLowered, 1);
    items.push({
      actor: "risk_agent",
      outcome: r.enforced ? "lowered_limits" : r.triggers.length ? "watching" : "calm",
      title: r.enforced ? "Risk agent lowered limits" : r.triggers.length ? "Risk agent is watching a signal" : "Risk agent: all signals calm",
      reasonCodes: [...r.triggers],
      reason: r.rationale ?? (r.triggers.length ? `Triggered by ${r.triggers.join(", ").replace(/_/g, " ")}${r.skipped ? ` (${r.skipped.replace(/_/g, " ")})` : ""}. Limits only move down.` : "No trigger fired. No limit change."),
      at: r.at,
      when: when(r.at),
    });
  }
  for (const e of src.agentLog ?? []) {
    if (/skip|declin/.test(e.action)) summary.agentSkips++;
    if (src.agentDraws === undefined && e.action === "drew") summary.agentDraws++;
    items.push({ actor: "managed_agent", outcome: e.action, title: e.summary.split(/[.;]/)[0] ?? e.action, reasonCodes: e.code ? [e.code] : [], reason: e.summary, at: e.ts, when: when(e.ts) });
  }
  for (const d of src.decisions ?? []) {
    if (d.result === "offered") summary.offersMade++;
    if (d.redlineHits.length) summary.refusedByRedLines++;
    if (d.verdict && SEND_BACK.has(d.verdict)) summary.criticSendBacks++;
    const redline = d.redlineHits.length > 0;
    const critic = !redline && d.verdict !== null && SEND_BACK.has(d.verdict);
    items.push({
      actor: critic ? "critic" : "underwriter",
      outcome: redline ? "refused_red_line" : critic ? (d.verdict as string) : d.result,
      title: redline ? "Refused by a red line" : critic ? (d.verdict === "send_back" ? "Critic sent the draft back" : "Critic rejected the draft") : d.result === "offered" ? `Offered ${d.amount !== undefined ? money(d.amount) : "an advance"}` : `Offer ${d.result}`,
      reasonCodes: redline ? d.redlineHits : d.flags,
      reason: redline ? "Refused in code before any model ran." : (d.summary ?? (d.clampChanges ? `The signer clamped ${d.clampChanges} term${d.clampChanges === 1 ? "" : "s"} to onchain limits.` : "")),
      at: d.at,
      when: when(d.at),
    });
  }
  items.sort((a, b) => b.at - a.at);
  const any = !!src.risk || !!src.agentLog?.length;
  return {
    source: any ? "api" : src.decisions?.length ? "device" : "unavailable",
    summary,
    latest: items.slice(0, 5),
    note: "Red lines run in plain code before any model. A second model (the Critic) checks every draft. The signer clamps every offer to onchain limits.",
  };
}

/* ---------------------------------------------------------------- privacy */

export function privacyVM(rpc: "anon" | "direct" | "none"): ProofCenterPrivacyVM {
  return {
    publicOnchain: [
      { label: "Shop pseudonym and payout address", detail: "A random bytes32 id (shown as shop_7f3a) and the wallet that receives sales. No name." },
      { label: "Sales and repayments", detail: "Each sale's amount and the payer's wallet, the share that went to the advance, and the fee split." },
      { label: "Advances", detail: "Amount, tier, fee terms and status of each advance." },
      { label: "Pass commitments and spent nullifiers", detail: "Hashes only. A nullifier shows a pass was used once; it can't be linked to the shop that earned it." },
      { label: "Vaults, DRIP price and risk limits", detail: "Deposits, the Uniswap v4 DRIP/USDC pool, and every limit change." },
    ],
    neverStored: [
      { label: "Your name, address and phone", detail: "Not onchain, not in our database. Nothing asks for them." },
      { label: "Your sales portal login and raw sales", detail: "The zkTLS proof shows a revenue band; the issuer keeps only a keyed hash of the account id (one pass per business)." },
      { label: "Your World ID nullifier", detail: "Never stored raw: only a keyed HMAC, with the shop ↔ human link encrypted. Nothing about World ID goes onchain." },
      { label: "Your pass secrets", detail: "They stay on this device (encrypted backup only if you make one). Proofs are generated here." },
    ],
    aiSees: [
      { label: "Sales numbers", detail: "Daily totals, counts, trend and volatility for this shop." },
      { label: "Hashed payers", detail: "Payer wallets as keyed hashes, with their share of sales (top 5), to spot one customer propping up a shop." },
      { label: "Proven revenue band", detail: "The band from the Business Pass, not the sales figures behind it." },
    ],
    aiNeverSees: [
      { label: "Names, free text, identity", detail: "The shop's display label is stripped before any model call." },
      { label: "World ID, pass secrets, keys", detail: "The agents only get numbers. Offers are clamped and signed by plain code." },
    ],
    rpc:
      rpc === "anon"
        ? { mode: "anon", label: "Anon-RPC on", detail: "Chain reads are relayed, so the RPC provider can't tie them to this device's IP." }
        : rpc === "direct"
          ? { mode: "direct", label: "Direct RPC", detail: "The RPC provider sees this device's IP. Trees are still downloaded whole, so it can't tell which pass is yours." }
          : { mode: "none", label: "No chain reads", detail: "Mock mode: example data, nothing leaves the device." },
  };
}

/* ----------------------------------------------------------------- checks */

/** The SDK's EIP-712 definition of AdvanceBook's `Offer` (must match Policy.sol OFFER_TYPEHASH field for field). */
export const OFFER_EIP712_TYPES = {
  Offer: [
    { name: "offerId", type: "bytes32" },
    { name: "shopId", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "feeRateBpsPerWeek", type: "uint16" },
    { name: "feeCapBps", type: "uint16" },
    { name: "holdbackBps", type: "uint16" },
    { name: "tier", type: "uint8" },
    { name: "passNullifier", type: "uint256" },
    { name: "minRevenueBand", type: "uint8" },
    { name: "expiresAt", type: "uint64" },
  ],
} as const;
export const OFFER_TYPE_STRING = `Offer(${OFFER_EIP712_TYPES.Offer.map((f) => `${f.type} ${f.name}`).join(",")})`;

/** A fixed sample offer for the hash check (never signed, never sent). */
export const SAMPLE_OFFER = {
  offerId: `0x${"11".repeat(32)}` as Hex,
  shopId: `0x${"22".repeat(32)}` as Hex,
  recipient: "0x3333333333333333333333333333333333333333" as Addr,
  amount: 100_000_000n,
  feeRateBpsPerWeek: 50,
  feeCapBps: 300,
  holdbackBps: 800,
  tier: 1,
  passNullifier: 7n,
  minRevenueBand: 0,
  expiresAt: 1_900_000_000n,
};

export function sdkOfferHash(chainId: number, book: Addr, o = SAMPLE_OFFER): Hex {
  return hashTypedData({ domain: { name: "AdvanceBook", version: "1", chainId, verifyingContract: book }, types: OFFER_EIP712_TYPES, primaryType: "Offer", message: o });
}

const eqAddr = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

async function liveChecks(ctx: Ctx, d: Deployment, contracts: ProofCenterContractVM[]): Promise<ProofCheckVM[]> {
  const chain = ctx.chain();
  const c = chain.client;
  const A = chain.addresses;
  const key = poolKeyOf(d);
  const poolId = poolIdOf(key);
  const slots = poolSlots(poolId);
  const rd = <T = any>(address: Addr, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []) =>
    (c.readContract({ address, abi, functionName, args } as never) as Promise<T>).catch(() => undefined);
  const [verifier, bizVerifier, businessPass, senior, junior, typehash, onchainHash, hookBook, hookPm, oracle, w0, wl, seniorAsset] = await Promise.all([
    rd(A.book, advanceBookAbi, "verifier"),
    rd(A.book, advanceBookAbi, "bizVerifier"),
    rd(A.book, advanceBookAbi, "businessPass"),
    rd(A.book, advanceBookAbi, "senior"),
    rd(A.book, advanceBookAbi, "junior"),
    rd<Hex>(A.book, advanceBookAbi, "OFFER_TYPEHASH"),
    rd<Hex>(A.book, advanceBookAbi, "hashOffer", [SAMPLE_OFFER]),
    rd(A.hook, riskHookAbi, "book"),
    rd(A.hook, riskHookAbi, "poolManager"),
    rd<readonly [number, number, number, boolean]>(A.hook, riskHookAbi, "oracleState", [poolId]),
    rd<Hex>(d.PoolManager as Addr, poolManagerAbi, "extsload", [slots.slot0]),
    rd<Hex>(d.PoolManager as Addr, poolManagerAbi, "extsload", [slots.liquidity]),
    rd(A.senior, trancheVaultAbi, "asset"),
  ]);
  const out: ProofCheckVM[] = [];

  const read = contracts.filter((x) => x.codeSize !== null);
  const missing = contracts.filter((x) => x.codeSize === 0).map((x) => x.name);
  out.push({
    id: "contracts_have_code",
    label: `All ${contracts.length} contracts are deployed`,
    ok: read.length < contracts.length && !missing.length ? null : missing.length === 0,
    detail: missing.length ? `No code at: ${missing.join(", ")}.` : read.length < contracts.length ? `Read ${read.length} of ${contracts.length}; the RPC did not answer for the rest.` : "getCode returned bytecode for every address in the deployment file.",
  });

  const sdkTypehash = keccak256(toHex(OFFER_TYPE_STRING));
  const sdkHash = sdkOfferHash(d.chainId, A.book);
  out.push({
    id: "offer_hash_matches",
    label: "Offer signatures match the contract",
    ok: typehash === undefined || onchainHash === undefined ? null : typehash === sdkTypehash && onchainHash === sdkHash,
    detail:
      typehash === undefined || onchainHash === undefined
        ? "Could not read AdvanceBook.hashOffer."
        : typehash === sdkTypehash && onchainHash === sdkHash
          ? `AdvanceBook.hashOffer and OFFER_TYPEHASH equal the SDK's EIP-712 Offer hash (${shortHash(sdkHash)}).`
          : `Mismatch: onchain ${shortHash(onchainHash)} vs SDK ${shortHash(sdkHash)}${typehash !== sdkTypehash ? " (typehash differs)" : ""}.`,
  });

  const vPairs: [string, unknown, string][] = [
    ["verifier → HonkVerifier", verifier, d.HonkVerifier],
    ["bizVerifier → BusinessPassVerifier", bizVerifier, d.BusinessPassVerifier],
    ["businessPass → BusinessPassRegistry", businessPass, d.BusinessPassRegistry],
  ];
  out.push(pairCheck("verifiers_wired", "The book uses the published verifiers", "AdvanceBook.verifier = HonkVerifier, bizVerifier = BusinessPassVerifier, businessPass = BusinessPassRegistry.", vPairs));

  const wPairs: [string, unknown, string][] = [
    ["AdvanceBook.senior → SeniorVault", senior, d.SeniorVault],
    ["AdvanceBook.junior → JuniorVault (DRIP)", junior, d.JuniorVault],
    ["RiskHook.book → AdvanceBook", hookBook, d.AdvanceBook],
    ["RiskHook.poolManager → PoolManager", hookPm, d.PoolManager],
    ["SeniorVault.asset → USDC", seniorAsset, d.USDC],
  ];
  out.push(pairCheck("contracts_wired", "Vaults and hook point at the book", "AdvanceBook.senior / junior, RiskHook.book / poolManager and the vault's asset match the deployment.", wPairs));

  if (w0 === undefined || wl === undefined) {
    out.push({ id: "pool_live", label: "DRIP/USDC pool is live", ok: null, detail: "Could not read the pool from PoolManager." });
  } else {
    const s = decodeSlot0(w0, wl);
    const price = (Number(s.sqrtPriceX96) / 2 ** 96) ** 2;
    out.push({
      id: "pool_live",
      label: "DRIP/USDC pool is live",
      ok: s.sqrtPriceX96 > 0n && s.liquidity > 0n,
      detail: s.sqrtPriceX96 === 0n ? "The pool is not initialised." : s.liquidity === 0n ? "Initialised, but no in-range liquidity." : `Uniswap v4 pool initialised, in-range liquidity ${s.liquidity.toString()}, DRIP ≈ $${price.toFixed(3)}.`,
    });
  }
  if (!oracle) {
    out.push({ id: "oracle_live", label: "RiskHook oracle has observations", ok: null, detail: "Could not read RiskHook.oracleState." });
  } else {
    const count = Number(oracle[1]);
    const init = Boolean(oracle[3]);
    out.push({ id: "oracle_live", label: "RiskHook oracle has observations", ok: init && count > 0, detail: init ? `${count} price observation${count === 1 ? "" : "s"} recorded by the hook (last tick ${oracle[2]}).` : "The hook has not seen this pool initialise." });
  }
  return out;
}

function pairCheck(id: ProofCheckVM["id"], label: string, okDetail: string, pairs: [string, unknown, string][]): ProofCheckVM {
  if (pairs.some(([, got]) => got === undefined)) return { id, label, ok: null, detail: "Could not read every address from the chain." };
  const bad = pairs.filter(([, got, want]) => !eqAddr(got, want));
  return { id, label, ok: bad.length === 0, detail: bad.length ? `Mismatch: ${bad.map(([n, got]) => `${n} (got ${String(got)})`).join("; ")}.` : okDetail };
}

/* ------------------------------------------------------------------ main */

function deviceVMs(entries: Awaited<ReturnType<Ctx["proofLog"]["list"]>>, now: number, n: number): DeviceProofVM[] {
  return entries.slice(0, n).map((e) => ({ ...e, when: ago(e.at, now) }));
}

async function section<T>(errors: string[], name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    errors.push(`${name}: ${(e as Error)?.message?.split("\n")[0] ?? "failed"}`);
    return fallback;
  }
}

export async function proofCenter(ctx: Ctx, opts: ProofCenterOptions = {}): Promise<ProofCenterView> {
  const now = ctx.now();
  const deviceLimit = opts.deviceLimit ?? 5;
  const net = ctx.network();
  const rpcMode = net.rpc;

  if (ctx.mode === "mock") {
    const logged = await ctx.proofLog.list();
    // Real proofs made in mock mode come from the mock prover (fake bytes): show the examples unless something else ran.
    const real = logged.filter((e) => e.prover !== "mock");
    const d = deploymentFor("sepolia");
    return ctx.mocked({
      network: { mode: "mock", chainId: d.chainId, name: "Sepolia (example data)", block: 12_081_250 },
      explorer: { name: "Etherscan", baseUrl: "https://sepolia.etherscan.io", appRoute: routes.explorer },
      contracts: contractRows(d, MP.MOCK_CODE_SIZES),
      zkProofs: MP.mockZkProofs.slice(0, opts.limit ?? 10),
      deviceProofs: real.length ? deviceVMs(real, now, deviceLimit) : MP.mockDeviceProofs.slice(0, deviceLimit),
      transactions: MP.mockTransactions.slice(0, opts.txLimit ?? 20),
      transactionCounts: MP.mockTransactionCounts,
      ai: MP.mockAi,
      privacy: privacyVM("none"),
      checks: opts.skipChecks ? [] : MP.mockChecks,
      errors: [],
      source: "mock" as const,
    });
  }

  const errors: string[] = [];
  /** Hand a finished part to `opts.onPartial`. A throwing listener must never break the read. */
  const emit = (part: Partial<ProofCenterView>) => {
    try {
      opts.onPartial?.(part);
    } catch {
      /* the listener's problem */
    }
  };
  const chain = ctx.chain();
  const d = chain.deployment;
  const scan = explorerBaseFor(d.chainId);
  const txLink = (h: string) => (scan ? `${scan}/tx/${h}` : null);
  const addrLink = (a: string) => (scan ? `${scan}/address/${a}` : null);

  const latest = await section(errors, "network", () => chain.blockNumber(), undefined as bigint | undefined);
  const networkVM = {
    mode: ctx.mode,
    chainId: d.chainId,
    name: d.chainId === 11_155_111 ? "Sepolia" : d.chainId === 31_337 ? "Local devnet" : `Chain ${d.chainId}`,
    block: latest === undefined ? null : Number(latest),
  };
  const explorerVM = scan ? { name: "Etherscan", baseUrl: scan, appRoute: routes.explorer } : { name: "In-app explorer", baseUrl: null, appRoute: routes.explorer };
  emit({ network: networkVM, explorer: explorerVM, privacy: privacyVM(rpcMode), source: "chain" });
  const deployBlock = BigInt(d.deployBlock);
  const span = BigInt(opts.days ?? 3) * BLOCKS_PER_DAY;
  const from = latest === undefined ? deployBlock : latest - span > deployBlock ? latest - span : deployBlock;

  // 1. contracts (getCode), in parallel with the event scan.
  const contractsP = section(
    errors,
    "contracts",
    async () => {
      const sizes: Record<string, number | null> = {};
      await Promise.all(
        PROOF_CENTER_CONTRACTS.map(async ({ key }) => {
          try {
            sizes[key] = await chain.codeSize(d[key] as Addr);
          } catch {
            sizes[key] = null;
          }
        }),
      );
      return contractRows(d, sizes);
    },
    contractRows(d),
  );
  void contractsP.then((contracts) => emit({ contracts }));

  // 2. events: one scan shared by zkProofs and transactions (explorer's set + extras), plus swaps and pass issues.
  const logsP: Promise<ExplorerLog[]> =
    latest === undefined ? Promise.resolve([]) : section(errors, "events", () => explorerLogs(ctx, from, latest, PROOF_CENTER_EXTRA_EVENTS), []);
  const issuedP: Promise<LogEntry[]> = latest === undefined ? Promise.resolve([]) : section(errors, "pass issues", () => chain.registryLogs("BusinessPassIssued", from), []);
  const swapsP: Promise<LogEntry[]> =
    latest === undefined
      ? Promise.resolve([])
      : section(errors, "swaps", () => chain.contractLogs(d.PoolManager as Addr, poolManagerAbi, "Swap", { id: poolIdOf(poolKeyOf(d)) }, from, latest), []);
  const countriesP = chain.countrySet().catch(() => undefined);

  const [contracts, logs, issued, swaps, countries] = await Promise.all([contractsP, logsP, issuedP, swapsP, countriesP]);
  const when = async (block: bigint) => {
    try {
      const t = await chain.blockTime(block);
      return { at: t, when: ago(t, now) };
    } catch {
      return { at: 0, when: `block ${block}` };
    }
  };

  // 3. zkProofs: decode the proof-carrying txs.
  const zkProofsP = section(
    errors,
    "zkProofs",
    async () => {
      type Cand = { kind: "call" | "issued" | "claimed"; e: LogEntry };
      const cands: Cand[] = [
        ...logs.filter((x) => x.n === "AdvanceOpened" || x.n === "MandateRegistered").map((x) => ({ kind: "call" as const, e: x.e })),
        ...logs.filter((x) => x.n === "StandingPassClaimed").map((x) => ({ kind: "claimed" as const, e: x.e })),
        ...issued.map((e) => ({ kind: "issued" as const, e })),
      ].sort((a, b) => Number(b.e.blockNumber - a.e.blockNumber) || b.e.logIndex - a.e.logIndex);
      const items = await Promise.all(
        cands.slice(0, opts.limit ?? 10).map(async ({ kind, e }): Promise<ZkProofVM | null> => {
          const t = await when(e.blockNumber);
          const base = { txHash: e.transactionHash, explorerUrl: txLink(e.transactionHash), block: Number(e.blockNumber), ...t };
          if (kind === "claimed") {
            return {
              ...base, kind: "pass_issued", circuit: "standing_pass", fn: "claimStandingPass",
              title: `Standing Pass claimed after repaying advance #${e.args.id}`,
              verifier: { name: "AdvanceBook", address: d.AdvanceBook, explorerUrl: addrLink(d.AdvanceBook) },
              publicInputs: [{ label: "New commitment", value: shortHash(e.args.commitment as bigint) }],
              note: "Repaid in full, so the book added the next Standing Pass commitment (bound by the earlier proof) to its tree. Only a hash goes onchain.",
            };
          }
          if (kind === "issued") {
            const rows: ProofPublicInputVM[] = [
              { label: "Tree root after", value: shortHash(e.args.root as bigint) },
              { label: "Leaf index", value: String(e.args.leafIndex) },
            ];
            let nullifierShort: string | undefined;
            try {
              const tx = await chain.client.getTransaction({ hash: e.transactionHash });
              const f = decodeFunctionData({ abi: businessPassRegistryAbi, data: tx.input }) as { functionName: string; args?: readonly any[] };
              if (f.functionName === "issue" && f.args?.[0]) {
                nullifierShort = shortHash(f.args[0].businessNullifier as bigint);
                rows.push({ label: "Business nullifier (one per real business)", value: nullifierShort });
              }
            } catch {
              /* the event alone is enough */
            }
            return {
              ...base, kind: "pass_issued", circuit: "business_pass", fn: "issue",
              title: "Business Pass issued",
              verifier: { name: "BusinessPassRegistry", address: d.BusinessPassRegistry, explorerUrl: addrLink(d.BusinessPassRegistry) },
              publicInputs: rows,
              ...(nullifierShort ? { nullifierShort } : {}),
              note: "The issuer checked a zkTLS proof of the shop's sales on its portal, then signed. The registry checked that signature and stored only a commitment: no name, no sales figures.",
            };
          }
          let decoded: DecodedProofCall | null = null;
          try {
            const tx = await chain.client.getTransaction({ hash: e.transactionHash });
            if (eqAddr(tx.to, d.AdvanceBook)) decoded = decodeProofCall(tx.input);
          } catch {
            /* fall through: event-only row */
          }
          if (!decoded) {
            return {
              ...base, kind: "standing_pass", circuit: "standing_pass",
              title: "Advance opened", verifier: { name: "AdvanceBook", address: d.AdvanceBook, explorerUrl: addrLink(d.AdvanceBook) },
              note: "Opened through a contract call this screen can't decode (e.g. a forwarder). Every AdvanceBook draw path checks a proof or a mandate.",
            };
          }
          const v = decoded.circuit === "business_pass" ? { name: "BusinessPassVerifier", address: d.BusinessPassVerifier } : { name: "HonkVerifier", address: d.HonkVerifier };
          return {
            ...base,
            kind: decoded.circuit,
            circuit: decoded.circuit,
            fn: decoded.fn,
            title: proofTitle(decoded),
            verifier: { ...v, explorerUrl: addrLink(v.address) },
            ...(decoded.proofBytes !== undefined ? { proofBytes: decoded.proofBytes } : {}),
            ...(decoded.publicInputCount !== undefined ? { publicInputCount: decoded.publicInputCount } : {}),
            publicInputs: publicInputRows(decoded, countries),
            ...(decoded.nullifier !== undefined ? { nullifierShort: shortHash(decoded.nullifier) } : {}),
            note: proofNote(decoded),
          };
        }),
      );
      return items.filter((x): x is ZkProofVM => x !== null);
    },
    [] as ZkProofVM[],
  );
  void zkProofsP.then((zkProofs) => emit({ zkProofs }));

  // 4. transactions: explorer() logs + extras + swaps, newest first.
  const transactionsP = section(
    errors,
    "transactions",
    async () => {
      const sorted: ExplorerLog[] = [...logs, ...swaps.map((e) => ({ n: "Swap", e }))].sort(
        (a, b) => Number(b.e.blockNumber - a.e.blockNumber) || b.e.logIndex - a.e.logIndex,
      );
      const rows = pickPerKind(sorted, opts.perKind ?? 5, opts.txLimit ?? 20);
      return Promise.all(rows.map(async ({ n, e }) => txVM(n, e, scan, (await when(e.blockNumber)).when)));
    },
    [] as ProofTxVM[],
  );
  const transactionCounts: Partial<Record<ProofTxKind, number>> = {};
  for (const x of [...logs.map((l) => l.n), ...swaps.map(() => "Swap")]) {
    const k = txKindOf(x);
    transactionCounts[k] = (transactionCounts[k] ?? 0) + 1;
  }

  void transactionsP.then((transactions) => emit({ transactions, transactionCounts }));

  // 5. device proofs.
  const deviceProofsP = ctx.proofLog.list().then((entries) => deviceVMs(entries, now, deviceLimit), () => deviceVMs([], now, deviceLimit));
  void deviceProofsP.then((deviceProofs) => emit({ deviceProofs }));

  // 6. AI.
  const aiP = section(
    errors,
    "ai",
    async () => {
      const limitsChangedInWindow = logs.filter((x) => x.n === "LimitsChanged").length;
      const s = await ctx.session().catch(() => ({}) as Awaited<ReturnType<Ctx["session"]>>);
      const hasApi = !!ctx.cfg.apiUrl;
      const [risk, agent] = await Promise.all([
        hasApi ? ctx.api().riskStatus().catch(() => undefined) : Promise.resolve(undefined),
        hasApi && s.agentId && s.manageToken ? ctx.api().getAgent(s.agentId, s.manageToken).catch(() => undefined) : Promise.resolve(undefined),
      ]);
      const tick = risk?.last_tick;
      return aiFromSources({
        now,
        risk: tick ? { at: tick.at, triggers: tick.triggers, enforced: !!(tick.enforced && tick.tx_hash), skipped: tick.skipped, ...(tick.proposal?.rationale ? { rationale: tick.proposal.rationale } : {}) } : null,
        agentLog: agent?.log ?? null,
        ...(agent ? { agentDraws: agent.draws.length } : {}),
        decisions: ctx.decisionLog,
        limitsChangedInWindow,
      });
    },
    aiFromSources({ now, decisions: ctx.decisionLog }),
  );
  void aiP.then((ai) => emit({ ai }));

  // 7. checks.
  const checksP = opts.skipChecks ? Promise.resolve([] as ProofCheckVM[]) : section(errors, "checks", () => liveChecks(ctx, d, contracts), [] as ProofCheckVM[]);
  void checksP.then((checks) => emit({ checks }));

  // The sections don't depend on each other, so they load side by side instead of one after another.
  const [zkProofs, transactions, deviceProofs, ai, checks] = await Promise.all([zkProofsP, transactionsP, deviceProofsP, aiP, checksP]);

  return {
    network: networkVM,
    explorer: explorerVM,
    contracts,
    zkProofs,
    deviceProofs,
    transactions,
    transactionCounts,
    ai,
    privacy: privacyVM(rpcMode),
    checks,
    errors,
    ...(latest !== undefined ? { window: { fromBlock: Number(from), toBlock: Number(latest) } } : {}),
    source: "chain",
  };
}
