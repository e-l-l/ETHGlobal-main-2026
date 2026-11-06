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
  fee: number;
  total: number;
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
};

/** M11 Advance arrived. */
export type AdvanceArrivedView = { shop: ShopVM; advance: AdvanceVM; drawReasons: string[]; source: Source };

/** M12 Advance details. */
export type AdvanceDetailsView = {
  advance: AdvanceVM;
  repaymentCurve: { points: number[]; ariaLabel: string };
  daysLeftEstimates: { label: string; days: number }[];
  source: Source;
};

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
  standingPass: { repaidCount: number; tier: number; claimed: boolean };
  source: Source;
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
  perMonthStepper: { step: number; min: number; max: number };
  purposes: string[];
  permissions: { can: string[]; never: string[] };
  source: Source;
};

/** M08 Approve (dialog). */
export type AgentApproveView = { advance: AdvanceVM; agentLimits: AgentLimitsVM; source: Source };

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
 * J03 junior swap (Uniswap v4, JAR-J/USDC pool with RiskHook). Amounts are token units (both 6 decimals);
 * prices are USDC per JAR-J from the pool's slot0 before and after the swap.
 */
export type SwapResult = TxResult & {
  txHash: string;
  side: SwapSide;
  tokenIn: "USDC" | "JAR-J";
  tokenOut: "USDC" | "JAR-J";
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
