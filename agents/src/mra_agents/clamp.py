"""Deterministic offer policy, using USDC base units throughout."""
from decimal import Decimal, InvalidOperation

from .models import ALLOWED_AMOUNTS, FEE_RATE_BPS_PER_WEEK, FEE_CAP_BPS, MAX_TIER, band_floor_daily_usd


def clamp_offer(draft, features, tier, limits, max_days):
    changes = []
    if tier < 0 or tier > MAX_TIER:
        return None, [f"Invalid tier: {tier}"]
    if draft.decision != "offer":
        return None, ["Draft declined"]
    rate, cap = FEE_RATE_BPS_PER_WEEK, FEE_CAP_BPS
    holdback = 800
    if (draft.fee_rate_bps_per_week, draft.fee_cap_bps) != (rate, cap):
        changes.append(f"Fee terms fixed at {rate} bps/week, capped at {cap} bps")
    if holdback != draft.holdback_bps:
        changes.append(f"Holdback fixed at {holdback} bps")
    try:
        # Pace = onchain 30-day average, floored by the zkTLS-proven band (cold start). The band is enforced
        # onchain at draw (minRevenueBand <= proven band), so it is a safe lower bound.
        observed = Decimal(str(features.avg_daily_revenue_30d_usd))
        floor = Decimal(str(band_floor_daily_usd(getattr(features, "proven_revenue_band", None))))
        revenue = max(observed, floor) if observed.is_finite() else observed
        if not revenue.is_finite() or revenue <= 0 or max_days <= 0:
            raise ValueError
    except (InvalidOperation, ValueError):
        return None, changes + ["No positive finite revenue or repayment window"]
    eligible = [amount for amount in ALLOWED_AMOUNTS if amount <= draft.amount
                and amount <= limits.tier_cap[tier]
                and amount + limits.exposure <= limits.max_exposure
                and Decimal(amount * 10_300) <= revenue * 1_000_000 * holdback * max_days]
    if not eligible:
        return None, changes + ["No allowed amount fits the tier cap, exposure and repayment window"]
    amount = max(eligible)
    if amount != draft.amount:
        changes.append(f"Amount changed from {draft.amount} to {amount} base units (size, caps or repayment window)")
    return draft.model_copy(update={"amount": amount, "fee_rate_bps_per_week": rate,
                                    "fee_cap_bps": cap, "holdback_bps": holdback}), changes
