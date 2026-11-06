"""Deterministic offer policy, using USDC base units throughout."""
from decimal import Decimal, InvalidOperation

from .models import ALLOWED_AMOUNTS, FACTOR_BPS_RANGE, HOLDBACK_BPS_RANGE, MAX_TIER, band_floor_daily_usd


def clamp_offer(draft, features, tier, limits, max_days):
    changes = []
    if tier < 0 or tier > MAX_TIER:
        return None, [f"Invalid tier: {tier}"]
    if draft.decision != "offer":
        return None, ["Draft declined"]
    factor = min(max(draft.factor_bps, FACTOR_BPS_RANGE[0]), FACTOR_BPS_RANGE[1])
    holdback = min(max(draft.holdback_bps, HOLDBACK_BPS_RANGE[0]), HOLDBACK_BPS_RANGE[1])
    if factor != draft.factor_bps:
        changes.append(f"Factor changed from {draft.factor_bps} to {factor} bps")
    if holdback != draft.holdback_bps:
        changes.append(f"Holdback changed from {draft.holdback_bps} to {holdback} bps")
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
                and Decimal(amount * factor) <= revenue * 1_000_000 * holdback * max_days]
    if not eligible:
        return None, changes + ["No allowed amount fits the tier cap, exposure and repayment window"]
    amount = max(eligible)
    if amount != draft.amount:
        changes.append(f"Amount changed from {draft.amount} to {amount} base units (size, caps or repayment window)")
    return draft.model_copy(update={"amount": amount, "factor_bps": factor, "holdback_bps": holdback}), changes
