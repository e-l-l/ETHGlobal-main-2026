/**
 * Agents API wire types: HAND-CHECKED against the FastAPI source
 *   agents/src/mra_agents/api.py         (offers, relay/*, shops/{id}/insights, decisions/{id}, risk/status, health)
 *   agents/src/mra_agents/agents_api.py  (agents/*, recovery/*)
 *   agents/src/mra_agents/models.py      (Decision, SignedOffer, ShopFeatures, ...)
 *   agents/src/mra_agents/merchant_agents.py + world.py (shapes of the untyped dict responses)
 *
 * `scripts/openapi.mjs` regenerates `openapi.gen.ts` from a running API; diff it against this file.
 * Amounts are USDC base units (6 decimals). Field elements / uint256 are `bigint | number` on input
 * (sent as exact JSON integers) and may come back as numbers or decimal strings.
 */

export type Hex = `0x${string}`;
export type Hex32 = Hex;
export type Address = Hex;
/** uint256 / field element. FastAPI StrictInt: send as a JSON integer (bigint is serialised exactly). */
export type UInt = bigint | number;

/* ----------------------------------------------------------------- models.py */

export type OfferDraft = {
  decision: "offer" | "decline";
  amount: number;
  factor_bps: number;
  holdback_bps: number;
  est_days_slow: number;
  est_days_normal: number;
  est_days_busy: number;
  reasons_en: string[];
  reasons_es: string[];
};

export type CriticFlag = { code: string; severity: "info" | "warn" | "block"; evidence: string };
export type CriticVerdict = { verdict: "approve" | "reject" | "send_back"; flags: CriticFlag[]; summary_en: string; summary_es: string };

/** Mirrors the Solidity `Offer` struct field-for-field. */
export type Offer = {
  offer_id: Hex32;
  shop_id: Hex32;
  recipient: Address;
  amount: number;
  factor_bps: number;
  holdback_bps: number;
  tier: number;
  pass_nullifier: UInt;
  min_revenue_band: number;
  expires_at: number;
};

export type SignedOffer = { offer: Offer; signature: Hex; digest: Hex32 };

export type Decision = {
  decision_id: string;
  created_at: number;
  shop_id: Hex32;
  tier: number;
  features_hash: Hex32;
  redline_hits: string[];
  draft: OfferDraft | null;
  verdict: CriticVerdict | null;
  clamp_changes: string[];
  result: "offered" | "declined" | "rejected" | "error";
  signed_offer: SignedOffer | null;
  model: string | null;
};

export type ShopFeatures = {
  shop_id: Hex32;
  as_of: number;
  days_active_30d: number;
  revenue_7d_usd: number;
  revenue_30d_usd: number;
  revenue_90d_usd: number;
  avg_daily_revenue_30d_usd: number;
  daily_revenue_30d_usd: number[];
  revenue_cv_30d: number;
  trend_slope_30d: number;
  sales_count_30d: number;
  unique_payers_30d: number;
  top_payer_share_30d: number;
  hhi_payers_30d: number;
  new_payer_share_30d: number;
  round_amount_share_30d: number;
  hour_of_day_entropy: number;
  spike_ratio: number;
  funded_by_shop_share: number;
  median_payer_wallet_age_days: number | null;
  top_payers_hashed: [string, number][];
  shop_label: string | null;
  proven_revenue_band: number | null;
  cold_start: boolean;
};

/* -------------------------------------------------------------------- api.py */

/** POST /offers. tier 0 manual draw: pass_nullifier + min_revenue_band; tier > 0: both 0. */
export type OfferRequest = {
  shop_id: Hex32;
  tier: 0 | 1 | 2 | 3;
  recipient: Address;
  pass_nullifier?: UInt;
  min_revenue_band?: number;
};

/** POST /relay/draw-first: Business Pass proof, context = keccak(recipient, offerId) % P. */
export type DrawFirstRequest = { signed_offer: SignedOffer; proof: Hex; root: UInt; commitment_next: UInt };

/** POST /relay/draw-with-pass: Standing Pass proof (tier ≥ 1). */
export type DrawWithPassRequest = { signed_offer: SignedOffer; proof: Hex; root: UInt; nullifier: UInt; commitment_next: UInt };

/** Seconds and USDC base units. max_per_period ≥ max_per_draw; 50e6 ≤ max_per_draw ≤ 500e6; 1d ≤ period ≤ 90d; expiry ≤ now + 180d. */
export type LimitsInput = { max_per_draw: UInt; max_per_period: UInt; period: number; expiry: number };

/** POST /relay/register-mandate. proof = business_pass (tier 0) or standing_pass (tier ≥ 1), context = mandateHash % P. */
export type RegisterMandateRequest = {
  shop_id: Hex32;
  agent_key: Address;
  recipient: Address;
  limits: LimitsInput;
  tier: 0 | 1 | 2 | 3;
  band?: number;
  proof: Hex;
  root: UInt;
  nullifier: UInt;
  commitment_next: UInt;
  attestation_nonce: UInt;
  attestation_expiry: number;
  attestation_signature: Hex;
  owner_signature: Hex;
};

export type TxResponse = { tx_hash: Hex32 };
export type InsightsResponse = { features: ShopFeatures; decision: Decision | null };
export type HealthResponse = { status: string };
/** POST /demo/faucet. eth_wei / fee_cap_wei are decimal strings; usdc is base units (6 decimals). */
export type FaucetResponse = {
  address: Address;
  eth_wei: string;
  usdc: number;
  eth_tx: Hex32 | null;
  usdc_tx: Hex32 | null;
  gas_per_tx: number;
  fee_cap_wei: string;
  txs: number;
};

export type RiskSignals = {
  as_of: number;
  twap?: {
    short_seconds: number;
    long_seconds: number;
    tick_1h?: number;
    tick_24h?: number;
    delta_ticks?: number;
    price_ratio_1h_vs_24h?: number;
    orientation?: string;
    fired: boolean;
  };
  write_offs?: { window_seconds: number; threshold: number; count_7d: number; advance_ids: number[]; fired: boolean };
  repayment_pace?: { threshold: number; median_ratio: number | null; n_measured: number; n_active: number; fired: boolean };
  exposure?: { threshold: number; exposure?: number; max_exposure?: number; utilisation?: number; fired: boolean };
  limits?: { tier_cap: number[]; tier_cap_floor: number[]; max_exposure: number; max_exposure_floor: number; exposure: number };
  triggers: string[];
  errors: string[];
  [k: string]: unknown;
};

export type RiskTick = {
  at: number;
  signals: RiskSignals;
  triggers: string[];
  proposal: { new_tier_cap: number[]; new_max_exposure: number; rationale?: string } | null;
  source: "judge" | "fallback" | null;
  enforced: { tier_cap: number[]; max_exposure: number } | null;
  tx_hash: Hex32 | null;
  skipped: string | null;
  error: string | null;
};

/** GET /risk/status. Trigger names: junior_twap_drop | write_offs_7d | repayment_pace | exposure_utilisation. */
export type RiskStatus = { signals: RiskSignals; triggers: string[]; last_tick: RiskTick | null };

/* -------------------------------------------------------------- agents_api.py */

export type AgentLimitsWire = { max_per_draw: number; max_per_period: number; period: number; expiry: number };

export type AgentStatusWire = "pending_approval" | "approved" | "denied" | "active" | "revoked" | "expired";

/** AgentRecord.public(): never key material or token hashes. */
export type AgentPublic = {
  id: string;
  shop_id: Hex32;
  agent_address: Address;
  limits: AgentLimitsWire;
  limits_hash: Hex32;
  tier: number;
  status: AgentStatusWire;
  mandate_id: string | null;
  mandate_verified: boolean;
  trigger_pending: boolean;
  created_at: number;
  updated_at: number;
};

/** POST /agents body. */
export type CreateAgentRequest = { shop_id: Hex32; tier: 0 | 1 | 2 | 3; recipient: Address; limits: LimitsInput };

/** POST /agents → 201. `manage_token` is returned ONCE: store it in the CredentialVault, never log it. */
export type CreateAgentResponse = AgentPublic & {
  manage_token: string;
  /** OIDC `nonce` to send to World for the Agent Pass (hex, no 0x). */
  agent_pass_nonce: string;
  /** What registerMandate needs: agentKey + limits (decimal strings) + limitsHash. */
  register: {
    agentKey: Address;
    limits: { maxPerDraw: string; maxPerPeriod: string; period: string; expiry: string };
    limitsHash: Hex32;
  };
};

/** POST /agents/{id}/agent-pass body (WORLD_MOCK=1: `{mock}`; real: OIDC code+PKCE or an id_token). */
export type AgentPassRequest =
  | { mock: "approve" | "deny" | "expire" }
  | { code: string; code_verifier: string; redirect_uri: string }
  | { id_token: string };

export type AgentPassAttestation = {
  attestation: { agentKey: Address; limitsHash: Hex32; nonce: string; expiry: number };
  limits: { maxPerDraw: string; maxPerPeriod: string; period: number; expiry: number };
  signature: Hex;
  digest: Hex32;
  attester: Address;
  chain_id: number;
  verifying_contract: Address;
};

export type AgentPassResponse =
  | ({ approved: true; reason: "approved" } & AgentPassAttestation)
  | { approved: false; reason: string; attestation: null };

export type ActivateRequest = { mandate_id: number | string; tx_hash?: Hex32 };

export type AgentDraw = { ts: number; amount: number; offer_id: string; tx_hash: string; decision_id: string | null };
export type AgentEvent = { ts: number; action: string; code: string; summary: string; details: Record<string, unknown> };

/** GET /agents/{id}, and the result of activate / revoke. `log` is newest first. */
export type AgentStatusResponse = AgentPublic & { draws: AgentDraw[]; log: AgentEvent[] };

export type TriggerRequest = { run_now?: boolean };
export type TriggerResponse = { triggered: boolean; tick: { action: string; code: string; summary: string } | null };

/** POST /recovery/verify body: the IDKit result forwarded as-is (WORLD_MOCK=1: `{mock:"approve", mock_human}`). */
export type RecoveryVerifyRequest = { idkit: Record<string, unknown> };
export type RecoveryVerifyResponse = { recovery_token: string; expires_at: number; has_backup: boolean };
/** PUT /recovery/backup → 204. Base64 of ≤ 64 KiB ciphertext. */
export type BackupRequest = { ciphertext: string };
export type BackupResponse = { ciphertext: string };

/** Every stable error code the agents API returns in `{"detail": code}`. */
export const AGENTS_API_ERROR_CODES = [
  "invalid_request",
  "invalid_limits",
  "unauthorized",
  "not_found",
  "rate_limited",
  "upstream_failed",
  "bad_state",
  "bad_mandate_id",
  "bad_mandate_expiry",
  "mandate_not_active",
  "mandate_agent_mismatch",
  "mandate_limits_mismatch",
  "attester_not_configured",
  "verification_failed",
  "wrong_action",
  "wrong_environment",
  "invalid_token",
  "token_expired",
  "bad_backup_size",
] as const;

/* -------------------------------------------------------------- issuer (Node) */

/** POST /issue body (issuer/README.md). h + country are required when ISSUER_REQUIRE_LEAF_CHECK is on (default). */
export type IssueRequest = { proof: unknown; commitment: Hex; band: 1 | 2 | 3; h?: Hex; country?: "AR" | "NG" | "KE" | number };
export type IssueResponse = { businessNullifier: Hex; commitment: Hex; expiresAt: number; signature: Hex };
export type IssuerInfo = {
  address: Address;
  chainId: number;
  registry: Address;
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  typehash: Hex32;
  attestationTtlSec: number;
  mock: boolean;
};
export type IssuerHealth = { ok: boolean; mode: "mock" | (string & {}); chainId: number };
/** `fresh`: a new fictional business per proof (new business nullifier), so demo onboarding can repeat. */
export type MockProofRequest = { account: string; commitment: Hex; band: 1 | 2 | 3; fresh?: boolean };

export const ISSUER_ERROR_CODES = [
  "bad_body",
  "bad_band",
  "bad_commitment",
  "bad_proof",
  "bad_h",
  "bad_country",
  "leaf_inputs_required",
  "proof_replayed",
  "proof_not_verified",
  "tee_not_verified",
  "context_mismatch",
  "commitment_mismatch",
  "predicate_failed:active",
  "predicate_failed:age_ok",
  "predicate_failed:country",
  "predicate_failed:band_ge_1",
  "predicate_failed:band_ge_2",
  "predicate_failed:band_ge_3",
  "proof_too_old",
  "proof_from_future",
  "wrong_provider_url",
  "account_id_missing",
  "wrong_app",
  "bad_parameters",
  "bad_context",
  "rate_limited",
] as const;
