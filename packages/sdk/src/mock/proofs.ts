/**
 * Mock data for the Proof center screen (`mra.protocol.proofCenter()` in mock mode). Consistent with lend.ts
 * (explorer events, risk log), merchant.ts (agent activity: $100 drawn today for stock, advance repaid 22 Oct) and
 * shop.ts (shop_7f3a, tier 1). Addresses and code sizes are the real Sepolia deployment's; tx hashes are the mock
 * explorer's, so mock tx links are null (they would 404 on Etherscan).
 */
import type { DeviceProofVM, ProofCenterAiVM, ProofCheckVM, ProofTxKind, ProofTxVM, ZkProofVM } from "../viewmodels.js";

const SEPOLIA = {
  AdvanceBook: "0x76424347274b1ff54efa942d9d7adf668049b884",
  BusinessPassRegistry: "0x3dda9f1756c762c4089c36a31de21b1d6805aab5",
  HonkVerifier: "0x7764690108c612fafde5eeb1cbe2f20d80e42017",
  BusinessPassVerifier: "0xb79d40dcda63d941a31d866028d5d6852550136a",
} as const;
const scanAddr = (a: string) => `https://sepolia.etherscan.io/address/${a}`;

/** Deployed bytecode sizes (bytes), read from Sepolia with getCode. */
export const MOCK_CODE_SIZES: Record<string, number> = {
  AdvanceBook: 24_175,
  BusinessPassRegistry: 4_988,
  SeniorVault: 6_872,
  JuniorVault: 6_872,
  RiskHook: 7_044,
  HonkVerifier: 18_262,
  BusinessPassVerifier: 18_261,
  PoolManager: 24_009,
  USDC: 1_862,
};

/** UltraHonk (bb 6.0.0, evm target, log N = 13): both circuits' proofs are 238 words. */
export const PROOF_BYTES = 7_616;

export const mockZkProofs: ZkProofVM[] = [
  {
    kind: "standing_pass",
    circuit: "standing_pass",
    title: "Agent drew $100 under its mandate",
    verifier: { name: "HonkVerifier", address: SEPOLIA.HonkVerifier, explorerUrl: scanAddr(SEPOLIA.HonkVerifier) },
    fn: "drawByMandate",
    publicInputs: [
      { label: "Mandate", value: "#3" },
      { label: "Tier", value: "1" },
    ],
    txHash: "0x91c27a3e0b5f4c88d21e7a9f30c64b1d2e8f7a3e",
    explorerUrl: null,
    block: 12_081_204,
    at: 1_793_884_200,
    when: "1h ago",
    note: "No proof in this transaction: the shop's Standing Pass proof was checked once, when the mandate was registered. The contract still enforced the mandate's limits, recipient and expiry.",
  },
  {
    kind: "standing_pass",
    circuit: "standing_pass",
    title: "Repeat advance unlocked by a Standing Pass proof",
    verifier: { name: "HonkVerifier", address: SEPOLIA.HonkVerifier, explorerUrl: scanAddr(SEPOLIA.HonkVerifier) },
    fn: "drawWithPass",
    proofBytes: PROOF_BYTES,
    publicInputCount: 5,
    publicInputs: [
      { label: "Standing Pass root", value: "0x1d3c…7e20" },
      { label: "Nullifier (one-time)", value: "0x88aa…e901" },
      { label: "Tier proven", value: "1" },
      { label: "Next commitment", value: "0x0b77…41c9" },
      { label: "Context (binds recipient + offer)", value: "0x2f1a…08d3" },
    ],
    nullifierShort: "0x88aa…e901",
    txHash: "0x11de90aa47c2b8193044ee12aa90817263bc4410",
    explorerUrl: null,
    block: 12_080_377,
    at: 1_793_871_000,
    when: "Today",
    note: "The contract ran the Noir verifier on this proof; it would revert if the proof were fake. It proves 1 repaid advance without saying which shop repaid it.",
  },
  {
    kind: "pass_issued",
    circuit: "business_pass",
    title: "Business Pass issued to shop_7f3a",
    verifier: { name: "BusinessPassRegistry", address: SEPOLIA.BusinessPassRegistry, explorerUrl: scanAddr(SEPOLIA.BusinessPassRegistry) },
    fn: "issue",
    publicInputs: [
      { label: "Tree root after", value: "0x2a90…c4f1" },
      { label: "Leaf index", value: "4" },
      { label: "Business nullifier (one per real business)", value: "0x0e41…77ab" },
    ],
    nullifierShort: "0x0e41…77ab",
    txHash: "0x4c1e9a88b2d04f17c6aa0912e77b33d0a15f8c21",
    explorerUrl: null,
    block: 12_080_102,
    at: 1_793_867_400,
    when: "Today",
    note: "The issuer checked a zkTLS proof of the shop's sales on its portal, then signed. The registry checked that signature and stored only a commitment: no name, no sales figures.",
  },
  {
    kind: "pass_issued",
    circuit: "standing_pass",
    title: "Standing Pass claimed after repaying advance #2",
    verifier: { name: "AdvanceBook", address: SEPOLIA.AdvanceBook, explorerUrl: scanAddr(SEPOLIA.AdvanceBook) },
    fn: "claimStandingPass",
    publicInputs: [{ label: "New commitment", value: "0x0b77…41c9" }],
    txHash: "0x6f20b1d8c3a94e57b0a1d2c3e4f5a6b7c8d9e0f1",
    explorerUrl: null,
    block: 12_062_410,
    at: 1_792_687_500,
    when: "Oct 22",
    note: "Repaid in full, so the book added the next Standing Pass commitment (bound by the earlier proof) to its tree. Only a hash goes onchain.",
  },
  {
    kind: "business_pass",
    circuit: "business_pass",
    title: "First advance unlocked by a Business Pass proof",
    verifier: { name: "BusinessPassVerifier", address: SEPOLIA.BusinessPassVerifier, explorerUrl: scanAddr(SEPOLIA.BusinessPassVerifier) },
    fn: "drawFirst",
    proofBytes: PROOF_BYTES,
    publicInputCount: 9,
    publicInputs: [
      { label: "Business Pass root", value: "0x2a90…c4f1" },
      { label: "Nullifier (one-time)", value: "0x1b5e…a03d" },
      { label: "Minimum revenue band", value: "2" },
      { label: "Next commitment", value: "0x3c08…9b12" },
      { label: "Context (binds recipient + offer)", value: "0x05d7…e6a4" },
      { label: "Allowed countries", value: "AR, MX, BR, CO" },
    ],
    nullifierShort: "0x1b5e…a03d",
    txHash: "0x7d3a51c0e9b84f26a1d07c3e5b9f42a8d6e1c0b3",
    explorerUrl: null,
    block: 12_044_980,
    at: 1_791_195_600,
    when: "Oct 5",
    note: "The contract ran the Noir verifier on this proof; it would revert if the proof were fake. It proves revenue band ≥ 2, a supported country and business age, without revealing any of them.",
  },
];

export const mockDeviceProofs: DeviceProofVM[] = [
  { circuit: "standing_pass", ms: 2_840, proofBytes: PROOF_BYTES, publicInputCount: 5, at: 1_793_884_100, when: "1h ago", verifiedLocally: null, ok: true, prover: "worker" },
  { circuit: "business_pass", ms: 4_120, proofBytes: PROOF_BYTES, publicInputCount: 9, at: 1_791_195_480, when: "Oct 5", verifiedLocally: null, ok: true, prover: "worker" },
];

export const mockTransactions: ProofTxVM[] = [
  { kind: "sale", title: "$10.00 to shop_7f3a", detail: "$9.00 to the shop · $1.00 to its advance", txHash: "0x3b91c2e07d4a55f8a1c0e922b7d4416f0ae3c9d2", explorerUrl: null, when: "2m ago" },
  { kind: "repayment_split", title: "Repayment on advance #3: $1.00", detail: "$0.98 principal · fee $0.02 split senior / DRIP / reserve", txHash: "0x3b91c2e07d4a55f8a1c0e922b7d4416f0ae3c9d2", explorerUrl: null, when: "2m ago" },
  { kind: "advance_opened", title: "Vault → shop, $100", detail: "For stock. Paid to the shop's payout address", txHash: "0x91c27a3e0b5f4c88d21e7a9f30c64b1d2e8f7a3e", explorerUrl: null, when: "1h ago" },
  { kind: "swap", title: "Sold 80 DRIP for $78.56", detail: "Uniswap v4 DRIP/USDC pool · RiskHook recorded the price", txHash: "0x5e2b7c91d0a34f68b2c1d0e9f8a7b6c5d4e3f2a1", explorerUrl: null, when: "2h ago" },
  { kind: "limits_changed", title: "Limits changed", detail: "Tier caps $50 / $100 / $200 / $300", txHash: "0x8a4f2e6d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f", explorerUrl: null, when: "Today" },
  { kind: "advance_written_off", title: "Advance #1 written off", detail: "Loss $100: DRIP $100, reserve $0, vault $0", txHash: "0x2c9e8d7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d", explorerUrl: null, when: "Today" },
  { kind: "standing_pass", title: "Standing Pass used by shop_b19c", detail: "Nullifier spent. No onchain link to any earlier shop", txHash: "0x11de90aa47c2b8193044ee12aa90817263bc4410", explorerUrl: null, when: "Today" },
  { kind: "pass_issued", title: "Business Pass on shop_7f3a", detail: "Commitment only. No name, no sales figures", txHash: "0x4c1e9a88b2d04f17c6aa0912e77b33d0a15f8c21", explorerUrl: null, when: "Today" },
  { kind: "shop_registered", title: "shop_b19c created", detail: "A pseudonym and a payout address. Nothing else", txHash: "0x88aa01c2e91d44b7083319aa77c0de12f4b6e901", explorerUrl: null, when: "Today" },
  { kind: "late_fee", title: "Late fee on advance #1: $0.50", detail: "Behind the weekly minimum. 100% to the reserve", txHash: "0x9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c", explorerUrl: null, when: "Nov 2" },
  { kind: "mandate", title: "Agent mandate #3 registered", detail: "Tier 1. Limits checked onchain on every draw", txHash: "0xa1b2c3d4e5f60718293a4b5c6d7e8f9001122334", explorerUrl: null, when: "Oct 22" },
  { kind: "advance_repaid", title: "Advance #2 repaid", detail: "Fully repaid from sales", txHash: "0x6f20b1d8c3a94e57b0a1d2c3e4f5a6b7c8d9e0f1", explorerUrl: null, when: "Oct 22" },
];

export const mockTransactionCounts: Partial<Record<ProofTxKind, number>> = {
  sale: 22,
  repayment_split: 9,
  advance_opened: 3,
  swap: 4,
  limits_changed: 1,
  advance_written_off: 1,
  standing_pass: 1,
  pass_issued: 2,
  shop_registered: 3,
  late_fee: 1,
  mandate: 1,
  advance_repaid: 1,
};

export const mockAi: ProofCenterAiVM = {
  source: "mock",
  summary: { offersMade: 3, refusedByRedLines: 1, criticSendBacks: 1, agentDraws: 2, agentSkips: 1, limitsLowered: 1 },
  latest: [
    { actor: "risk_agent", outcome: "lowered_limits", title: "Limits reviewed at the $300 tier cap", reasonCodes: ["junior_twap_drop"], reason: "DRIP TWAP fell through $0.97 after a $100 write-off. Limits only move down, inside the preset band.", at: 1_793_889_660, when: "14:41" },
    { actor: "managed_agent", outcome: "drew", title: "Drew $100 for stock", reasonCodes: ["drew"], reason: "Sales up 12% this week; usual Monday restock; inside your limits.", at: 1_793_884_200, when: "today" },
    { actor: "critic", outcome: "send_back", title: "Critic sent the draft back", reasonCodes: ["payer_concentration"], reason: "One payer is 41% of sales. The Underwriter lowered the amount from $150 to $100.", at: 1_793_884_150, when: "today" },
    { actor: "managed_agent", outcome: "skipped", title: "Skipped a draw", reasonCodes: ["offer_declined"], reason: "Sales were 40% below normal. Waiting so repayment stays easy.", at: 1_793_617_200, when: "2 Nov" },
    { actor: "underwriter", outcome: "refused_red_line", title: "Refused by a red line", reasonCodes: ["few_active_days"], reason: "Fewer active sales days than the minimum. Refused in code before any model ran.", at: 1_793_530_800, when: "1 Nov" },
  ],
  note: "Red lines run in plain code before any model. A second model (the Critic) checks every draft. The signer clamps every offer to onchain limits.",
};

export const mockChecks: ProofCheckVM[] = [
  { id: "contracts_have_code", label: "All 9 contracts are deployed", ok: true, detail: "getCode returned bytecode for every address in the deployment file." },
  { id: "offer_hash_matches", label: "Offer signatures match the contract", ok: true, detail: "AdvanceBook.hashOffer and OFFER_TYPEHASH equal the SDK's EIP-712 Offer hash." },
  { id: "verifiers_wired", label: "The book uses the published verifiers", ok: true, detail: "AdvanceBook.verifier = HonkVerifier, bizVerifier = BusinessPassVerifier, businessPass = BusinessPassRegistry." },
  { id: "contracts_wired", label: "Vaults and hook point at the book", ok: true, detail: "AdvanceBook.senior / junior and RiskHook.book / poolManager match the deployment." },
  { id: "pool_live", label: "DRIP/USDC pool is live", ok: true, detail: "Uniswap v4 pool initialised, in-range liquidity > 0." },
  { id: "oracle_live", label: "RiskHook oracle has observations", ok: true, detail: "12 price observations recorded by the hook." },
];
