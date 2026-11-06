import pytest

from mra_agents.clamp import clamp_offer
from mra_agents.models import ChainLimits, OfferDraft, ShopFeatures


def features(revenue=1000):
    return ShopFeatures(shop_id="0x" + "11" * 32, as_of=1000, days_active_30d=30, revenue_7d_usd=7000, revenue_30d_usd=30000, revenue_90d_usd=90000, avg_daily_revenue_30d_usd=revenue, daily_revenue_30d_usd=[1000]*30, revenue_cv_30d=0, trend_slope_30d=0, sales_count_30d=30, unique_payers_30d=10, top_payer_share_30d=.1, hhi_payers_30d=.1, new_payer_share_30d=.1, round_amount_share_30d=.1, hour_of_day_entropy=.5, spike_ratio=1, funded_by_shop_share=0)


def draft(amount=100_000_000, holdback=800, decision="offer"):
    return OfferDraft(decision=decision, amount=amount, fee_rate_bps_per_week=50, fee_cap_bps=300, holdback_bps=holdback, est_days_slow=30, est_days_normal=20, est_days_busy=10, reasons_en=[], reasons_es=[])


def limits(cap=500_000_000, exposure=0, maximum=1_000_000_000):
    return ChainLimits(tier_cap=(cap,)*4, tier_cap_floor=(0,)*4, exposure=exposure, max_exposure=maximum, max_exposure_floor=0)


@pytest.mark.parametrize("amount,expected", [(49_999_999,None),(50_000_000,50_000_000),(50_000_001,50_000_000),(99_999_999,50_000_000),(100_000_000,100_000_000),(100_000_001,100_000_000),(300_000_001,300_000_000)])
def test_amount_boundaries(amount, expected):
    result, changes = clamp_offer(draft(amount), features(), 1, limits(), 60)
    assert (result.amount if result else None) == expected
    assert bool(changes) == (amount != expected)


@pytest.mark.parametrize("value", [499,500,501,1999,2000,2001])
def test_holdback_fixed(value):
    d = draft(holdback=value)
    result, changes = clamp_offer(d, features(), 1, limits(), 60)
    assert result.holdback_bps == 800
    assert bool(changes) == (value != 800)


@pytest.mark.parametrize("cap,exposure,maximum,expected", [(49_999_999,0,1_000_000_000,None),(50_000_000,0,1_000_000_000,50_000_000),(100_000_000,0,1_000_000_000,100_000_000),(300_000_000,900_000_001,1_000_000_000,50_000_000),(300_000_000,900_000_000,1_000_000_000,100_000_000),(300_000_000,900_000_000,949_999_999,None)])
def test_caps(cap, exposure, maximum, expected):
    result, _ = clamp_offer(draft(), features(), 1, limits(cap, exposure, maximum), 60)
    assert (result.amount if result else None) == expected


@pytest.mark.parametrize("revenue,expected", [(0,None),(-1,None),(float('nan'),None),(10,None)])
def test_anchor(revenue, expected):
    result, _ = clamp_offer(draft(50_000_000), features(revenue), 0, limits(), 50)
    assert (result.amount if result else None) == expected


def test_invalid_tier_and_decline():
    for tier in (-1, 4):
        assert clamp_offer(draft(), features(), tier, limits(), 60)[0] is None
    assert clamp_offer(draft(decision="decline"), features(), 0, limits(), 60)[0] is None
