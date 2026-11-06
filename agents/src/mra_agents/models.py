"""Shared data contracts between modules. Frozen (owned by the lead); request changes in your report.

Amounts are USDC base units (6 decimals) as int unless the name ends in `_usd` (float dollars, for judges).
"""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

ALLOWED_AMOUNTS: tuple[int, ...] = (50_000_000, 100_000_000, 200_000_000, 300_000_000)
FEE_RATE_BPS_PER_WEEK = 50
FEE_CAP_BPS = 300
# AdvanceBook contract constants (not in the signed Offer): while an advance is behind the minimum repayment
# (no 1% of principal+fee repaid for more than REPAY_WINDOW since lastSaleAt) an extra late fee accrues at
# LATE_FEE_RATE_BPS_PER_WEEK, capped at LATE_FEE_CAP_BPS on top of the normal cap. 100% goes to the reserve.
LATE_FEE_RATE_BPS_PER_WEEK = 50
LATE_FEE_CAP_BPS = 300
REPAY_WINDOW_SECONDS = 7 * 86_400
TIER_CAPS = (50_000_000, 100_000_000, 200_000_000, 300_000_000)
HOLDBACK_BPS_RANGE = (500, 2_000)
MAX_TIER = 3
MAX_REVENUE_BAND = 255  # Business Pass revenue band is a uint8
# Proven monthly revenue floor per Business Pass band (zkTLS predicate band_ge_k; see demo-portal summary).
BAND_MIN_MONTHLY_USD: dict[int, float] = {1: 500.0, 2: 2_000.0, 3: 10_000.0}


def band_floor_daily_usd(band: int | None) -> float:
    """Proven minimum average daily revenue for a band (0 when no band is proven)."""
    if not band:
        return 0.0
    return BAND_MIN_MONTHLY_USD[min(band, max(BAND_MIN_MONTHLY_USD))] / 30.0

Hex32 = Annotated[str, Field(pattern=r"^0x[0-9a-fA-F]{64}$")]
Address = Annotated[str, Field(pattern=r"^0x[0-9a-fA-F]{40}$")]


# ---------- chain-derived ----------

class SaleEvent(BaseModel):
    model_config = ConfigDict(frozen=True)
    shop_id: Hex32
    payer: Address  # raw address; hash before it reaches a model
    amount: int
    repayment: int
    block_number: int
    timestamp: int
    tx_hash: Hex32
    log_index: int


class ChainLimits(BaseModel):
    tier_cap: tuple[int, int, int, int]
    tier_cap_floor: tuple[int, int, int, int]
    max_exposure: int
    max_exposure_floor: int
    exposure: int  # senior.outstanding()


class AdvanceStatus(StrEnum):
    NONE = "none"
    ACTIVE = "active"
    REPAID = "repaid"
    WRITTEN_OFF = "written_off"


class AdvanceState(BaseModel):
    advance_id: int
    shop_id: Hex32
    principal: int
    total_owed: int
    repaid: int
    holdback_bps: int
    tier: int
    last_sale_at: int
    status: AdvanceStatus
    credential_claimed: bool
    opened_at: int | None = None
    principal_repaid: int = 0
    fee_paid: int = 0
    drawn_at: int = 0
    fee_rate_bps_per_week: int = FEE_RATE_BPS_PER_WEEK
    fee_cap_bps: int = FEE_CAP_BPS
    owed_now: int = 0
    fee_so_far: int = 0
    minimum_repayment: int = 0
    window_start: int = 0
    window_repaid: int = 0
    late_secs: int = 0  # settled seconds spent behind (getAdvance.lateSecs)
    late_fee: int = 0  # late fee accrued so far, paid + unpaid (AdvanceBook.lateFeeOf)
    late_fee_paid: int = 0
    is_behind: bool = False  # AdvanceBook.isBehind: the late fee is accruing right now


# ---------- features (input to judges) ----------

class ShopFeatures(BaseModel):
    """Everything a judge may know about a shop. Numbers + hashed payers only."""
    shop_id: Hex32
    as_of: int  # unix seconds
    days_active_30d: int
    revenue_7d_usd: float
    revenue_30d_usd: float
    revenue_90d_usd: float
    avg_daily_revenue_30d_usd: float
    daily_revenue_30d_usd: list[float]  # oldest -> newest, 30 entries
    revenue_cv_30d: float  # coefficient of variation of daily revenue
    trend_slope_30d: float  # least-squares slope of daily revenue, $/day per day
    sales_count_30d: int
    unique_payers_30d: int
    top_payer_share_30d: float  # 0..1
    hhi_payers_30d: float  # Herfindahl index of payer revenue shares, 0..1
    new_payer_share_30d: float  # share of payers first seen in last 7 days
    round_amount_share_30d: float  # share of sales that are whole dollars
    hour_of_day_entropy: float  # 0..1, normalised Shannon entropy of sale hours
    spike_ratio: float  # last-3-day revenue / avg 3-day revenue over prior 27 days
    funded_by_shop_share: float  # revenue share from payers funded by shop payout or one common funder (7d)
    first_time_payers_1h: int = 0
    median_payer_wallet_age_days: float | None = None
    top_payers_hashed: list[tuple[str, float]] = Field(default_factory=list)  # (hmac, revenue share), max 5
    shop_label: str | None = None  # untrusted, display only; judges must treat as data
    # Cold start: a tier-0 request backed by a Business Pass proof of revenue band k (enforced onchain at draw).
    proven_revenue_band: int | None = None
    cold_start: bool = False  # onchain history too thin to judge; underwrite on the proven band instead


# ---------- judge outputs (structured outputs) ----------

class OfferDraft(BaseModel):
    """Underwriter output. The clamp fixes anything out of bounds."""
    decision: Literal["offer", "decline"]
    amount: int  # must be one of ALLOWED_AMOUNTS
    fee_rate_bps_per_week: int = FEE_RATE_BPS_PER_WEEK
    fee_cap_bps: int = FEE_CAP_BPS
    holdback_bps: int = 800
    est_days_slow: int
    est_days_normal: int
    est_days_busy: int
    reasons_en: list[str] = Field(max_length=4)
    reasons_es: list[str] = Field(max_length=4)


class CriticFlag(BaseModel):
    code: str  # e.g. "payer_concentration", "circular_funding", "pre_application_spike"
    severity: Literal["info", "warn", "block"]
    evidence: str  # must cite feature names/values


class CriticVerdict(BaseModel):
    verdict: Literal["approve", "reject", "send_back"]
    flags: list[CriticFlag] = Field(default_factory=list)
    summary_en: str
    summary_es: str


class RiskProposal(BaseModel):
    new_tier_cap: tuple[int, int, int, int]
    new_max_exposure: int
    rationale: str


# ---------- onchain offer ----------

class Offer(BaseModel):
    """Mirrors the Solidity `Offer` struct field-for-field."""
    model_config = ConfigDict(frozen=True)
    offer_id: Hex32
    shop_id: Hex32
    recipient: Address
    amount: int
    fee_rate_bps_per_week: int
    fee_cap_bps: int
    holdback_bps: int
    tier: int
    pass_nullifier: int  # tier 0 manual draw: Business Pass first-advance nullifier; mandate draws and tier > 0: 0
    min_revenue_band: int = 0  # tier 0: minimum Business Pass revenue band the proof must meet; tier > 0: 0
    expires_at: int


class SignedOffer(BaseModel):
    offer: Offer
    signature: str  # 0x + 130 hex chars (r || s || v)
    digest: Hex32


# ---------- audit ----------

class Decision(BaseModel):
    decision_id: str
    created_at: int
    shop_id: Hex32
    tier: int
    features_hash: Hex32
    redline_hits: list[str]
    draft: OfferDraft | None
    verdict: CriticVerdict | None
    clamp_changes: list[str]
    result: Literal["offered", "declined", "rejected", "error"]
    signed_offer: SignedOffer | None = None
    model: str | None = None
    underwriter_model: str | None = None
    critic_model: str | None = None
