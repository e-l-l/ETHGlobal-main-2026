/**
 * View-models: the ONLY types screens should depend on. Every SDK domain method returns one of these,
 * in every mode. Shapes mirror apps/web/src/lib/mock/* field-for-field, so a screen that reads the mock
 * today reads the view-model tomorrow with no visual change.
 *
 * Amounts: numbers are USD (merchant screens) or local currency where the name says so (`soldLocal`);
 * lender/public screens use display strings exactly like the mocks ("$310,000", "8.2%").
 */

/* ------------------------------------------------------------------ shared */

export type ActivityKind = "neutral" | "accent" | "warn" | "down";
/** apps/web's LossTier uses ReactNode; the SDK uses strings (render them as-is). */
export type LossTier = { title: string; description?: string; amount: string };
export type KV = { k: string; v: string };
export type Mode = "mock" | "local" | "sepolia";

/** Where a value came from, so a screen can show a "live" or "example data" badge. */
export type Source = "mock" | "chain" | "api" | "device";

export type ShopVM = {
  name: string;
  pseudonym: string;
  localCurrency: string;
  /** 1 USD in local currency. */
  usdToLocal: number;
};

export type AdvanceVM = {
  purpose: string;
  drawn: number;
  feeLabel: string;
  /** Deprecated aliases retained while the UI consumes the handoff migration. */
  fee: number;
  total: number;
  owedNow: number;
  feeSoFar: number;
  feeIfRepaidIn1Week: number;
  feeIfRepaidIn2Weeks: number;
  feeIfRepaidIn4Weeks: number;
  feeIfRepaidIn6Weeks: number;
  maxFeeBps: number;
  annualizedCostPercent: number;
  /** Late fee accrued so far (paid + unpaid), USD. 0 for on-time merchants. Already included in `owedNow`. */
  lateFee: number;
  /** Part of `lateFee` already paid (all of it went to the safety reserve). */
  lateFeePaid: number;
  /** Behind the minimum repayment (1% of principal + fee per 7 days): the late fee is accruing right now. */
  isBehind: boolean;
  /** Extra fee rate while behind (contract constant, 50 = 0.5%/week on top, 1%/week total). */
  lateFeeRateBpsPerWeek: number;
  /** Cap of the late fee on its own (300 = 3%; with the normal fee, 6% total). */
  maxLateFeeBps: number;
  /** The fee rule in the merchant's words. Show it next to the fee terms. */
  feeRule: string;
  /** One-line status when behind or a late fee was charged; null when on time with no late fee. */
  lateFeeHint: string | null;
  repaid: number;
  left: number;
  /** Percent of the total already repaid (0–100, rounded). */
  pct: number;
  /** Percent of each sale that goes to repayment. */
  holdback: number;
  drawnOn: string;
  drawnAt: string;
  /** Days to go at the current pace. */
  etaDays: number;
};

export type AgentLimitsVM = { perAdvance: number; perMonth: number; purpose: string };
export type LadderStepVM = { label: string; cap: number };
export type SaleVM = { id: string; total: number; time: string };
export type ActivityVM = { id: string; time: string; kind: ActivityKind; title: string; reason: string };

/* ------------------------------------------------------- merchant (Person A) */

export type TodayVM = {
  label: string;
  soldLocal: number;
  soldUsd: number;
  salesCount: number;
  toRepayment: number;
  weekUsd: number;
};

export type AgentSummaryVM = { lastDraw: number; lastDrawWhen: string; monthUsed: number };

/** One step of the gradual unlock: at `pct`% of the limit, `amount` USD (an allowed size) can be drawn. */
export type UnlockStepVM = { pct: number; amount: number; unlocked: boolean };

/**
 * World ID + gradual unlock, shared by Home, Advance details and the agent Approve dialog.
 * Real modes fill it from GET /shops/{id}/human (owner auth); on any failure: not verified, not banned, and
 * limit = availableNow = the tier cap (0 when unknown).
 */
export type HumanLimitVM = {
  /** A unique human (World ID) is bound to this shop. Required before the first offer. */
  humanVerified: boolean;
  /** This human defaulted on an earlier advance: no new advances on any of their shops. */
  banned: boolean;
  /** USD limit at the current tier. */
  limit: number;
  /** USD drawable right now under the gradual unlock (an allowed size, ≤ limit). */
  availableNow: number;
  /** unix seconds of the next +25% unlock; null when fully unlocked, frozen or unknown. */
  nextUnlockAt: number | null;
  unlockSteps: UnlockStepVM[];
};

/** Gradual-unlock detail (camelCase of the API's UnlockStatus). */
export type UnlockVM = {
  tier: number;
  limit: number;
  availableNow: number;
  /** 50..100 */
  unlockedPct: number;
  goodWeeks: number;
  frozen: boolean;
  nextUnlockAt: number | null;
  steps: UnlockStepVM[];
  reasons: string[];
};

/** `onboarding.humanStatus()`. `unlock` is null when the shop has no verified human (or the status is unknown). */
export type HumanStatusView = { humanVerified: boolean; banned: boolean; unlock: UnlockVM | null; source: Source };

export type HumanVerifyStep = "signing_owner" | "verifying_human" | "verified";
/**
 * `onboarding.verifyHuman()`. `reason` is the backend's stable code: verification_failed | wrong_action |
 * unknown_or_used_nonce | invalid_request | shop_bound_to_other_human | unauthorized | not_found | rate_limited.
 */
export type HumanVerifyResult = { verified: true } | { verified: false; reason: string };

/** M10 Home. */
export type HomeView = {
  shop: ShopVM;
  today: TodayVM;
  agentSummary: AgentSummaryVM;
  /** null when the shop has no open advance. */
  advance: AdvanceVM | null;
  agentLimits: AgentLimitsVM;
  limitsLadder: LadderStepVM[];
  currentTier: number;
  /** Local currency totals, newest first. Use `splitSale(total, advance.holdback)` for the split. */
  sales: SaleVM[];
  source: Source;
} & HumanLimitVM;

/** M11 Advance arrived. */
export type AdvanceArrivedView = { shop: ShopVM; advance: AdvanceVM; drawReasons: string[]; source: Source };

/** M12 Advance details. */
export type AdvanceDetailsView = {
  advance: AdvanceVM;
  repaymentCurve: { points: number[]; ariaLabel: string };
  daysLeftEstimates: { label: string; days: number }[];
  source: Source;
} & HumanLimitVM;

/** M13 Bad week. */
export type WeekView = {
  advance: AdvanceVM;
  week: {
    dayLabels: string[];
    days: { you: number; repay: number }[];
    ariaLabel: string;
    newEstimateDays: number;
  };
  source: Source;
};

/** M16 Repaid (Standing Pass + ladder). */
export type RepaidView = {
  currentTier: number;
  limitsLadder: LadderStepVM[];
  standingPass: {
    repaidCount: number;
    tier: number;
    claimed: boolean;
    /** Live: the shop's last advance is fully repaid and this device holds its unclaimed pass → show "Claim". */
    claimable?: boolean;
    /** Live: the per-advance cap the claim unlocks (USD). */
    nextCap?: number;
  };
  source: Source;
};

/** M16 claim progress: relayer inserts the leaf → find it in the whole tree → prove it privately on this device. */
export type ClaimStep = "claiming" | "finding_leaf" | "proving" | "done";

/** `merchant.claimStandingPass()` result. */
export type ClaimResult = {
  /** The relayed claimStandingPass tx; absent when the leaf was already inserted (e.g. by a retry). */
  txHash?: string;
  leafIndex: number;
  repaidCount: number;
  tier: number;
  /** The new per-advance limit (USD), from the onchain tierCap. */
  newCap: number;
  /** The private self-check proof (standing_pass over the whole downloaded tree), when a real prover ran it. */
  selfCheck?: { ms: number; proofBytes: number };
};

/** M17 Fresh shop (pseudonym rotation). */
export type FreshShopResult = {
  previous: string;
  shop: ShopVM;
  /** Mandates expire on rotation; the agent must be set up again under the new shop. */
  agentNeedsSetup: boolean;
  txHash?: string;
  source: Source;
};

/** M18 Cash out. */
export type CashOutView = {
  shop: ShopVM;
  available: number;
  destinations: { value: string; title: string; description: string }[];
  defaultDestination: string;
  source: Source;
};
export type CashOutResult = { amount: number; destination: string; status: "sent" | "simulated"; reference: string };

/** M21 My QR. */
export type MyQrView = { shop: ShopVM; today: TodayVM; payLink: string; howToPay: string[]; source: Source };

/** M19 Settings. */
export type SettingsView = {
  shop: ShopVM;
  agentStatus: AgentStatus;
  backup: { hasLocalPasses: boolean; businessPass: boolean; standingPass: boolean };
  network: NetworkInfo;
  source: Source;
};

/* ----------------------------------------------------------- agent (M07–M15) */

export type AgentStatus = "none" | "pending_approval" | "approved" | "denied" | "active" | "revoked" | "expired";

/** M07 Agent setup. */
export type AgentSetupView = {
  agentLimits: AgentLimitsVM;
  perAdvanceOptions: { value: number; lockedReason?: string }[];
  /** Live: the tier this device can prove right now (an unspent, claimed Standing Pass); caps above it are locked. */
  currentTier?: number;
  perMonthStepper: { step: number; min: number; max: number };
  purposes: string[];
  permissions: { can: string[]; never: string[] };
  source: Source;
};

/** M08 Approve (dialog). */
export type AgentApproveView = { advance: AdvanceVM; agentLimits: AgentLimitsVM; source: Source } & HumanLimitVM;

export type AgentSetupStep = "creating_agent" | "awaiting_agent_pass" | "proving_credential" | "registering_mandate" | "activating" | "done";

/** Result of `agent.setup(limits)`. `denied`/`expired` → route to M09. */
export type AgentSetupResult = {
  status: "active" | "denied" | "expired";
  agentId: string;
  mandateId?: string;
  txHash?: string;
  reason?: string;
};

/** M15 Manage agent. */
export type AgentStatusView = {
  status: AgentStatus;
  active: boolean;
  agentLimits: AgentLimitsVM;
  agentId?: string;
  mandateId?: string;
  mandateVerified?: boolean;
  expiry?: number;
  remainingAllowance?: number;
  source: Source;
};

/** M14 Agent log. */
export type AgentLogView = {
  agentLimits: AgentLimitsVM;
  agentSummary: AgentSummaryVM;
  stats: { draws: number; drawsSince: string; skipped: number; skippedReason: string };
  activity: ActivityVM[];
  source: Source;
};

export type AgentTriggerResult = { triggered: boolean; action?: string; code?: string; summary?: string };

/* ------------------------------------------------------ onboarding (M01–M06) */

export type ProveStep = "starting" | "waiting_for_portal" | "proof_received" | "issuing" | "registering" | "saved";
export type ProveFailReason = "too-new" | "suspended" | "revenue-low";

export type ProveSession = {
  /** Open on the phone / render as a QR for the Reclaim flow. */
  requestUrl: string;
  sessionId: string;
};

/** M04 Business Pass. */
export type BusinessPassView = {
  country: string;
  band: string;
  bandRange: string;
  months: string;
  facts: KV[];
  /** Onchain: only the commitment. */
  commitment: string;
  leafIndex?: number;
  txHash?: string;
  source: Source;
};

/** Result of `onboarding.proveBusiness(...)`: a pass (→ M04) or a failure (→ M05 ?reason=). */
export type ProveResult = { ok: true; pass: BusinessPassView } | { ok: false; reason: ProveFailReason | "error"; code: string };

/** M06 Create shop. */
export type ShopView = {
  name: string;
  id: string;
  initials: string;
  payLink: string;
  shopId?: string;
  payout?: string;
  txHash?: string;
  nameIdeas: string[];
  source: Source;
};

/* ------------------------------------------------------------ pay (C01–C02) */

/** C01 Pay. */
export type PayShopView = {
  name: string;
  id: string;
  initials: string;
  /** Wallet that pays (mock: WALLET). */
  wallet: string;
  source: Source;
};

/** C02 Paid (receipt). */
export type PayReceipt = {
  shopName: string;
  shopId: string;
  amount: number;
  toShop: number;
  toRepayment: number;
  txHash: string;
  wallet: string;
  at: number;
  source: Source;
};

/* ------------------------------------------------------- lender (L01–J03) */

/** Display strings, exactly like apps/web's VAULT. */
export type VaultVM = {
  apy: string;
  totalLent: string;
  tvl: string;
  senior: string;
  advancesOut: string;
  defaultRate: string;
  sharePrice: string;
  outstanding: string;
  repaid30d: string;
  writtenOff: string;
  junior: string;
  juniorCushion: string;
  juniorBalance: string;
  reserve: string;
  coverage: string;
  feeShareJunior: string;
  feeSplit: string;
  receivedShares: string;
  juniorPrice: string;
  juniorTwap: string;
  juniorBook: number;
  shopsActive: string;
  walletUsdc: string;
  walletJarJ: number;
  availableToWithdraw: string;
  positionShares: string;
  positionValue: string;
  positionEarned: string;
};

export type PositionRowVM = { id: string; when: string; action: string; amount: string; shares: string };
export type TradeRowVM = { id: string; time: string; side: string; amount: string; price: string };

/** L01 Earn. */
export type EarnView = { vault: VaultVM; feeSplit: KV[]; waterfall: [LossTier, LossTier, LossTier]; seniorSeries: number[]; source: Source };
/* ---------------------------------------------- lender risk panel (L01 / J01) */

/** A tone the screens map to their pills: ok (calm), watch (look at it), risk (act), none (no data yet). */
export type RiskTone = "ok" | "watch" | "risk" | "none";

/** Open advances by how long since their last repaying sale. Aggregate only: counts and principal, no shop ids. */
export type RepaymentBucketVM = {
  key: "on_track" | "slow" | "quiet";
  label: string;
  /** "a repaying sale in the last 7 days" etc. */
  rule: string;
  count: number;
  /** Unrepaid principal in this bucket. */
  principal: string;
  tone: RiskTone;
};

/** % of principal repaid by day N since draw, over advances at least N days old. `pct` null = no advance is old enough. */
export type CohortPointVM = { day: 7 | 14 | 30; pct: number | null; value: string; advances: number };

export type RiskPanelView = {
  /** Principal lost to write-offs ÷ total principal ever advanced. */
  defaultRate: { value: string; pct: number; lost: string; advanced: string; writeOffs: number; advances: number; note: string; tone: RiskTone };
  repayment: { open: number; buckets: [RepaymentBucketVM, RepaymentBucketVM, RepaymentBucketVM]; eligibleNow: number; note: string };
  cohort: { points: [CohortPointVM, CohortPointVM, CohortPointVM]; enough: boolean; note: string };
  /** (reserve + junior assets) ÷ outstanding. "—" with nothing outstanding. */
  coverage: { value: string; pct: number | null; cushion: string; outstanding: string; note: string; tone: RiskTone };
  /** The junior token's price on the RiskHook pool: what the market thinks. */
  market: {
    spot: string;
    twap1h: string;
    twap24h: string;
    book: string;
    /** "1.4% under book" / "at book" / "—". */
    vsBook: string;
    /** 1h TWAP vs 24h TWAP, "−1.2%" ("—" when the oracle has under 24h of history). */
    change1hVs24h: string;
    ratio: number | null;
    trigger: { threshold: number; state: "armed" | "fired" | "not_armed"; note: string };
    /** One plain sentence: what the price says. */
    read: string;
    tone: RiskTone;
  };
  /** The Risk agent: caps vs floors, and whether it lowered them recently. */
  agent: {
    tierCaps: { tier: number; cap: string; floor: string; was?: string; atFloor: boolean }[];
    recentlyLowered: boolean;
    lastChange: string;
    lastCheck: string;
    triggers: string[];
    from: "api" | "chain";
  };
  /** Contracts anyone can check these numbers against. `href` only on public networks. */
  contracts: { label: string; address: string; href?: string }[];
  /** Plain notes on what is estimated and why. */
  approximations: string[];
  source: Source;
};

/** One layer of the loss waterfall, in the order a loss hits it. */
export type WaterfallLayerVM = {
  key: "jar" | "junior" | "reserve" | "senior";
  title: string;
  description: string;
  amount: string;
  usd: number;
  /** True when the amount is an estimate rather than cash held onchain. */
  estimated: boolean;
  /** The viewer's own stake in this layer ("Your $2,541.40"), when there is one. */
  yours?: string;
};

export type WaterfallView = {
  layers: [WaterfallLayerVM, WaterfallLayerVM, WaterfallLayerVM, WaterfallLayerVM];
  /** Cash that absorbs a loss before any senior dollar: junior + reserve. */
  protection: string;
  protectionUsd: number;
  headline: string;
  sub: string;
  source: Source;
};

/** L02 Deposit / J02 Mint. */
export type DepositView = { vault: VaultVM; source: Source };
/** L03 Position. */
export type PositionView = {
  vault: VaultVM;
  positionRows: PositionRowVM[];
  positionActivity: { when: string; what: string; amount: string }[];
  seniorSeries: number[];
  source: Source;
};
/** J01 Junior. */
export type JuniorView = { vault: VaultVM; juniorSeries: number[]; writeOffIndex: number; waterfall: [LossTier, LossTier, LossTier]; source: Source };
/** J03 Trade. */
export type TradeView = { vault: VaultVM; juniorSeries: number[]; writeOffIndex: number; tradeRows: TradeRowVM[]; source: Source };

export type TxStep = { label: string; status: "pending" | "done" | "skipped"; hash?: string };
export type TxResult = { hash: string; steps: TxStep[]; simulated: boolean };

export type SwapSide = "buy" | "sell";
/**
 * J03 junior swap (Uniswap v4, DRIP/USDC pool with RiskHook). Amounts are token units (both 6 decimals);
 * prices are USDC per DRIP from the pool's slot0 before and after the swap.
 */
export type SwapResult = TxResult & {
  txHash: string;
  side: SwapSide;
  tokenIn: "USDC" | "DRIP";
  tokenOut: "USDC" | "DRIP";
  amountIn: number;
  amountOut: number;
  /** USDC the RiskHook took for the protocol reserve on this swap. */
  hookFeeUsdc: number;
  priceBefore: number;
  priceAfter: number;
  /** RiskHook TWAP ring-buffer size after the swap (it grows by one per block with a swap, up to 64). */
  observationCount?: number;
};

/* ------------------------------------------------------- protocol (P02–P04) */

export type TierCapVM = { tier: number; cap: string; was?: string };
export type SignalVM = { name: string; value: string; state: "ok" | "watch"; note: string };
/** `reasons`: the same text as bullet lines, when the source has them (mock); otherwise split `reason`. */
export type RiskLogVM = { time: string; title: string; kind: ActivityKind; reason: string; reasons?: string[] };

/** P02 Protocol. */
export type ProtocolView = { vault: VaultVM; feeSplit: KV[]; tierCaps: TierCapVM[]; waterfall: [LossTier, LossTier, LossTier]; source: Source };

/** P03 Risk. `raw` is GET /risk/status when live. */
export type RiskView = { signals: SignalVM[]; riskLog: RiskLogVM[]; tierCaps: TierCapVM[]; triggers: string[]; raw?: unknown; source: Source };

export type ExplorerEventVM = { kind: string; title: string; detail: string; hash: string; when: string };
export type ExplorerShopVM = { id: string; name: string; commitment: string; nullifier: string; note: string };
/** P04 Explorer. */
export type ExplorerView = { events: ExplorerEventVM[]; shops: ExplorerShopVM[]; source: Source };

/* ----------------------------------------------------------- world (P01) */

export type WorldStep = "onboarding" | "pass" | "shop" | "agent" | "advance" | "sale" | "repaid" | "fresh-shop";
/** P01 World view: what is public onchain vs private on this device. */
export type WorldView = { step: WorldStep; shop: ShopVM; public: KV[]; private: KV[]; source: Source };

/* ----------------------------------------------------------- recovery (M20) */

export type RecoveryStep = "verifying_human" | "fetching_backup" | "decrypting" | "restored" | "backing_up" | "backed_up";
export type RecoveryResult = { restored: boolean; hasBackup: boolean; keys: string[] };
export type BackupResult = { backedUp: boolean; bytes: number };

/* ------------------------------------------------------------- network */

export type NetworkInfo = {
  mode: Mode;
  chainId: number;
  /** "anon" when chain reads go through Anon-RPC. */
  rpc: "anon" | "direct" | "none";
  apiUrl?: string;
  issuerUrl?: string;
};

/** `mra.wallet.ensureFunded()`: whether this device's wallet can pay for its next transactions. */
export type FundStatus =
  /** Already had gas (and the USDC asked for). Nothing was requested. */
  | "ready"
  /** The demo faucet just sent gas ETH and / or test USDC. */
  | "funded"
  /** The faucet had already funded this address before (once per address). */
  | "already_funded"
  /** No faucet here (mock mode, mainnet, DEMO_FAUCET off, or faucet disabled in the config). */
  | "unavailable"
  /** The faucet refused for now (per-IP or daily budget). */
  | "limited";
export type FundResult = {
  status: FundStatus;
  address?: string;
  /** Balances after the call (wei / USDC dollars). */
  ethWei?: string;
  usdc?: number;
  txHashes?: string[];
};

/* ------------------------------------------- proof center ("Verify it yourself") */

/** One deployed contract, with its bytecode size read live (`getCode`) to prove it is really there. */
export type ProofCenterContractVM = {
  /** "AdvanceBook", "HonkVerifier", … (the deployment JSON key, or "DripCoin (JuniorVault)"). */
  name: string;
  /** Plain-English role, e.g. "Checks Standing Pass proofs (Noir / UltraHonk)". */
  role: string;
  address: string;
  /** Etherscan on Sepolia; null on the local devnet (use `explorer.appRoute`). */
  explorerUrl: string | null;
  /** Bytes of deployed code; 0 = nothing at that address; null = not read (mock or RPC error). */
  codeSize: number | null;
};

export type ProofPublicInputVM = { label: string; value: string };

export type ZkProofKind = "business_pass" | "standing_pass" | "pass_issued";

/** One proof (or credential issue) that happened onchain, decoded from the event and the tx input. */
export type ZkProofVM = {
  kind: ZkProofKind;
  /** The Noir circuit (business_pass / standing_pass) or, for a pass issue, the tree it joins. */
  circuit: "business_pass" | "standing_pass";
  /** Short headline: "First advance unlocked by a Business Pass proof". */
  title: string;
  /** The contract that checked it: HonkVerifier (standing_pass), BusinessPassVerifier (business_pass), or the registry / book for a pass issue. */
  verifier: { name: string; address: string; explorerUrl: string | null };
  /** AdvanceBook function the tx called: drawFirst | drawWithPass | drawByMandate | registerMandate | claimStandingPass | issue. */
  fn?: string;
  /** Length of the proof argument in bytes (7,616 for this UltraHonk build). Absent when the tx carries no proof. */
  proofBytes?: number;
  /** How many public inputs the verifier checked (5 standing_pass, 9 business_pass). */
  publicInputCount?: number;
  /** The key public inputs, shortened for display. */
  publicInputs?: ProofPublicInputVM[];
  /** The one-time nullifier this proof spent, shortened ("0x1a2b…9f0e"). */
  nullifierShort?: string;
  txHash: string;
  explorerUrl: string | null;
  block: number;
  /** Unix seconds. */
  at: number;
  /** "2m ago" / "Today" / "Nov 4". */
  when: string;
  /** Plain-English explanation for judges. */
  note: string;
};

/** A proof generated in THIS browser (every `prover.prove` call is logged; no inputs, no secrets). */
export type DeviceProofVM = {
  circuit: "business_pass" | "standing_pass";
  /** Wall-clock proving time on this device. */
  ms: number;
  proofBytes: number;
  publicInputCount: number;
  /** Unix seconds. */
  at: number;
  when: string;
  /** true/false = checked with the same bb.js verifier on this device; null = not checked here (the contract checks it on submit). */
  verifiedLocally: boolean | null;
  /** false when proving failed (then `error` is a short code, e.g. "witness_failed"). */
  ok: boolean;
  error?: string;
  /** "worker" (real Noir + bb.js in a Web Worker) or "mock" (fake bytes, mock mode). */
  prover: string;
};

export type ProofTxKind =
  | "sale"
  | "repayment_split"
  | "advance_opened"
  | "advance_repaid"
  | "advance_written_off"
  | "late_fee"
  | "mandate"
  | "swap"
  | "limits_changed"
  | "pass_issued"
  | "standing_pass"
  | "shop_registered";

export type ProofTxVM = {
  kind: ProofTxKind;
  title: string;
  detail: string;
  txHash: string;
  explorerUrl: string | null;
  block?: number;
  when: string;
};

export type AiActor = "underwriter" | "critic" | "managed_agent" | "risk_agent";

export type AiDecisionVM = {
  actor: AiActor;
  /** e.g. "offered", "declined", "send_back", "drew", "skipped", "lowered_limits", "calm". */
  outcome: string;
  title: string;
  /** Machine reason codes (red lines, Critic flags, agent codes): show with `reasonMessage(code)`. */
  reasonCodes: string[];
  reason: string;
  /** Unix seconds (0 when unknown). */
  at: number;
  when: string;
};

export type ProofCenterAiVM = {
  /** "api": agents API (risk status / this shop's agent log); "device": decisions this device received; "unavailable": nothing to show. */
  source: "mock" | "api" | "device" | "unavailable";
  summary: {
    offersMade: number;
    /** Refused in code by a red line, before any model ran. */
    refusedByRedLines: number;
    /** The Critic model sent the Underwriter's draft back (or rejected it). */
    criticSendBacks: number;
    agentDraws: number;
    agentSkips: number;
    /** Risk agent: last tick lowered limits (1) or not (0), plus onchain LimitsChanged in the window. */
    limitsLowered: number;
  };
  /** Newest first, at most 5. */
  latest: AiDecisionVM[];
  note: string;
};

export type PrivacyItemVM = { label: string; detail: string };

export type ProofCenterPrivacyVM = {
  /** What anyone can read onchain. */
  publicOnchain: PrivacyItemVM[];
  /** What is never stored anywhere (not onchain, not in our database). */
  neverStored: PrivacyItemVM[];
  /** What the AI agents see (numbers and hashed payers only). */
  aiSees: PrivacyItemVM[];
  /** What the AI never sees. */
  aiNeverSees: PrivacyItemVM[];
  /** What the SDK knows about chain reads. The browser's live Anon-RPC state (MRA_BROWSER_STATUS.anonRpc) is more precise: prefer it when present. */
  rpc: { mode: "anon" | "direct" | "none"; label: string; detail: string };
};

export type ProofCheckVM = {
  id: "contracts_have_code" | "offer_hash_matches" | "verifiers_wired" | "contracts_wired" | "pool_live" | "oracle_live";
  label: string;
  /** true = ✅, false = ❌, null = could not check (RPC error / mock). */
  ok: boolean | null;
  detail: string;
};

/** `mra.protocol.proofCenter()`: everything the "Proof center / Verify it yourself" screen shows. */
export type ProofCenterView = {
  network: { mode: Mode; chainId: number; name: string; block: number | null };
  explorer: { name: string; baseUrl: string | null; appRoute: string };
  contracts: ProofCenterContractVM[];
  zkProofs: ZkProofVM[];
  deviceProofs: DeviceProofVM[];
  /** Newest first, at most `perKind` rows of each kind (so 20 sales don't hide the rest). */
  transactions: ProofTxVM[];
  /** Every transaction found in the window, counted by kind (before the row limits). */
  transactionCounts: Partial<Record<ProofTxKind, number>>;
  ai: ProofCenterAiVM;
  privacy: ProofCenterPrivacyVM;
  checks: ProofCheckVM[];
  /** Section-level problems ("zkProofs: RPC timed out"); the rest of the view still renders. */
  errors: string[];
  /** Block window scanned for events (real modes). */
  window?: { fromBlock: number; toBlock: number };
  source: Source;
};

export type ProofCenterOptions = {
  /** Days of events to scan (from the deploy block at most). Default 3. */
  days?: number;
  /** Max zkProofs / transactions rows. Default 10 / 20. */
  limit?: number;
  txLimit?: number;
  /** Max transaction rows of one kind. Default 5. */
  perKind?: number;
  /** Device proofs to return. Default 5. */
  deviceLimit?: number;
  /** Skip the live checks (saves ~15 reads). Default false. */
  skipChecks?: boolean;
};
